*==============================================================================
* SYNCAPPEND.PRG  -  append web-app sync records into the live DBFs
*
* Called by the Node server (server/lib/vfpSync.js) as:
*     SYNCAPPEND.EXE -C<dir>\CONFIG.FPW "<job folder>"
*
* The job folder holds:
*   <TABLE>.DBF   one empty-structure clone per target table (same header as the
*                 main table), already filled with the new records by Node
*   JOB.TXT       instructions, one per line:
*                   DATA=<folder of the main DBFs>
*                   TABLE=<name>            (append order = line order)
*                   VRTABLE=<name>          table whose VR column numbers vouchers
*                   DUP=<table><TAB><key expr><TAB><filter expr>
*
* Voucher numbers: Node writes placeholders like "CR-#00001" (prefix, '#', seq).
* With all main tables locked, this program finds MAX(VR) per prefix in VRTABLE,
* gives each placeholder the next number and replaces it in every character
* field of every temp table (so links such as CD_VRNO follow along).
*
* Duplicates: for each DUP rule, the key of every temp row is checked against
* main rows matching the filter. Any hit aborts the whole job (nothing is
* appended) and the keys are reported, so Node can drop them and retry.
*
* Result: RESULT.TXT in the job folder
*   STATUS=OK | DUPLICATE | ERROR
*   MSG=<text>
*   DUP=<key>                  (one per duplicate)
*   VR=<placeholder>=<number>  (one per assigned voucher)
*   APPENDED=<table>=<count>
*==============================================================================
LPARAMETERS tcJobDir

SET TALK OFF
SET SAFETY OFF
SET DELETED ON
SET EXCLUSIVE OFF
SET EXACT OFF
SET NOTIFY OFF
SET RESOURCE OFF
SET CPDIALOG OFF
SET REPROCESS TO 1
SET MULTILOCKS ON
_SCREEN.Visible = .F.

PRIVATE pcResult, pcJob
pcResult = ""
pcJob = ALLTRIM(IIF(VARTYPE(tcJobDir) = "C", tcJobDir, ""))
pcJob = CHRTRAN(pcJob, ["], "")
IF RIGHT(pcJob, 1) = "\"
	pcJob = LEFT(pcJob, LEN(pcJob) - 1)
ENDIF

LOCAL loErr, lcStatus
lcStatus = "ERROR"
TRY
	IF EMPTY(pcJob) OR !DIRECTORY(pcJob)
		ERROR "Job folder not found: " + pcJob
	ENDIF
	lcStatus = RunJob()
CATCH TO loErr
	lcStatus = "ERROR"
	AddLine("MSG=" + TRANSFORM(loErr.Message) + " (line " + TRANSFORM(loErr.LineNo) + ;
		", error " + TRANSFORM(loErr.ErrorNo) + ")")
ENDTRY

UNLOCK ALL
CLOSE TABLES ALL
IF !EMPTY(pcJob) AND DIRECTORY(pcJob)
	STRTOFILE("STATUS=" + lcStatus + CHR(13) + CHR(10) + pcResult, pcJob + "\RESULT.TXT")
ENDIF
QUIT


*------------------------------------------------------------------------------
PROCEDURE AddLine(tcLine)
	pcResult = pcResult + tcLine + CHR(13) + CHR(10)
ENDPROC


*------------------------------------------------------------------------------
FUNCTION RunJob
	LOCAL lcData, lcVrTable, lnLines, lnI, lcLine, lcKey, lcVal, lnTables, lnDups
	LOCAL ARRAY laLines[1], laTables[1], laDups[1, 3]
	lcData = ""
	lcVrTable = ""
	lnTables = 0
	lnDups = 0

	lnLines = ALINES(laLines, FILETOSTR(pcJob + "\JOB.TXT"), 1)
	FOR lnI = 1 TO lnLines
		lcLine = laLines[lnI]
		IF EMPTY(lcLine) OR AT("=", lcLine) = 0
			LOOP
		ENDIF
		lcKey = UPPER(ALLTRIM(LEFT(lcLine, AT("=", lcLine) - 1)))
		lcVal = ALLTRIM(SUBSTR(lcLine, AT("=", lcLine) + 1))
		DO CASE
		CASE lcKey == "DATA"
			lcData = lcVal
		CASE lcKey == "TABLE"
			lnTables = lnTables + 1
			DIMENSION laTables[lnTables]
			laTables[lnTables] = UPPER(lcVal)
		CASE lcKey == "VRTABLE"
			lcVrTable = UPPER(lcVal)
		CASE lcKey == "DUP"
			lnDups = lnDups + 1
			DIMENSION laDups[lnDups, 3]
			laDups[lnDups, 1] = UPPER(ALLTRIM(GETWORDNUM(lcVal, 1, CHR(9))))
			laDups[lnDups, 2] = GETWORDNUM(lcVal, 2, CHR(9))
			laDups[lnDups, 3] = GETWORDNUM(lcVal, 3, CHR(9))
		ENDCASE
	ENDFOR

	IF EMPTY(lcData) OR lnTables = 0
		ERROR "JOB.TXT needs DATA= and at least one TABLE="
	ENDIF
	IF RIGHT(lcData, 1) = "\"
		lcData = LEFT(lcData, LEN(lcData) - 1)
	ENDIF

	*-- open every main table shared and every temp table exclusive
	LOCAL lcTbl
	FOR lnI = 1 TO lnTables
		lcTbl = laTables[lnI]
		USE (lcData + "\" + lcTbl) ALIAS ("M_" + lcTbl) SHARED AGAIN IN 0
		USE (pcJob + "\" + lcTbl) ALIAS ("T_" + lcTbl) EXCLUSIVE IN 0
	ENDFOR

	*-- lock all main tables together (desktop users may hold record locks)
	IF !LockAll(@laTables, lnTables, 120)
		ERROR "Could not lock the main tables within 120 seconds (in use by another program?)"
	ENDIF

	*-- duplicate check: abort the whole job on any hit
	LOCAL lnFound
	lnFound = 0
	FOR lnI = 1 TO lnDups
		lnFound = lnFound + CheckDup(laDups[lnI, 1], laDups[lnI, 2], laDups[lnI, 3])
	ENDFOR
	IF lnFound > 0
		AddLine("MSG=" + TRANSFORM(lnFound) + " duplicate record(s) already in the main tables; nothing appended")
		RETURN "DUPLICATE"
	ENDIF

	*-- assign voucher numbers to placeholders
	IF !EMPTY(lcVrTable)
		AssignVr(lcVrTable, @laTables, lnTables)
	ENDIF

	*-- append, in job order; temp tables are closed first so APPEND FROM can open them
	LOCAL lnBefore, lnNew
	FOR lnI = 1 TO lnTables
		lcTbl = laTables[lnI]
		USE IN ("T_" + lcTbl)
	ENDFOR
	FOR lnI = 1 TO lnTables
		lcTbl = laTables[lnI]
		USE (pcJob + "\" + lcTbl) ALIAS TCOUNT IN 0 SHARED NOUPDATE
		lnNew = RECCOUNT("TCOUNT")
		USE IN ("TCOUNT")
		IF lnNew = 0
			AddLine("APPENDED=" + lcTbl + "=0")
			LOOP
		ENDIF
		SELECT ("M_" + lcTbl)
		lnBefore = RECCOUNT()
		APPEND FROM (pcJob + "\" + lcTbl)
		FLUSH
		IF RECCOUNT() - lnBefore != lnNew
			ERROR lcTbl + ": expected " + TRANSFORM(lnNew) + " new records, appended " + TRANSFORM(RECCOUNT() - lnBefore)
		ENDIF
		AddLine("APPENDED=" + lcTbl + "=" + TRANSFORM(lnNew))
	ENDFOR

	AddLine("MSG=OK")
	RETURN "OK"
ENDFUNC


*------------------------------------------------------------------------------
FUNCTION LockAll(taTables, tnCount, tnSeconds)
	EXTERNAL ARRAY taTables
	LOCAL lnStart, lnI, llAll
	lnStart = SECONDS()
	DO WHILE .T.
		llAll = .T.
		FOR lnI = 1 TO tnCount
			IF !FLOCK("M_" + taTables[lnI])
				llAll = .F.
				EXIT
			ENDIF
		ENDFOR
		IF llAll
			RETURN .T.
		ENDIF
		UNLOCK ALL
		IF SECONDS() - lnStart > tnSeconds
			RETURN .F.
		ENDIF
		=INKEY(0.5, "H")
	ENDDO
ENDFUNC


*------------------------------------------------------------------------------
* Returns the number of temp keys that already exist in the main table.
FUNCTION CheckDup(tcTbl, tcKeyExpr, tcFilter)
	LOCAL lcKey, lnHits
	lnHits = 0
	IF EMPTY(tcFilter)
		tcFilter = ".T."
	ENDIF

	CREATE CURSOR C_TKEYS (K C(80))
	INDEX ON K TAG K

	SELECT ("T_" + tcTbl)
	SCAN FOR &tcFilter
		lcKey = PADR(EVALUATE(tcKeyExpr), 80)
		IF !SEEK(lcKey, "C_TKEYS", "K")
			APPEND BLANK IN ("C_TKEYS")
			REPLACE K WITH lcKey IN ("C_TKEYS")
			SELECT ("T_" + tcTbl)
		ENDIF
	ENDSCAN
	IF RECCOUNT("C_TKEYS") = 0
		USE IN ("C_TKEYS")
		RETURN 0
	ENDIF

	CREATE CURSOR C_HITS (K C(80))
	INDEX ON K TAG K
	SELECT ("M_" + tcTbl)
	SCAN FOR &tcFilter
		lcKey = PADR(EVALUATE(tcKeyExpr), 80)
		IF SEEK(lcKey, "C_TKEYS", "K") AND !SEEK(lcKey, "C_HITS", "K")
			APPEND BLANK IN ("C_HITS")
			REPLACE K WITH lcKey IN ("C_HITS")
			SELECT ("M_" + tcTbl)
			AddLine("DUP=" + ALLTRIM(lcKey))
			lnHits = lnHits + 1
		ENDIF
	ENDSCAN
	USE IN ("C_TKEYS")
	USE IN ("C_HITS")
	RETURN lnHits
ENDFUNC


*------------------------------------------------------------------------------
FUNCTION IsPlaceholder(tcVal)
	RETURN VARTYPE(tcVal) = "C" AND LEN(ALLTRIM(tcVal)) = 9 ;
		AND SUBSTR(ALLTRIM(tcVal), 3, 2) == "-#" AND ISDIGIT(SUBSTR(ALLTRIM(tcVal), 5, 1))
ENDFUNC


*------------------------------------------------------------------------------
PROCEDURE AssignVr(tcVrTable, taTables, tnCount)
	EXTERNAL ARRAY taTables
	LOCAL lnI, lnF, lnFields, lcAlias, lcField, lcVal, lcPfx, lnMax, lcNew
	LOCAL ARRAY laF[1]

	CREATE CURSOR C_PH (P C(9), PFX C(3), NEWVR C(9))
	INDEX ON P TAG P

	*-- collect placeholders from every character field of every temp table
	FOR lnI = 1 TO tnCount
		lcAlias = "T_" + taTables[lnI]
		lnFields = AFIELDS(laF, lcAlias)
		SELECT (lcAlias)
		SCAN
			FOR lnF = 1 TO lnFields
				IF laF[lnF, 2] = "C" AND laF[lnF, 3] >= 9
					lcVal = EVALUATE(lcAlias + "." + laF[lnF, 1])
					IF IsPlaceholder(lcVal) AND !SEEK(PADR(ALLTRIM(lcVal), 9), "C_PH", "P")
						APPEND BLANK IN ("C_PH")
						REPLACE P WITH ALLTRIM(lcVal), PFX WITH LEFT(ALLTRIM(lcVal), 3) IN ("C_PH")
						SELECT (lcAlias)
					ENDIF
				ENDIF
			ENDFOR
		ENDSCAN
	ENDFOR
	IF RECCOUNT("C_PH") = 0
		RETURN
	ENDIF

	*-- next number per prefix, from the locked main voucher table
	*   (C_PH is in P order, so each prefix's placeholders come together)
	lcPfx = ""
	lnMax = 0
	SELECT ("C_PH")
	SET ORDER TO P
	SCAN
		IF !(C_PH.PFX == lcPfx)
			lcPfx = C_PH.PFX
			lnMax = 0
			SELECT ("M_" + tcVrTable)
			CALCULATE MAX(VAL(SUBSTR(VR, 4))) FOR LEFT(VR, 3) == lcPfx AND SUBSTR(VR, 4, 1) != "#" TO lnMax
			lnMax = NVL(lnMax, 0)
			SELECT ("C_PH")
		ENDIF
		lnMax = lnMax + 1
		REPLACE NEWVR WITH lcPfx + PADL(TRANSFORM(lnMax), 6, "0") IN ("C_PH")
		AddLine("VR=" + ALLTRIM(C_PH.P) + "=" + C_PH.NEWVR)
	ENDSCAN

	*-- write the real numbers into the temp tables
	FOR lnI = 1 TO tnCount
		lcAlias = "T_" + taTables[lnI]
		lnFields = AFIELDS(laF, lcAlias)
		SELECT (lcAlias)
		SCAN
			FOR lnF = 1 TO lnFields
				IF laF[lnF, 2] = "C" AND laF[lnF, 3] >= 9
					lcField = laF[lnF, 1]
					lcVal = EVALUATE(lcAlias + "." + lcField)
					IF IsPlaceholder(lcVal) AND SEEK(PADR(ALLTRIM(lcVal), 9), "C_PH", "P")
						lcNew = C_PH.NEWVR
						REPLACE (lcField) WITH lcNew IN (lcAlias)
					ENDIF
				ENDIF
			ENDFOR
		ENDSCAN
	ENDFOR
	USE IN ("C_PH")
ENDPROC

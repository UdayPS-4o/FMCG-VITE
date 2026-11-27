"""Build SYNCAPPEND.EXE from SYNCAPPEND.PRG through the VFP9 COM server (no IDE needed).

Usage:  python server\\vfp\\build.py
The EXE needs the VFP9 runtime next to it: copy VFP9R.DLL, VFP9RENU.DLL and MSVCR71.DLL
from the fmcg folder into this folder (it is not found through PATH alone).
"""
import os
import sys
import win32com.client

HERE = os.path.dirname(os.path.abspath(__file__))
EXE = os.path.join(HERE, 'SYNCAPPEND.EXE')
ERR = os.path.join(HERE, 'SYNCAPPEND.ERR')

for f in (EXE, ERR):
    if os.path.exists(f):
        os.remove(f)

vfp = win32com.client.Dispatch('VisualFoxPro.Application')
try:
    vfp.DoCmd(f'SET DEFAULT TO "{HERE}"')
    vfp.DoCmd('SET SAFETY OFF')
    vfp.DoCmd('BUILD PROJECT SYNCAPPEND FROM SYNCAPPEND.PRG')
    vfp.DoCmd('BUILD EXE SYNCAPPEND.EXE FROM SYNCAPPEND RECOMPILE')
finally:
    vfp.Quit()

if os.path.exists(ERR):
    print(open(ERR, encoding='latin-1').read())
    sys.exit('Build failed: see SYNCAPPEND.ERR')
if not os.path.exists(EXE):
    sys.exit('Build failed: SYNCAPPEND.EXE was not created')
print('Built', EXE)

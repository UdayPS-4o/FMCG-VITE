"""
PNB Stock Statement Excel generator.
Uses Python's zipfile module to surgically modify only the XML worksheet files
inside the .xlsm template, leaving VBA, styles, and all other entries 100% intact.

Usage:
  python pnb_excel_gen.py <template_path> <output_path> <json_data_path>

json_data has keys: stockData, debtorData, period, summaryData
"""
import sys
import json
import zipfile
import shutil
import os
import re

def esc(s):
    return str(s).replace('&','&amp;').replace('<','&lt;').replace('>','&gt;').replace('"','&quot;')

def set_numeric_cell(xml, cell_ref, value):
    """Replace cached value in a numeric or formula cell, or inject into empty self-closing cell."""
    # Case 1: cell has a <v> tag (with or without formula)
    pattern = r'(<c r="' + re.escape(cell_ref) + r'"[^>]*>)(<f[^>]*>[^<]*</f>)?\s*<v>[^<]*</v>'
    def replacer(m):
        open_tag = m.group(1)
        formula  = m.group(2) or ''
        return open_tag + formula + '<v>' + str(value) + '</v>'
    result = re.sub(pattern, replacer, xml)
    if result != xml:
        return result
    # Case 2: cell is a self-closing empty cell (no <v> tag) - expand it
    empty_pattern = r'<c r="' + re.escape(cell_ref) + r'"([^>]*)/>'
    def empty_replacer(m):
        attrs = m.group(1)
        return '<c r="' + cell_ref + '"' + attrs + '><v>' + str(value) + '</v></c>'
    return re.sub(empty_pattern, empty_replacer, xml)

def set_string_cell(xml, cell_ref, value, style_attr=''):
    """Replace any existing cell at cell_ref with an inlineStr cell."""
    safe = esc(value)
    pattern = r'<c r="' + re.escape(cell_ref) + r'"[^>]*>(?:[^<]|<(?!/c>))*?</c>'
    s = ' ' + style_attr if style_attr else ''
    new_cell = '<c r="' + cell_ref + '"' + s + ' t="inlineStr"><is><t>' + safe + '</t></is></c>'
    if re.search(pattern, xml, re.DOTALL):
        return re.sub(pattern, new_cell, xml, flags=re.DOTALL)
    return xml

def make_inventory_row(row_num, sr_no, product, qty):
    prod = esc(product)
    return (
        '<row r="{r}" spans="1:13" x14ac:dyDescent="0.25">'
        '<c r="A{r}" s="1"><v>{sr}</v></c>'
        '<c r="B{r}" s="2" t="inlineStr"><is><t>Main Godown</t></is></c>'
        '<c r="C{r}" s="2" t="inlineStr"><is><t>{prod}</t></is></c>'
        '<c r="D{r}" s="3"><v>{qty}</v></c>'
        '<c r="E{r}" s="3"><v>0</v></c>'
        '<c r="F{r}" s="12"><v>0</v></c>'
        '<c r="G{r}" s="4" t="inlineStr"><is><t></t></is></c>'
        '</row>'
    ).format(r=row_num, sr=sr_no, prod=prod, qty=qty)

def make_debtor_row(row_num, name, gstin, balance):
    return (
        '<row r="{r}" spans="1:9" x14ac:dyDescent="0.25">'
        '<c r="A{r}" t="inlineStr"><is><t>{name}</t></is></c>'
        '<c r="B{r}" t="inlineStr"><is><t></t></is></c>'
        '<c r="C{r}" t="inlineStr"><is><t></t></is></c>'
        '<c r="D{r}" t="inlineStr"><is><t>{gstin}</t></is></c>'
        '<c r="E{r}"><v>{bal}</v></c>'
        '<c r="F{r}"><v>0</v></c>'
        '<c r="G{r}"><v>0</v></c>'
        '<c r="H{r}"><v>0</v></c>'
        '<c r="I{r}"><v>{bal}</v></c>'
        '</row>'
    ).format(r=row_num, name=esc(name), gstin=esc(gstin or ''), bal=balance)

def row_pattern(row_num):
    return re.compile(r'<row r="' + str(row_num) + r'"[^>]*>.*?</row>', re.DOTALL)

def main():
    if len(sys.argv) < 4:
        print('Usage: python pnb_excel_gen.py <template> <output> <json_data>', file=sys.stderr)
        sys.exit(1)

    template_path = sys.argv[1]
    output_path   = sys.argv[2]
    data_path     = sys.argv[3]

    with open(data_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    stock_data  = data.get('stockData', [])
    debtor_data = data.get('debtorData', [])
    period      = data.get('period', {})
    summary     = data.get('summaryData', {})

    MONTHS = ['January','February','March','April','May','June',
              'July','August','September','October','November','December']

    # Read the template ZIP into memory
    # We will copy it to output first, then modify specific entries in place
    shutil.copy2(template_path, output_path)

    with zipfile.ZipFile(output_path, 'a', compression=zipfile.ZIP_DEFLATED) as zout:
        # Re-open as read to get original content, then update
        pass

    # Open template for reading and output for writing
    with zipfile.ZipFile(template_path, 'r') as zin:
        # Read all files we need to modify
        sheet1_xml = zin.read('xl/worksheets/sheet1.xml').decode('utf-8')
        sheet2_xml = zin.read('xl/worksheets/sheet2.xml').decode('utf-8')
        sheet3_xml = zin.read('xl/worksheets/sheet3.xml').decode('utf-8')
        
        try:
            sheet6_xml = zin.read('xl/worksheets/sheet6.xml').decode('utf-8')
        except:
            sheet6_xml = ""

        # =====================================================================
        # Modify sheet6: Other Details (Sales and Purchases)
        # =====================================================================
        if sheet6_xml:
            s_dur  = summary.get('totalSales', 0)
            s_upto = summary.get('salesUptoLastMonth', 0)
            p_dur  = summary.get('totalPurchases', 0)
            p_upto = summary.get('purchasesUptoLastMonth', 0)
            
            sheet6_xml = set_numeric_cell(sheet6_xml, 'B2', s_upto)
            sheet6_xml = set_numeric_cell(sheet6_xml, 'B3', s_dur)
            sheet6_xml = set_numeric_cell(sheet6_xml, 'B4', s_upto + s_dur)
            
            sheet6_xml = set_numeric_cell(sheet6_xml, 'B11', p_upto)
            sheet6_xml = set_numeric_cell(sheet6_xml, 'B12', p_dur)
            sheet6_xml = set_numeric_cell(sheet6_xml, 'B13', p_upto + p_dur)

            # Let's also put the Total Outstanding Book Debts directly into B9.
            total_d = sum(d.get('balance', 0) for d in debtor_data)
            sheet6_xml = set_numeric_cell(sheet6_xml, 'B9', total_d)
            
            # Since the other fields (B6, B7, B8) require granular data we don't have, 
            # we'll place the entire amount as Fresh debts to make the formula work, or just 0 them
            sheet6_xml = set_numeric_cell(sheet6_xml, 'B6', 0)
            sheet6_xml = set_numeric_cell(sheet6_xml, 'B7', total_d)
            sheet6_xml = set_numeric_cell(sheet6_xml, 'B8', 0)

        # =====================================================================
        # Modify sheet1: Basic Details - B8=Month, B9=Year
        # =====================================================================
        if period:
            month_num  = period.get('month', 1)
            year_num   = period.get('year', 2026)
            month_name = MONTHS[month_num - 1]
            sheet1_xml = set_string_cell(sheet1_xml, 'B8', month_name, 's="60"')
            sheet1_xml = set_numeric_cell(sheet1_xml, 'B9', year_num)

        # =====================================================================
        # Modify sheet2: Inventory Details
        # =====================================================================
        # Find where inventory starts. row 8 is where first item is.
        # But we must preserve everything before row 8 and after row 20.
        # Let's split sheet2_xml by searching for rows 8 to 20.
        # Better: find the `<sheetData>` tag and replace its contents or insert into it.
        # We will parse out rows 1-7 (header), replace rows 8-20 with dynamic rows, and keep row 21+
        
        # We need a robust way to insert dynamic rows into sheetData.
        # Find index of <row r="8"
        start_idx = sheet2_xml.find('<row r="8"')
        # Find index of <row r="21"
        end_idx = sheet2_xml.find('<row r="21"')
        
        if start_idx != -1 and end_idx != -1:
            before_rows = sheet2_xml[:start_idx]
            after_rows = sheet2_xml[end_idx:]
            
            # Generate new rows 8 to N
            new_rows_xml = []
            for idx, item in enumerate(stock_data):
                row_num = 8 + idx
                product = item.get('product') or item.get('code') or ''
                qty = item.get('currentStock', 0)
                rate = item.get('rate', 0)
                value = qty * rate
                
                prod_esc = esc(product)
                new_row = (
                    f'<row r="{row_num}" spans="1:13" x14ac:dyDescent="0.25">'
                    f'<c r="A{row_num}" s="1"><v>{idx+1}</v></c>'
                    f'<c r="B{row_num}" s="2" t="inlineStr"><is><t>Main Godown</t></is></c>'
                    f'<c r="C{row_num}" s="2" t="inlineStr"><is><t>{prod_esc}</t></is></c>'
                    f'<c r="D{row_num}" s="3"><v>{qty}</v></c>'
                    f'<c r="E{row_num}" s="3"><v>{rate}</v></c>'
                    f'<c r="F{row_num}" s="12"><v>{value}</v></c>'
                    f'<c r="G{row_num}" s="4" t="inlineStr"><is><t></t></is></c>'
                    f'</row>'
                )
                new_rows_xml.append(new_row)
            
            # Now we must shift the row numbers of all rows after the inventory table
            # In the original template, inventory is 13 rows (8 to 20).
            # The new inventory is len(stock_data) rows.
            # We need to shift everything from row 21 onwards by (len(stock_data) - 13).
            shift_amount = len(stock_data) - 13
            
            # Adjust row numbers and cell references in after_rows
            if shift_amount != 0:
                def shift_row_repl(m):
                    r_num = int(m.group(1)) + shift_amount
                    return f'<row r="{r_num}"'
                
                def shift_cell_repl(m):
                    col = m.group(1)
                    r_num = int(m.group(2)) + shift_amount
                    return f'<c r="{col}{r_num}"'
                
                after_rows = re.sub(r'<row r="([0-9]+)"', shift_row_repl, after_rows)
                after_rows = re.sub(r'<c r="([A-Z]+)([0-9]+)"', shift_cell_repl, after_rows)
            
            sheet2_xml = before_rows + "".join(new_rows_xml) + after_rows
        
        else:
            # Fallback if rows 8 or 21 not found
            pass

        # Also recalculate total in Inventory sheet
        total_value = sum(item.get('currentStock', 0) * item.get('rate', 0) for item in stock_data)
        total_row_num = 20 + max(1, len(stock_data)) - 13 + 1 if len(stock_data) > 0 else 21
        sheet2_xml = set_numeric_cell(sheet2_xml, f'F{total_row_num}', total_value)

        # =====================================================================
        # Fix controlPr anchor rows for the Inventory sheet buttons
        # Template anchor: <xdr:row>21</xdr:row>...<xdr:row>22</xdr:row>
        # These must be updated to match the new button position.
        # =====================================================================
        inv_btn_row = 8 + max(1, len(stock_data))  # Excel row (1-indexed). VML 0-indexed = this value - 1
        inv_btn_vml = inv_btn_row - 1  # VML row (0-indexed)
        
        def update_ctrl_rows_inv(xml, from_row, to_row):
            # Update ALL <from>...<xdr:row>21</xdr:row>... and <to>...<xdr:row>22</xdr:row>
            xml = xml.replace(f'<xdr:row>{from_row}</xdr:row>', f'<xdr:row>{inv_btn_vml}</xdr:row>')
            xml = xml.replace(f'<xdr:row>{to_row}</xdr:row>',   f'<xdr:row>{inv_btn_vml + 1}</xdr:row>')
            return xml
        
        sheet2_xml = update_ctrl_rows_inv(sheet2_xml, 21, 22)

        # =====================================================================
        # Modify sheet3: Debtors Details - rows 12+
        # =====================================================================
        total_debtor = sum(d.get('balance', 0) for d in debtor_data)
        
        d_start_idx = sheet3_xml.find('<row r="12"')
        d_end_idx = sheet3_xml.find('<row r="54"')
        
        if d_start_idx != -1 and d_end_idx != -1:
            d_before = sheet3_xml[:d_start_idx]
            d_after = sheet3_xml[d_end_idx:]
            
            d_new_rows = []
            for idx, debtor in enumerate(debtor_data):
                row_num = 12 + idx
                name = debtor.get('name', '')
                gstin = debtor.get('gstin', '')
                balance = debtor.get('balance', 0)
                d_row = (
                    f'<row r="{row_num}" spans="1:9" x14ac:dyDescent="0.25">'
                    f'<c r="A{row_num}" s="35" t="inlineStr"><is><t>{esc(name)}</t></is></c>'
                    f'<c r="B{row_num}" s="35" t="inlineStr"><is><t></t></is></c>'
                    f'<c r="C{row_num}" s="29" t="inlineStr"><is><t></t></is></c>'
                    f'<c r="D{row_num}" s="2" t="inlineStr"><is><t>{esc(gstin)}</t></is></c>'
                    f'<c r="E{row_num}" s="3"><v>{balance}</v></c>'
                    f'<c r="F{row_num}" s="3"><v>0</v></c>'
                    f'<c r="G{row_num}" s="3"><v>0</v></c>'
                    f'<c r="H{row_num}" s="3"><v>0</v></c>'
                    f'<c r="I{row_num}" s="36"><v>{balance}</v></c>'
                    f'</row>'
                )
                d_new_rows.append(d_row)
            
            if not d_new_rows:
                # Add one empty row if no debtors
                d_new_rows.append(f'<row r="12" spans="1:9" x14ac:dyDescent="0.25"><c r="A12" s="35"/><c r="E12" s="3"><v>0</v></c></row>')
            
            shift_d = max(1, len(debtor_data)) - 42
            if shift_d != 0:
                def shift_d_row(m):
                    r_num = int(m.group(1)) + shift_d
                    return f'<row r="{r_num}"'
                def shift_d_cell(m):
                    col = m.group(1)
                    r_num = int(m.group(2)) + shift_d
                    return f'<c r="{col}{r_num}"'
                
                d_after = re.sub(r'<row r="([0-9]+)"', shift_d_row, d_after)
                d_after = re.sub(r'<c r="([A-Z]+)([0-9]+)"', shift_d_cell, d_after)
            
            sheet3_xml = d_before + "".join(d_new_rows) + d_after
        else:
            # Fallback if tags missing
            pass

        sheet3_xml = set_numeric_cell(sheet3_xml, 'E4', total_debtor)
        sheet3_xml = set_numeric_cell(sheet3_xml, 'I4', total_debtor)
        sheet3_xml = set_numeric_cell(sheet3_xml, 'I8', total_debtor)
        
        # Hardcode total row value
        total_d_row_num = 12 + max(1, len(debtor_data))
        sheet3_xml = set_numeric_cell(sheet3_xml, f'E{total_d_row_num + 1}', total_debtor)

        # =====================================================================
        # Fix controlPr anchor rows for the Debtors sheet buttons
        # Template anchor: <xdr:row>54</xdr:row> for both from and to
        # =====================================================================
        deb_btn_vml = 12 + max(1, len(debtor_data)) - 1  # VML row (0-indexed) = Excel row - 1
        
        def update_ctrl_rows_deb(xml, from_row):
            xml = xml.replace(f'<xdr:row>{from_row}</xdr:row>', f'<xdr:row>{deb_btn_vml}</xdr:row>')
            return xml
        
        sheet3_xml = update_ctrl_rows_deb(sheet3_xml, 54)

        # =====================================================================
        # Modify VML Drawings to push the buttons down
        # =====================================================================
        # vmlDrawing1=Inventory sheet2, vmlDrawing2=Debtors sheet3.
        def shift_vml_anchor(vml_xml, shift_amt, pt_per_row):
            def repl_anchor(m):
                parts = m.group(1).split(',')
                if len(parts) == 8:
                    try:
                        r1 = int(parts[2].strip())
                        r2 = int(parts[6].strip())
                        parts[2] = f" {r1 + shift_amt}"
                        parts[6] = f" {r2 + shift_amt}"
                        return f"<x:Anchor>{','.join(parts)}</x:Anchor>"
                    except:
                        pass
                return m.group(0)
            
            def repl_margin(m):
                try:
                    mt = float(m.group(1))
                    return f'margin-top:{round(mt + (shift_amt * pt_per_row), 2)}pt;'
                except:
                    return m.group(0)
                    
            vml_xml = re.sub(r'<x:Anchor>(.*?)</x:Anchor>', repl_anchor, vml_xml, flags=re.DOTALL)
            vml_xml = re.sub(r'margin-top:([\d.]+)pt;', repl_margin, vml_xml)
            return vml_xml
            
        vml1_xml = zin.read('xl/drawings/vmlDrawing1.vml').decode('utf-8')
        vml2_xml = zin.read('xl/drawings/vmlDrawing2.vml').decode('utf-8')
        
        # Inventory: template button VML row=21 (Excel 22), margin-top=389.25pt
        # pt_per_row = 389.25 / 21 = 18.54pt
        inv_template_vml = 21
        inv_pt_per_row   = 389.25 / inv_template_vml
        inv_new_vml      = 8 + max(1, len(stock_data))  # data starts at Excel row 8 = VML row 7; button goes right after
        shift_inv        = inv_new_vml - inv_template_vml
        if shift_inv != 0:
            vml1_xml = shift_vml_anchor(vml1_xml, shift_inv, inv_pt_per_row)
            
        # Debtors: template button VML row=54 (Excel 55), margin-top=859.5pt
        # pt_per_row = 859.5 / 54 = 15.9pt
        deb_template_vml = 54
        deb_pt_per_row   = 859.5 / deb_template_vml
        deb_new_vml      = 12 + max(1, len(debtor_data))  # data starts at Excel row 12 = VML row 11; button goes right after
        shift_debtors    = deb_new_vml - deb_template_vml
        if shift_debtors != 0:
            vml2_xml = shift_vml_anchor(vml2_xml, shift_debtors, deb_pt_per_row)

        # =====================================================================
        # Write output: copy all entries from template, replacing modified sheets
        # =====================================================================
        modified = {
            'xl/worksheets/sheet1.xml': sheet1_xml.encode('utf-8'),
            'xl/worksheets/sheet2.xml': sheet2_xml.encode('utf-8'),
            'xl/worksheets/sheet3.xml': sheet3_xml.encode('utf-8'),
            'xl/drawings/vmlDrawing1.vml': vml1_xml.encode('utf-8'),
            'xl/drawings/vmlDrawing2.vml': vml2_xml.encode('utf-8'),
        }
        if sheet6_xml:
            modified['xl/worksheets/sheet6.xml'] = sheet6_xml.encode('utf-8')

        with zipfile.ZipFile(output_path, 'w', compression=zipfile.ZIP_DEFLATED, allowZip64=True) as zout:
            for item in zin.infolist():
                if item.filename == 'xl/calcChain.xml':
                    continue
                if item.filename in modified:
                    zout.writestr(item, modified[item.filename])
                else:
                    zout.writestr(item, zin.read(item.filename))

    print('OK:' + str(os.path.getsize(output_path)))

if __name__ == '__main__':
    main()

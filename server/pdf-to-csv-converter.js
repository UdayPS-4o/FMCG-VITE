const fs = require('fs').promises;
const path = require('path');
const pdf = require('pdf-parse');
const csv = require('fast-csv');

/**
 * PDF to CSV Converter
 * Extracts text from PDF and converts tabular data to CSV format
 */
class PDFToCSVConverter {
  constructor() {
    this.extractedText = '';
    this.parsedData = [];
  }

  /**
   * Extract text from PDF file
   * @param {string} pdfPath - Path to the PDF file
   * @returns {Promise<string>} - Extracted text
   */
  async extractTextFromPDF(pdfPath) {
    try {
      console.log(`Reading PDF file: ${pdfPath}`);
      const dataBuffer = await fs.readFile(pdfPath);
      
      const data = await pdf(dataBuffer);
      this.extractedText = data.text;
      
      console.log(`Successfully extracted text from PDF. Length: ${this.extractedText.length} characters`);
      console.log('First 500 characters:', this.extractedText.substring(0, 500));
      
      return this.extractedText;
    } catch (error) {
      console.error('Error extracting text from PDF:', error);
      throw error;
    }
  }

  /**
   * Parse extracted text and identify table structure
   * @param {string} text - Extracted text from PDF
   * @returns {Array} - Parsed data rows
   */
  parseTableData(text) {
    try {
      console.log('Parsing table data from extracted text...');
      
      // Split text into lines
      const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      
      console.log(`Found ${lines.length} non-empty lines`);
      
      // Try to identify table patterns
      const tableData = [];
      let headers = [];
      let isTableStarted = false;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Skip very short lines or lines that look like headers/footers
        if (line.length < 10) continue;
        
        // Look for lines that might contain tabular data
        // This is a basic heuristic - you may need to adjust based on your PDF structure
        if (this.looksLikeTableRow(line)) {
          const columns = this.extractColumns(line);
          
          if (columns.length > 1) {
            if (!isTableStarted && this.looksLikeHeader(line)) {
              headers = columns;
              isTableStarted = true;
              console.log('Found potential headers:', headers);
            } else if (isTableStarted) {
              tableData.push(columns);
            }
          }
        }
      }
      
      // If no clear headers were found, create generic ones
      if (headers.length === 0 && tableData.length > 0) {
        const maxColumns = Math.max(...tableData.map(row => row.length));
        headers = Array.from({ length: maxColumns }, (_, i) => `Column_${i + 1}`);
        console.log('Generated generic headers:', headers);
      }
      
      // Ensure all rows have the same number of columns as headers
      const normalizedData = tableData.map(row => {
        const normalizedRow = [...row];
        while (normalizedRow.length < headers.length) {
          normalizedRow.push('');
        }
        return normalizedRow.slice(0, headers.length);
      });
      
      this.parsedData = [headers, ...normalizedData];
      
      console.log(`Successfully parsed ${normalizedData.length} data rows with ${headers.length} columns`);
      
      return this.parsedData;
    } catch (error) {
      console.error('Error parsing table data:', error);
      throw error;
    }
  }

  /**
   * Check if a line looks like a table row
   * @param {string} line - Text line
   * @returns {boolean} - True if it looks like a table row
   */
  looksLikeTableRow(line) {
    // Look for patterns that suggest tabular data
    const patterns = [
      /\s+\d+\s+/,  // Contains numbers with spaces
      /\s+\w+\s+\w+/,  // Contains multiple words with spaces
      /\t/,  // Contains tabs
      /\s{2,}/,  // Contains multiple consecutive spaces
      /\|/,  // Contains pipe characters
      /,\s*\w/,  // Contains comma-separated values
    ];
    
    return patterns.some(pattern => pattern.test(line));
  }

  /**
   * Check if a line looks like a header row
   * @param {string} line - Text line
   * @returns {boolean} - True if it looks like a header
   */
  looksLikeHeader(line) {
    const lowerLine = line.toLowerCase();
    const headerKeywords = [
      'name', 'date', 'amount', 'total', 'description', 'item', 'quantity',
      'price', 'code', 'id', 'number', 'type', 'category', 'status'
    ];
    
    return headerKeywords.some(keyword => lowerLine.includes(keyword));
  }

  /**
   * Extract columns from a line
   * @param {string} line - Text line
   * @returns {Array} - Array of column values
   */
  extractColumns(line) {
    // Try different splitting strategies
    let columns = [];
    
    // Strategy 1: Split by tabs
    if (line.includes('\t')) {
      columns = line.split('\t').map(col => col.trim()).filter(col => col.length > 0);
    }
    // Strategy 2: Split by multiple spaces (2 or more)
    else if (/\s{2,}/.test(line)) {
      columns = line.split(/\s{2,}/).map(col => col.trim()).filter(col => col.length > 0);
    }
    // Strategy 3: Split by pipe characters
    else if (line.includes('|')) {
      columns = line.split('|').map(col => col.trim()).filter(col => col.length > 0);
    }
    // Strategy 4: Split by commas
    else if (line.includes(',')) {
      columns = line.split(',').map(col => col.trim()).filter(col => col.length > 0);
    }
    // Strategy 5: Try to identify columns by position (basic heuristic)
    else {
      // This is a fallback - split by single spaces and try to group
      const words = line.split(/\s+/).filter(word => word.length > 0);
      columns = words;
    }
    
    return columns;
  }

  /**
   * Save parsed data to CSV file
   * @param {string} outputPath - Path for the output CSV file
   * @returns {Promise<void>}
   */
  async saveToCSV(outputPath) {
    try {
      console.log(`Saving data to CSV file: ${outputPath}`);
      
      if (this.parsedData.length === 0) {
        throw new Error('No data to save. Please parse the PDF first.');
      }
      
      return new Promise((resolve, reject) => {
        const writeStream = fs.createWriteStream ? require('fs').createWriteStream(outputPath) : null;
        
        if (!writeStream) {
          // Fallback: write CSV manually
          const csvContent = this.parsedData.map(row => 
            row.map(cell => {
              // Escape quotes and wrap in quotes if necessary
              const cellStr = String(cell || '');
              if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
                return '"' + cellStr.replace(/"/g, '""') + '"';
              }
              return cellStr;
            }).join(',')
          ).join('\n');
          
          fs.writeFile(outputPath, csvContent, 'utf8')
            .then(() => {
              console.log(`Successfully saved ${this.parsedData.length} rows to CSV`);
              resolve();
            })
            .catch(reject);
        } else {
          // Use fast-csv library
          csv.write(this.parsedData, { headers: false })
            .pipe(writeStream)
            .on('error', reject)
            .on('finish', () => {
              console.log(`Successfully saved ${this.parsedData.length} rows to CSV`);
              resolve();
            });
        }
      });
    } catch (error) {
      console.error('Error saving to CSV:', error);
      throw error;
    }
  }

  /**
   * Convert PDF to CSV (main method)
   * @param {string} pdfPath - Path to the PDF file
   * @param {string} csvPath - Path for the output CSV file
   * @returns {Promise<Object>} - Conversion result
   */
  async convertPDFToCSV(pdfPath, csvPath) {
    try {
      console.log('Starting PDF to CSV conversion...');
      console.log(`Input PDF: ${pdfPath}`);
      console.log(`Output CSV: ${csvPath}`);
      
      // Step 1: Extract text from PDF
      const extractedText = await this.extractTextFromPDF(pdfPath);
      
      // Step 2: Parse table data
      const parsedData = this.parseTableData(extractedText);
      
      // Step 3: Save to CSV
      await this.saveToCSV(csvPath);
      
      const result = {
        success: true,
        inputFile: pdfPath,
        outputFile: csvPath,
        rowsExtracted: parsedData.length,
        columnsDetected: parsedData.length > 0 ? parsedData[0].length : 0,
        extractedTextLength: extractedText.length
      };
      
      console.log('PDF to CSV conversion completed successfully!');
      console.log('Result:', result);
      
      return result;
    } catch (error) {
      console.error('PDF to CSV conversion failed:', error);
      throw error;
    }
  }

  /**
   * Get preview of parsed data
   * @param {number} maxRows - Maximum number of rows to preview
   * @returns {Array} - Preview data
   */
  getPreview(maxRows = 10) {
    return this.parsedData.slice(0, maxRows);
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: node pdf-to-csv-converter.js <input-pdf-path> <output-csv-path>');
    console.log('Example: node pdf-to-csv-converter.js "report.pdf" "output.csv"');
    process.exit(1);
  }
  
  const [pdfPath, csvPath] = args;
  
  const converter = new PDFToCSVConverter();
  
  converter.convertPDFToCSV(pdfPath, csvPath)
    .then(result => {
      console.log('\n=== Conversion Summary ===');
      console.log(`✓ Successfully converted ${result.rowsExtracted} rows`);
      console.log(`✓ Detected ${result.columnsDetected} columns`);
      console.log(`✓ Output saved to: ${result.outputFile}`);
    })
    .catch(error => {
      console.error('\n=== Conversion Failed ===');
      console.error('Error:', error.message);
      process.exit(1);
    });
}

module.exports = PDFToCSVConverter;
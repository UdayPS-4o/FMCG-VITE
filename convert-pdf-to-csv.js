#!/usr/bin/env node

/**
 * Simple PDF to CSV Converter Script
 * Usage: node convert-pdf-to-csv.js [pdf-file] [output-csv-file]
 */

const path = require('path');
const PDFToCSVConverter = require('./server/pdf-to-csv-converter');

// Get command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('\n=== PDF to CSV Converter ===');
  console.log('\nUsage:');
  console.log('  node convert-pdf-to-csv.js <pdf-file> [output-csv-file]');
  console.log('\nExamples:');
  console.log('  node convert-pdf-to-csv.js "report.pdf"');
  console.log('  node convert-pdf-to-csv.js "report.pdf" "output.csv"');
  console.log('  node convert-pdf-to-csv.js "C:\\path\\to\\report.pdf" "C:\\path\\to\\output.csv"');
  console.log('\nNote: If output file is not specified, it will be created in the same directory as the PDF with .csv extension');
  process.exit(0);
}

const pdfFile = args[0];
let csvFile = args[1];

// If no output file specified, create one based on PDF filename
if (!csvFile) {
  const pdfPath = path.parse(pdfFile);
  csvFile = path.join(pdfPath.dir, pdfPath.name + '.csv');
}

// Convert relative paths to absolute paths
const absolutePdfPath = path.resolve(pdfFile);
const absoluteCsvPath = path.resolve(csvFile);

console.log('\n=== PDF to CSV Conversion ===');
console.log(`Input PDF: ${absolutePdfPath}`);
console.log(`Output CSV: ${absoluteCsvPath}`);
console.log('\nStarting conversion...');

const converter = new PDFToCSVConverter();

converter.convertPDFToCSV(absolutePdfPath, absoluteCsvPath)
  .then(result => {
    console.log('\n=== Conversion Successful! ===');
    console.log(`✓ Extracted ${result.rowsExtracted} rows`);
    console.log(`✓ Detected ${result.columnsDetected} columns`);
    console.log(`✓ Processed ${result.extractedTextLength} characters of text`);
    console.log(`✓ Output saved to: ${result.outputFile}`);
    
    // Show preview of first few rows
    console.log('\n=== Preview (first 5 rows) ===');
    const preview = converter.getPreview(5);
    preview.forEach((row, index) => {
      if (index === 0) {
        console.log('Headers:', row.join(' | '));
        console.log('-'.repeat(50));
      } else {
        console.log(`Row ${index}:`, row.join(' | '));
      }
    });
    
    console.log('\n✅ Conversion completed successfully!');
  })
  .catch(error => {
    console.error('\n=== Conversion Failed ===');
    console.error('❌ Error:', error.message);
    
    if (error.code === 'ENOENT') {
      console.error('\n💡 Tip: Make sure the PDF file path is correct and the file exists.');
    } else if (error.message.includes('pdf-parse')) {
      console.error('\n💡 Tip: Make sure pdf-parse is installed. Run: npm install pdf-parse');
    }
    
    process.exit(1);
  });
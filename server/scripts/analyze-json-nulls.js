const fs = require('fs').promises;
const path = require('path');

require('dotenv').config();

// --- Configuration ---
// Adjust these paths relative to your project root or where you run the script
const jsonFolderPath = path.resolve(process.env.DBF_FOLDER_PATH, 'data', 'json'); 
const filesToAnalyze = [
    { name: 'BILLDTL.json', path: path.join(jsonFolderPath, 'BILLDTL.json'), idFields: ['SERIES', 'BILL', 'SNO'] },
    { name: 'bill.json', path: path.join(jsonFolderPath, 'bill.json'), idFields: ['SERIES', 'BILL'] }
];
const mostlyNullThreshold = 95; // Percentage threshold to consider a field "mostly null"
const sampleSize = 5; // Max number of non-null samples to show for mostly null fields
// --- End Configuration ---

/**
 * Generates an identifier string for a record based on predefined ID fields.
 * @param {object} record The record object.
 * @param {string[]} idFields Array of field names to use for the ID.
 * @returns {string} A string identifier.
 */
function getRecordId(record, idFields) {
    return idFields.map(f => record[f] ?? 'N/A').join('-');
}

/**
 * Analyzes a JSON file for null field percentages and samples non-null values for mostly null fields.
 * 
 * NOTE: Reads the entire file into memory. Potentially memory-intensive for huge files.
 * 
 * @param {string} filePath Path to the JSON file.
 * @param {string[]} idFields Fields to use for identifying sample records.
 * @returns {Promise<{fieldStats: object[], totalRecords: number, error?: string}>}
 */
async function analyzeJsonFileStats(filePath, idFields) {
    console.log(`\nAnalyzing ${path.basename(filePath)}...`);
    let records = [];

    try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        console.log(`  Read ${Buffer.byteLength(fileContent, 'utf8')} bytes.`);
        const jsonData = JSON.parse(fileContent);
        if (!Array.isArray(jsonData)) {
            throw new Error('JSON data is not an array.');
        }
        records = jsonData;
        console.log(`  Parsed ${records.length} records.`);
    } catch (error) {
        console.error(`  Error processing file ${filePath}:`, error.message);
        return { fieldStats: [], totalRecords: 0, error: error.message };
    }

    if (records.length === 0) {
        console.log('  No records found in the file.');
        return { fieldStats: [], totalRecords: 0 };
    }

    const fieldStatsMap = {}; // Stores { count, nullCount, nonNullSamples: [] }

    // First pass: Count occurrences and nulls
    for (const record of records) {
        if (typeof record !== 'object' || record === null) continue;
        for (const field in record) {
            // eslint-disable-next-line no-prototype-builtins
            if (record.hasOwnProperty(field)) {
                if (!fieldStatsMap[field]) {
                    fieldStatsMap[field] = { count: 0, nullCount: 0, nonNullSamples: [] };
                }
                fieldStatsMap[field].count++;
                if (record[field] === null) {
                    fieldStatsMap[field].nullCount++;
                }
            }
        }
    }

    // Calculate percentages and identify fields needing samples
    const fieldsToSample = new Set();
    for (const field in fieldStatsMap) {
        const stats = fieldStatsMap[field];
        stats.nullPercentage = stats.count > 0 ? (stats.nullCount / stats.count) * 100 : 0;

        // Check if it meets the criteria for needing non-null samples
        if (stats.nullPercentage >= mostlyNullThreshold && stats.nullPercentage < 100) {
            fieldsToSample.add(field);
        }
    }

    // Second pass (if needed): Collect non-null samples for specific fields
    if (fieldsToSample.size > 0) {
        console.log(`  Collecting non-null samples for ${fieldsToSample.size} mostly-null fields...`);
        for (const record of records) {
            if (typeof record !== 'object' || record === null) continue;
            const recordId = getRecordId(record, idFields);
            for (const field of fieldsToSample) {
                // eslint-disable-next-line no-prototype-builtins
                if (record.hasOwnProperty(field) && record[field] !== null) {
                    const stats = fieldStatsMap[field];
                    if (stats.nonNullSamples.length < sampleSize) {
                        stats.nonNullSamples.push({ recordId: recordId, value: record[field] });
                    }
                }
            }
            // Optimization: Stop checking this record if all sample lists are full
            let allSamplesFull = true;
            for (const field of fieldsToSample) {
                if (fieldStatsMap[field].nonNullSamples.length < sampleSize) {
                    allSamplesFull = false;
                    break;
                }
            }
            if (allSamplesFull && fieldStatsMap[Array.from(fieldsToSample)[0]].nonNullSamples.length >= sampleSize) {
                 // Crude check, assumes sample size is the same for all. Could refine.
                 // If the first field's samples are full, maybe others are too.
            } 
        }
    }

    // Convert map to sorted array for output
    const fieldStatsArray = Object.entries(fieldStatsMap)
        .map(([fieldName, stats]) => ({ fieldName, ...stats }))
        .sort((a, b) => b.nullPercentage - a.nullPercentage || a.fieldName.localeCompare(b.fieldName)); // Sort by % null desc, then name asc

    console.log(`  Finished analysis for ${path.basename(filePath)}.`);
    return { fieldStats: fieldStatsArray, totalRecords: records.length };
}

// Main execution function
async function main() {
    console.log('Starting detailed JSON null field analysis...');
    console.log(`(Mostly null threshold: ${mostlyNullThreshold}%, Sample size: ${sampleSize})`);

    for (const fileInfo of filesToAnalyze) {
        const result = await analyzeJsonFileStats(fileInfo.path, fileInfo.idFields);

        console.log(`\n--- Results for ${fileInfo.name} ---`);
        if (result.error) {
            console.log(`  Failed to analyze: ${result.error}`);
        } else if (result.totalRecords === 0) {
            console.log('  File is empty or contains no records.');
        } else {
            console.log(`  Total records analyzed: ${result.totalRecords}`);
            console.log('  Field Null Percentage Analysis:');
            result.fieldStats.forEach(stats => {
                console.log(`    - ${stats.fieldName}: ${stats.nullPercentage.toFixed(2)}% null (${stats.nullCount}/${stats.count})`);
                if (stats.nonNullSamples.length > 0) {
                    console.log(`      [Mostly Null] Non-Null Samples:`);
                    stats.nonNullSamples.forEach(sample => {
                        // Truncate long sample values for readability
                        let displayValue = JSON.stringify(sample.value);
                        if (displayValue && displayValue.length > 70) {
                            displayValue = displayValue.substring(0, 67) + '...';
                        }
                        console.log(`        Record ${sample.recordId}: ${displayValue}`);
                    });
                }
            });
        }
        console.log('------------------------------------');
    }

    console.log('\nAnalysis complete.');
}

// Run the analysis
main().catch(error => {
    console.error("An unexpected error occurred during analysis:", error);
}); 
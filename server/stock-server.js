const express = require('express');
const fs = require('fs/promises');
const puppeteer = require('puppeteer')
const path = require('path');

const app = express();

app.use(express.static('dist'));

const port = 4276;


async function calculateStock(gdnCode) {
    let salesData, purchaseData, transferData;
    [salesData, purchaseData, transferData] = await Promise.all([
        new Promise((resolve, reject) => {
            const { spawn } = require('child_process');
            const pythonProcess = spawn('python', ["dbfJS.py", "./d01-2425/data/billdtl.dbf"]);
            let output = '';
            pythonProcess.stdout.on('data', (data) => {
                output += data.toString();
            });
            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(`dbfjs.py exited with code ${code}`);
                }
                try {
                    resolve(JSON.parse(output));
                } catch (e) {
                    reject(`Error parsing JSON output from dbfjs.py: ${e}`);
                }
            });
            pythonProcess.stderr.on('data', (data) => {
                reject(`dbfjs.py stderr: ${data.toString()}`);
            });
        }),
        new Promise((resolve, reject) => {
            const { spawn } = require('child_process');
            const pythonProcess = spawn('python', ["dbfJS.py", "./d01-2425/data/purdtl.dbf"]);
            let output = '';
            pythonProcess.stdout.on('data', (data) => {
                output += data.toString();
            });
            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(`dbfjs.py exited with code ${code}`);
                }
                try {
                    resolve(JSON.parse(output));
                } catch (e) {
                    reject(`Error parsing JSON output from dbfjs.py: ${e}`);
                }
            });
            pythonProcess.stderr.on('data', (data) => {
                reject(`dbfjs.py stderr: ${data.toString()}`);
            });
        }),
        new Promise((resolve, reject) => {
            const { spawn } = require('child_process');
            const pythonProcess = spawn('python', ["dbfJS.py", "./d01-2425/data/transfer.dbf"]);
            let output = '';
            pythonProcess.stdout.on('data', (data) => {
                output += data.toString();
            });
            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(`dbfjs.py exited with code ${code}`);
                }
                try {
                    resolve(JSON.parse(output));
                } catch (e) {
                    reject(`Error parsing JSON output from dbfjs.py: ${e}`);
                }
            });
            pythonProcess.stderr.on('data', (data) => {
                reject(`dbfjs.py stderr: ${data.toString()}`);
            });
        })
    ]);

    // if (gdnCode) {
    //     salesData = salesData.filter(sale => sale.GDN_CODE === gdnCode);
    //     purchaseData = purchaseData.filter(purchase => purchase.GDN_CODE === gdnCode);
    //     transferData = transferData.filter(transfer => transfer.GDN_CODE === gdnCode || transfer.TRF_TO === gdnCode);
    // }

    const stock = {};

    for (const purchase of purchaseData) {
        const { CODE: code, QTY: qty, MULT_F: multF, UNIT: unit, FREE: free, GDN_CODE: gdn } = purchase;
        stock[code] = stock[code] || { pieces: 0, godowns: {} };
        stock[code].godowns[gdn] = stock[code].godowns[gdn] || { pieces: 0 };
        let qtyInPieces = qty;
        if (unit == "BOX" || unit == "Box") {
            qtyInPieces *= multF;
        }
        stock[code].pieces += qtyInPieces;
        stock[code].godowns[gdn].pieces += qtyInPieces;
        if(free) {
            stock[code].pieces += free;
            stock[code].godowns[gdn].pieces += free;
        }
    }

    for (const sale of salesData) {
        const { CODE: code, QTY: qty, MULT_F: multF, UNIT: unit, FREE: free, GDN_CODE: gdn } = sale;
        let qtyInPieces = qty;
        if (unit == "BOX" || unit == "Box") {
            qtyInPieces *= multF;
        }
        stock[code] = stock[code] || {pieces: 0, godowns: {}};
        stock[code].godowns[gdn] = stock[code].godowns[gdn] || {pieces: 0};
        if (stock[code]) {
            stock[code].pieces -= qtyInPieces;
            stock[code].godowns[gdn].pieces -= qtyInPieces;
            if(free) {
                stock[code].pieces -= free;
                stock[code].godowns[gdn].pieces -= free;
            }
        }
    }

    for (const transfer of transferData) {
        const { CODE: code, QTY: qty, MULT_F: multF, UNIT: unit, TRF_TO: toGdn, GDN_CODE: fromGdn } = transfer;
        const qtyInPieces = (unit == "BOX" || unit == "Box") ? qty * multF : qty;
        stock[code] = stock[code] || { pieces: 0, godowns: {} };
        stock[code].godowns[fromGdn] = stock[code].godowns[fromGdn] || {pieces: 0};
        stock[code].godowns[toGdn] = stock[code].godowns[toGdn] || {pieces: 0};
        stock[code].godowns[fromGdn].pieces -= qtyInPieces;
        stock[code].godowns[toGdn].pieces += qtyInPieces;
    }

    // Calculate boxes based on pieces and multF
    for (const code in stock) {
        const pieces = stock[code].pieces;
        const multF = purchaseData.find(p => p.CODE === code)?.MULT_F || 1;
        stock[code].boxes = (pieces / multF).toFixed(0);
        for (const gdn in stock[code].godowns) {
            stock[code].godowns[gdn].boxes = (stock[code].godowns[gdn].pieces / multF).toFixed(0);
        }
    }

    return [stock, salesData, purchaseData, transferData];
}

async function updatedStock(stock, salesData, purchaseData, transferData, gdnCode) {
    let productData;
    try {
        productData = await new Promise((resolve, reject) => {
            const { spawn } = require('child_process');
            const pythonProcess = spawn('python', ["dbfJS.py", "./d01-2425/data/pmpl.dbf"]);
            let output = '';
            pythonProcess.stdout.on('data', (data) => {
                output += data.toString();
            });
            pythonProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(`dbfjs.py exited with code ${code}`);
                }
                try {
                    resolve(JSON.parse(output));
                } catch (e) {
                    reject(`Error parsing JSON output from dbfjs.py: ${e}`);
                }
            });
            pythonProcess.stderr.on('data', (data) => {
                reject(`dbfjs.py stderr: ${data.toString()}`);
            });
        });
    } catch (error) {
        console.error("Error reading pmpl.dbf:", error);
        return {};
    }
    
    try {
        let productDataBackup = [...salesData, ...purchaseData, ...transferData];
        const updatedStockData = [];
        //const itemsPerBox = 12;

        for (const productCode in stock) {
            if (stock.hasOwnProperty(productCode)) {
                let product = productData.find(p => p.CODE === productCode);

                if (!product) {
                    const backupProduct = productDataBackup.find(p => p.CODE === productCode);
                    if (!backupProduct) {
                        console.error(`Product not found in backup data for code: ${productCode}`);
                        continue;
                    }
                    product = backupProduct;
                }

                // Calculate totalStock based on gdnCode
                let totalStock;
                if (gdnCode && gdnCode !== "?") {
                    const godown = stock[productCode].godowns[gdnCode];
                    totalStock = godown ? godown.pieces : 0;
                } else {
                    totalStock = stock[productCode].pieces;
                }
                totalStock = Number(totalStock).toFixed(0);

                const multF = productData.find(p => p.CODE === productCode)?.MULT_F || 1;
                const boxes = Math.floor(totalStock / multF);
                const remainingItems = totalStock % multF;
                const boxPcs = `${boxes.toFixed(0)}+ ${remainingItems.toFixed(0)}`;
                
                updatedStockData.push({
                    code: productCode,
                    product: product.PRODUCT,
                    pack: product.PACK,
                    mrp: product.MRP || product.MRP1,
                    rate: product.RATE || product.RATE1,
                    stock: totalStock,
                    boxPcs: boxPcs
                });
            }
        }
        
        const filteredStockData = updatedStockData.filter(item => parseInt(item.stock) > 0);

        return filteredStockData;
    } catch (error) {
        console.error("Error processing stock data:", error);
        return {};
    }
}


app.get('/stock', async (req, res) => {
    try {
        const gdnCode = req.query.gdnCode;
        const [stock, salesData, purchaseData, transferData] = await calculateStock(gdnCode);
        const updatedStockData = await updatedStock(stock, salesData, purchaseData, transferData, gdnCode);
        res.json(updatedStockData);
    } catch (error) {
        console.error("Error:", error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/generate-pdf', async (req, res) => {
    const { date, godown } = req.query;
    try {
        const stockUrl = godown ? `http://localhost:4276/stock?gdnCode=${godown}` : 'http://localhost:4276/stock';
        const stockResponse = await fetch(stockUrl);
        const stockData = await stockResponse.json();

        const formattedData = {
            date: date || new Date().toISOString().split('T')[0],
            godown: godown || '',
            items: stockData
        };
        await fs.writeFile('dist/data.json', JSON.stringify(formattedData, null, 2));

        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.goto('http://localhost:4276', { waitUntil: 'networkidle0' });
        await new Promise((resolve) => setTimeout(resolve, 400));
        await page.pdf({ path: 'dist/report.pdf', format: 'A4' });

        await browser.close();

        res.send(path.resolve(__dirname, 'report.pdf'));
    } catch (error) {
        console.error('Error generating PDF:', error);
        res.status(500).send('Error generating PDF');
    }
});

app.get('/data.json', async (req, res) => {
    try {
        
        const data = await fs.readFile(path.resolve(__dirname,  'data.json'), 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        console.error('Error reading data.json:', error);
        res.status(500).send('Error reading data.json');
    }
})


app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});
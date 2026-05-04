const path = require('path');
require('dotenv').config({path: path.join(__dirname, '../.env')});
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const dbPath = path.join(__dirname, '../db/app/data.sqlite');
const dbfFolder = process.env.DBF_FOLDER_PATH || '../db';
const jsonPath = path.resolve(__dirname, '..', dbfFolder, 'data/json/PMPL.json');

if (!fs.existsSync(jsonPath)) {
    console.error('PMPL.json not found:', jsonPath);
    process.exit(1);
}

const pmplData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const db = new sqlite3.Database(dbPath);

console.log(`Loaded ${pmplData.length} products from PMPL.json`);

db.all(`SELECT basepack_code, itemvarient_desc FROM products WHERE itemvarient_desc IS NOT NULL AND itemvarient_desc != ''`, [], (err, rows) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    
    console.log(`Loaded ${rows.length} basepacks from products table`);
    
    const basepackMap = {};
    rows.forEach(r => {
        if (r.basepack_code && r.itemvarient_desc) {
            basepackMap[String(r.basepack_code).trim()] = String(r.itemvarient_desc).trim();
        }
    });
    
    db.all(`SELECT product_code, nickname FROM product_meta WHERE nickname IS NOT NULL AND nickname != ''`, [], (err, metaRows) => {
        const existingMeta = new Set(metaRows.map(m => m.product_code));
        
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            
            let count = 0;
            const stmt = db.prepare(`
                INSERT INTO product_meta (product_code, nickname, created_at, updated_at) 
                VALUES (?, ?, datetime('now'), datetime('now'))
                ON CONFLICT(product_code) DO UPDATE SET 
                nickname=excluded.nickname, updated_at=datetime('now')
                WHERE product_meta.nickname IS NULL OR product_meta.nickname = ''
            `);
            
            for (const p of pmplData) {
                if (!p.CODE || !p.IT_DESC2) continue;
                
                const basepack = String(p.IT_DESC2).trim();
                const code = String(p.CODE).trim();
                const nickname = basepackMap[basepack];
                
                if (nickname && !existingMeta.has(code)) {
                    stmt.run(code, nickname);
                    count++;
                }
            }
            
            stmt.finalize();
            
            db.run('COMMIT', () => {
                console.log(`Pre-seeded ${count} nicknames successfully.`);
                db.close();
            });
        });
    });
});

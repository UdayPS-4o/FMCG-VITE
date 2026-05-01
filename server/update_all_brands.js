const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('c:/Users/udayps/Documents/code26/1TA/FMCG-VITE/server/db/app/data.sqlite');

const brandImages = {
  "SURF EXCEL": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/SURFEXCEL.jpg",
  "CLINIC PLUS": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/CLINICPLUS.jpg",
  "RIN": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/RIN.jpg",
  "SUNSILK": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/SUNSILK.jpg",
  "VIM": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/VIM.jpg",
  "CLOSE UP": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/CLOSEUP.jpg",
  "LIFEBUOY": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/LIFEBUOY.jpg",
  "PEARS": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/PEARS.png",
  "WHEEL": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/WHEEL.jpg",
  "GLOW & LOVELY": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/FAIRANDLOVELY.JPG",
  "PONDS": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/PONDS.png",
  "LUX": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/LUX.png",
  "DOVE": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/DOVE.png",
  "TAAZA": "https://storage.googleapis.com/hul-shikhar-cms/CMS-PROD-HERO/202309280528521695878932040_Taaza_Logo.png",
  "COMFORT": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/COMFORT.png",
  "RED LABEL": "https://storage.googleapis.com/hul-shikhar-cms/CMS-PROD-HERO/202309280511161695877873046_New-Logo-Red-Lable.png",
  "KISSAN": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/KISSAN.png",
  "LAKME": "https://storage.googleapis.com/hul-shikhar-cms/CMS-PROD-HERO/202312271331421703664102184_LAKME%20LOGO_v2%20%281%29.png",
  "LIRIL": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/LIRIL.png",
  "BRU": "https://storage.googleapis.com/hul-shikhar-cms/CMS-PROD-HERO/202309280516181695878177893_Bru%20New%20Logo.png",
  "INDULEKHA": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/INDULEKHA.jpg",
  "TRESEMME": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/TRESEMME.png",
  "REXONA": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/Rexona-Emblem.png",
  "V WASH": "https://storage.googleapis.com/hul-shikhar-cms/CMS-PROD-HERO/1659675399894_VWash%20original.jpg",
  "PEPSODENT": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/PEPSODENT.png",
  "HAMAM": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/HAMAM.png",
  "VASELINE": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/VASELINE.png",
  "KNORR": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/KNORR.jpg",
  "LIPTON": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/LIPTON.jpg",
  "HORLICKS": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/Logo_HORLICKS.jpg",
  "WOMEN'S HORLICKS": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/B_195.png",
  "TAJ MAHAL": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/TAJMAHAL.jpg",
  "Hellmann": "https://storage.googleapis.com/hul-shikhar-cms/CMS-PROD-HERO/202304240445241682311524298_Hellmanns-Logo%20%281%29.png",
  "JUNIOR HORLICKS": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/Logo_JUNIORHORLICKS.jpg",
  "BROWN & POLSON": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/BROWN_POLSON.png",
  "Horlicks Diabetes Plus": "https://storage.googleapis.com/hul-shikhar-cms/CMS-PROD-HERO/1662457056485_horlicks-diabetes-plus-brand-logo.jpg",
  "PROTEIN PLUS": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/B_197.png",
  "Mother's Horlicks": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/B_196.png",
  "BABY DOVE": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/BabyDove.png",
  "DOMEX": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/DOMEX.jpg",
  "REX": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/Rex.png",
  "ELLE18": "https://storage.googleapis.com/hul-shikhar-cms/CMS-PROD-HERO/1660043273286_elle-18-lipstick-logo.png",
  "SUNLIGHT": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/SUNLIGHT.jpg",
  "NOVOLOGY": "https://storage.googleapis.com/hul-shikhar-cms/CMS-PROD-HERO/202302210553201676958799938_novo.png",
  "AXE": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/AXE.jpg",
  "CLEAR": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/CLEAR.jpg",
  "Lakme Absolute": "https://storage.googleapis.com/hul-shikhar-cms/CMS-PROD-HERO/202302161559221676563162080_lakme-abs.png",
  "MOTI": "https://storage.googleapis.com/hul-retailer-apps/retailer-app/home_page_new/brands/moti.jpg"
};

db.serialize(() => {
  const stmt = db.prepare('UPDATE brands SET image_url = ? WHERE brand_desc = ?');
  let count = 0;
  for (const [desc, url] of Object.entries(brandImages)) {
    stmt.run([url, desc], function(err) {
      if (err) console.error(err);
      else console.log(`Updated ${desc} with ${url} (Changes: ${this.changes})`);
    });
  }
  stmt.finalize(() => {
    db.close(() => {
      console.log('Done mapping brands!');
    });
  });
});

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const cron = require('node-cron');
const Papa = require('papaparse');
const _ = require('lodash');
const Tesseract = require('tesseract.js');


let config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'config.json'), 'utf8'));
const downloadPath = path.resolve(__dirname, '..', 'downloads',"raw");

// create download directory if it doesn't exist
if (!fs.existsSync(downloadPath)) {
  fs.mkdirSync(downloadPath, { recursive: true });
}

let browser;

async function downloadStatement() {
  config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'config.json'), 'utf8'));
  // use proxy 72deeeccbf09b6d8b738__cr.in:da56af5206c18a2a@gw.dataimpulse.com:10000
  try {
    if (browser && browser.isConnected()) {
      console.log('Browser is already open.');
    } else {
      const headless = ([true, "true"].includes(config.background) ? "new" : false);
      browser = await puppeteer.launch({ 
        headless: false,
        executablePath: config.chromePath,
        args: [
               ]
      });
    }

    const page = await browser.newPage();
    // await page.authenticate({
    //   username: '72deeeccbf09b6d8b738__cr.us',
    //   password: 'da56af5206c18a2a'
    // });
    const client = await page.target().createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadPath,
    });

    // on puppeteer crashtype o
    browser.on('disconnected', () => {
      console.log('Browser closed.');
    });

    page.on('dialog', async dialog => {
      console.log(`Dialog detected: ${dialog.message()} of type ${dialog.type()}`);
      if (dialog.type() === 'alert') {
        await dialog.accept();
      } else if (dialog.type() === 'confirm') {
        await dialog.dismiss(); // Or accept based on your needs
      }
      // Handle other types if necessary
    });

    
    // PAGE GOTO PNB
    await page.goto(config.website);
    console.log('Login page...');

    // USER ID PAGE
    await page.waitForSelector('#AuthenticationFG\\.CORP_ID')
    await page.type('#AuthenticationFG\\.CORP_ID', config['corp-id']);
    await page.type('#AuthenticationFG\\.USR_ID', config['user-id']);
    await page.click('[name="Action.STU_VALIDATE_CREDENTIALS"]');

    // CAPTCHA PAGE
    await page.waitForSelector('#AuthenticationFG\\.ACCESS_CODE');
    console.log('Password page...');


    await page.evaluate((password) => {
      document.querySelector('#AuthenticationFG\\.ACCESS_CODE').value = password;
    }, config['password']);
    
    console.log('00');


    await new Promise(resolve => setTimeout(resolve, 2000))

    // Fetch the CAPTCHA text

    const captchaImageSrc = await page.$eval('#dynamicImage', img => img.src);
    const base64Data = captchaImageSrc.split(',')[1]; // Extract the Base64 part
    console.log("captcha got ")
    // Perform OCR on the Base64 CAPTCHA image
    const { data: { text } } = await Tesseract.recognize(`data:image/png;base64,${base64Data}`, 'eng', {
      logger: m => console.log(m)
    });

    // Clean the OCR result (remove spaces and special characters)
    const captchaText = text.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '');
    console.log({captchaText})

    await page.type('#AuthenticationFG\\.ENTERED_CAPTCHA_CODE', captchaText);

    // Click the submit button
    await page.evaluate(() => {
      document.getElementById('VALIDATE_STU_CREDENTIALS1').removeAttribute('onclick');
    });
    await page.click('#VALIDATE_STU_CREDENTIALS1');

    try {
      // DASHBOARD PAGE
      await page.waitForSelector("#My-ShortCuts_Account-Statement", {timeout: 20000});
      console.log('Logged in...');
      await page.click("#My-ShortCuts_Account-Statement");
    } catch (error) {
      await browser.close();
    }

    // ACCOUNT STATEMENT PAGE
    await page.waitForSelector("#SEARCH");

    const fromDateValue = await page.$eval('#TransactionHistoryFG\\.TO_TXN_DATE', input => input.value);

    // Convert the "from date" to a Date object
    const fromDate = moment(fromDateValue, 'DD-MM-YYYY');

    // Subtract 1 day from the "from date"
    const toDate = fromDate.clone().subtract(1, 'day');

    // Format the "to date" as 'DD-MM-YYYY'
    const toDateValue = toDate.format('DD-MM-YYYY');

    // Set the "to date" value using Puppeteer
    await page.evaluate((value) => {
      document.querySelector('#TransactionHistoryFG\\.FROM_TXN_DATE').value = value;
    }, toDateValue);

    console.log('Account statement page...')
    await page.click("#SEARCH");

    // Statement got

    await page.waitForSelector("#TransactionHistoryFG\\.OUTFORMAT");
    console.log('Waiting to Download...')
    await page.select("#TransactionHistoryFG\\.OUTFORMAT", "3");
    await page.click("#okButton");

    await new Promise(resolve => setTimeout(resolve, 10000))

  } catch (error) {
    console.log('error :', error.message)
  } finally {
    if (browser && browser.isConnected()) {
      await browser.close();
    }
  }
}

const processingDelay = 5000; // 5 seconds, adjust as needed
const lastProcessed = new Map();

fs.watch(downloadPath, (eventType, filename) => {
  if (eventType === 'rename' && filename.endsWith('.csv') && !filename.startsWith('statement-')) {
    console.log('EVENT TYPE: ' + eventType + ' FILENAME: ' + filename);

    // Update the last processed timestamp for the file
    lastProcessed.set(filename, Date.now());

    // Wait for the delay and then check if the file should be processed
    setTimeout(() => {
      const lastTimestamp = lastProcessed.get(filename);
      if (lastTimestamp && Date.now() - lastTimestamp >= processingDelay) {
        if (fs.existsSync(path.join(downloadPath, filename)) && fs.readFileSync(path.join(downloadPath, filename), 'utf8') != "") {
          let olddata = fs.readFileSync(path.join(downloadPath, filename), 'utf8');
          let currentDate = moment().format('DD-MM-YYYY');
          let currentTime = moment().format('HH-mm');
          let newFilename = `statement-${currentDate}--${currentTime}.csv`;
          fs.writeFileSync(path.join(path.resolve(__dirname, '..', 'downloads'), newFilename), olddata);
          cleancsv(path.join(downloadPath, filename), filename, olddata);
          lastProcessed.delete(filename);  // Remove the file from the map
        }
      }
    }, processingDelay + 1000);  // Add an extra second to ensure we're past the delay
  }
});


// Check downloads every minute
setInterval(async () => {
  config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'config.json'), 'utf8'));
  await filechecker();
}, 60 * 1000 * 5);


async function filechecker() {

  let files = fs.readdirSync(path.resolve(__dirname, '..', 'downloads'));
  let csvFiles = files.filter(file => file.endsWith('.csv'));

  if (csvFiles.length) {
    let latestFile = csvFiles.sort((a, b) => {
      const fileA = fs.statSync(path.join(path.resolve(__dirname, '..', 'downloads'), a));
      const fileB = fs.statSync(path.join(path.resolve(__dirname, '..', 'downloads'), b));
      return fileB.birthtime.getTime() - fileA.birthtime.getTime();
    })[0];

    console.log(`Latest file is ${latestFile}`);
    let latestFileDateTime = moment(latestFile.replace('statement-', '').replace('.csv', '').replace('--', ' '), 'DD-MM-YYYY HH-mm');
    let currentDateTime = moment();  // get the current time

    for (let time of config.times) {
      let timeToday = moment(time, 'HH:mm');  // get today's date at the specified time
      if (timeToday.isAfter(currentDateTime)) {
        // if the specified time hasn't occurred yet today, ignore it
        continue;
      }

      if (latestFileDateTime.isBefore(timeToday)) {
        // if the latest file was downloaded before the specified time, start a new download
        console.log(`Current time is ${currentDateTime.format('HH:mm')}`)
        console.log(`Latest file time is ${latestFileDateTime.format('HH:mm')}`)
        console.log(`No statement downloaded after ${time}. Starting download...`);
        await downloadStatement();
      }
    }
  } else {
    console.log('No statements downloaded yet. Starting download...');
    await downloadStatement();
  }
}

filechecker();

const express = require('express');
const app = express();
const port = 3001;

app.get('/', (req, res) => {
  res.send('App is Live...');
});

app.get('/download', (req, res) => {
  downloadStatement();
  res.send('Downloading statement...');
});

app.get('/check', (req, res) => {
  filechecker();
  res.send('Checking');
});

app.listen(port, () => {
  setTimeout(() => {
  console.log(`App listening at http://localhost:${port}`)
  }, 5000);
});




function cleancsv(filepath,filename,file){
  const fs = require('fs');
  const Papa = require('papaparse');
  const _ = require('lodash');
  
  // Read the CSV file
  file = fs.readFileSync(filepath, 'utf8');
  
  
  //  convert file to start from  Txn No. onwards
  let top = file.split('Txn No.')[0];
  
  let file1 = 'Blank,Txn No.'+file.split('Txn No.')[1];
  // end at ,Unless constituent notifies the bank
  file1 = file1.split(',Unless constituent notifies the bank')[0];
  let bottom = ',Unless constituent notifies the bank'+file.split(',Unless constituent notifies the bank')[1];
  
  // write it to edited .csv file
  
  
  // Parse the CSV file
  const results = Papa.parse(file1, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
  });
  
  
  
  // from each value of ['Dr Amount', 'Cr Amount', 'Balance'] remove commas and convert to number
  const results1 = results.data.map((row) => {
    const newRow = {};
    Object.keys(row).forEach((key) => {
        if (key === 'Dr Amount' || key === 'Cr Amount' || key === 'Balance') {
            if (typeof row[key] == 'string') {
                // take out numbers from string
                newRow[key] = (row[key].replace(/[^0-9.-]+/g,""));
                newRow[key] = (row[key].replace(/,/g, '').replace(' Dr.', '').replace(' Cr.', ''));
            } else if (typeof row[key] == 'number') {
                newRow[key] = row[key];
            } else {
                newRow[key] = "";
            }
        } else {
            newRow[key] = row[key];
        }
    }); 
    return newRow;
});
  
  
  
  
  // write to csv file /edited/two.csv
  let csv = Papa.unparse(results1);
  
  // remove first 6 chars from csv
  csv = csv.substring(6);



  
const { exec } = require('child_process');

let lastExecution = 0;
let isScheduled = false;  // Flag to check if a function call is already scheduled

function runExe() {
    const now = Date.now();
    
    console.log("runExe called at:", now);

    if (now - lastExecution < 30000 || isScheduled) {
        if (now - lastExecution < 30000) {
            console.log("Execution prevented due to time since last execution:", now - lastExecution, "ms");
        }
        if (isScheduled) {
            console.log("Execution prevented because it's already scheduled.");
        }
        return;
    }

    isScheduled = true;
    console.log("Scheduling execution for 3 seconds later...");

    setTimeout(() => {
      const workingDirectory = 'C:/Users/shubham/Desktop/FMCG';

      exec('pnbcr.exe', { cwd: workingDirectory }, (error) => {
          if (error) {
              console.error(`exec error: ${error}`);
          } else {
              console.log(".exe executed at:", Date.now());
          }
      });

      lastExecution = now;
      isScheduled = false;
      console.log("Last execution time updated to:", lastExecution);
    }, 3000);
}




  
try {
  console.log('1 ->')
  let currentDate = moment().format('DD-MM-YYYY');
  let currentTime = moment().format('HH-mm');
  let newFilename = `statement-${currentDate}--${currentTime}.csv`;
  
  const editedPath = path.resolve(__dirname, '..', 'edited');
  if (!fs.existsSync(editedPath)) {
    fs.mkdirSync(editedPath, { recursive: true });
  }
  
  fs.writeFileSync(path.join(editedPath, `${newFilename}.csv`), top+csv+bottom, 'utf8');
  console.log('2 ->')
  fs.writeFileSync(`C:/Users/shubham/Desktop/FMCG/pnbcr.csv`, top+csv+bottom, 'utf8');
  runExe();

} catch (error) {
  console.log(error)
  console.log("File is already open, Can't edit");
}


}

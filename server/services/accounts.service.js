const path = require('path');
const jsonDbService = require('./jsonDbService');

const ACCOUNTS_DB_PATH = path.join(__dirname, '..', 'db', 'account-master.json');
const CMPL_JSON_PATH = process.env.DBF_FOLDER_PATH ? path.join(process.env.DBF_FOLDER_PATH, 'data', 'json', 'CMPL.json') : path.join(__dirname, '..', '..', 'DBF_FALLBACK_DATA', 'CMPL.json'); // Fallback for local dev if env var not set
const PMPL_JSON_PATH = process.env.DBF_FOLDER_PATH ? path.join(process.env.DBF_FOLDER_PATH, 'data', 'json', 'PMPL.json') : path.join(__dirname, '..', '..', 'DBF_FALLBACK_DATA', 'PMPL.json');


async function getLocalAccounts() {
  const accounts = await jsonDbService.readJsonFile(ACCOUNTS_DB_PATH);
  return accounts || [];
}

async function getLocalAccountBySubgroup(subgroup) {
  const accounts = await getLocalAccounts();
  return accounts.find(acc => acc.subgroup === subgroup || acc.achead === subgroup); // Also check achead for compatibility
}

async function addLocalAccount(accountData) {
  let accounts = await getLocalAccounts();

  // Duplicate checks (similar to current post.js)
  if (accountData.subgroup && accounts.some(acc => acc.subgroup === accountData.subgroup)) {
    throw new Error(`DuplicateError: Account with subgroup '${accountData.subgroup}' already exists.`);
  }
  if (accountData.email && accounts.some(acc => acc.email === accountData.email)) {
    throw new Error(`DuplicateError: Account with email '${accountData.email}' already exists.`);
  }
  if (accountData.mobile && accounts.some(acc => acc.mobile === accountData.mobile)) {
    throw new Error(`DuplicateError: Account with mobile '${accountData.mobile}' already exists.`);
  }
  // Add achead if not present and subgroup is
  if (accountData.subgroup && !accountData.achead) {
    accountData.achead = accountData.subgroup;
  }


  // Add other necessary fields, potentially an ID if not relying solely on subgroup
  const newAccount = { ...accountData, createdAt: new Date().toISOString() };
  accounts.push(newAccount);
  const success = await jsonDbService.writeJsonFile(ACCOUNTS_DB_PATH, accounts);
  return success ? newAccount : null;
}

async function updateLocalAccount(identifier, accountData) { // identifier can be subgroup or achead
  let accounts = await getLocalAccounts();
  const accountIndex = accounts.findIndex(acc => acc.subgroup === identifier || acc.achead === identifier);

  if (accountIndex === -1) {
    return null; // Account not found
  }

  // Prevent changing the primary identifier (subgroup/achead) easily, or handle consequences
  if (accountData.subgroup && accountData.subgroup !== accounts[accountIndex].subgroup) {
     // Potentially check for duplicates if subgroup is changed
     if (accounts.some((acc, idx) => idx !== accountIndex && acc.subgroup === accountData.subgroup)) {
         throw new Error(`DuplicateError: Another account with subgroup '${accountData.subgroup}' already exists.`);
     }
  }
   // Add achead if not present and subgroup is
  if (accountData.subgroup && !accountData.achead) {
    accountData.achead = accountData.subgroup;
  }


  accounts[accountIndex] = {
    ...accounts[accountIndex],
    ...accountData,
    lastUpdated: new Date().toISOString(),
  };

  const success = await jsonDbService.writeJsonFile(ACCOUNTS_DB_PATH, accounts);
  return success ? accounts[accountIndex] : null;
}

async function getRawCmplJsonData() {
    const cmplData = await jsonDbService.readJsonFile(CMPL_JSON_PATH);
    return cmplData || [];
}
async function getRawPmplJsonData() {
    const pmplData = await jsonDbService.readJsonFile(PMPL_JSON_PATH);
    return pmplData || [];
}


async function getCmplDataFiltered() {
  const cmplData = await getRawCmplJsonData();
  if (!cmplData) return [];

  return cmplData
    .filter(item => item.M_GROUP === 'DT' && item.C_CODE && item.C_CODE.endsWith('000'))
    .sort((a, b) => (a.C_CODE || "").localeCompare(b.C_CODE || ""));
}

async function getNextSubgroupCode(mainGroupPrefix) {
  const localAccounts = await getLocalAccounts();
  const cmplData = await getRawCmplJsonData();
  let maxLocalCode = 0;
  let maxDbfCode = 0;

  localAccounts.forEach(entry => {
    if (entry.subgroup && entry.subgroup.startsWith(mainGroupPrefix)) {
      const entryNumber = parseInt(entry.subgroup.slice(mainGroupPrefix.length), 10);
      if (!isNaN(entryNumber) && maxLocalCode < entryNumber) {
        maxLocalCode = entryNumber;
      }
    }
  });

  if (cmplData) {
    cmplData.forEach(entry => {
      if (entry.C_CODE && entry.C_CODE.startsWith(mainGroupPrefix) && !entry.C_CODE.endsWith('000')) {
        const entryNumber = parseInt(entry.C_CODE.slice(mainGroupPrefix.length), 10);
        if (!isNaN(entryNumber) && maxDbfCode < entryNumber) {
          maxDbfCode = entryNumber;
        }
      }
    });
  }

  const maxCode = Math.max(maxLocalCode, maxDbfCode);
  return `${mainGroupPrefix}${(maxCode + 1).toString().padStart(3, '0')}`;
}

async function getAccountSuggestions() {
  const filteredCmpl = await getCmplDataFiltered();
  // No need to read local accounts again if getNextSubgroupCode does it.
  // However, the original slink.js newData function implies local accounts might be needed for title generation,
  // but the title generation only uses CMPL's C_NAME and the next code.

  const suggestions = [];
  for (const item of filteredCmpl) {
    const mainGroupPrefix = item.C_CODE.substring(0, 2); // Assuming prefix is first 2 chars
    const nextCode = await getNextSubgroupCode(mainGroupPrefix);
    suggestions.push({
      // Original title: `${item.C_NAME} | ${getNextSubgroupCode(accountMasterData, json, item.C_CODE.substring(0, 2)).slice(2)}`
      // The slice(2) was to get the numeric part from the *next* code of that specific subgroup, which is complex.
      // Simpler: just show the next available code for that prefix.
      title: `${item.C_NAME} (Group ${mainGroupPrefix}) | Next available in series: ${nextCode.slice(mainGroupPrefix.length)}`,
      subgroupCode: nextCode, // This is the full next code (e.g., SG005)
      originalPartyCode: item.C_CODE, // e.g., SG000
      partyName: item.C_NAME,
      mainGroupPrefix: mainGroupPrefix,
    });
  }
  return suggestions;
}

module.exports = {
  getLocalAccounts,
  getLocalAccountBySubgroup,
  addLocalAccount,
  updateLocalAccount,
  getCmplDataFiltered,
  getNextSubgroupCode,
  getAccountSuggestions,
  getRawCmplJsonData,
  getRawPmplJsonData,
};

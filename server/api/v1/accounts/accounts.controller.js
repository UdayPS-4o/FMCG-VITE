const accountsService = require('../../../services/accounts.service'); // Adjusted path

async function getAccounts(req, res) {
  try {
    const accounts = await accountsService.getLocalAccounts();
    res.status(200).json(accounts);
  } catch (error) {
    console.error('[AccountsController] Error fetching local accounts:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve accounts.' });
  }
}

async function createAccount(req, res) {
  const accountData = req.body;
  // Basic validation - can be expanded
  if (!accountData.subgroup && !accountData.achead) { // At least one identifier needed
    return res.status(400).json({ success: false, message: 'Account subgroup or achead is required.' });
  }
  if (!accountData.name) {
    return res.status(400).json({ success: false, message: 'Account name is required.' });
  }

  try {
    const newAccount = await accountsService.addLocalAccount(accountData);
    if (newAccount) {
      res.status(201).json(newAccount);
    } else {
      res.status(500).json({ success: false, message: 'Failed to create account due to a server error.' });
    }
  } catch (error) {
    if (error.message && error.message.startsWith('DuplicateError:')) {
      return res.status(409).json({ success: false, message: error.message });
    }
    console.error('[AccountsController] Error creating account:', error);
    res.status(500).json({ success: false, message: 'Failed to create account.' });
  }
}

async function getAccount(req, res) {
  const accountId = req.params.id; // This 'id' will be treated as subgroup or achead
  if (!accountId) {
    return res.status(400).json({ success: false, message: 'Account identifier (subgroup/achead) is required in path.' });
  }
  try {
    const account = await accountsService.getLocalAccountBySubgroup(accountId);
    if (account) {
      res.status(200).json(account);
    } else {
      res.status(404).json({ success: false, message: 'Account not found.' });
    }
  } catch (error) {
    console.error(`[AccountsController] Error fetching account ${accountId}:`, error);
    res.status(500).json({ success: false, message: 'Failed to retrieve account.' });
  }
}

async function updateAccount(req, res) {
  const accountId = req.params.id; // This 'id' will be treated as subgroup or achead
  const accountData = req.body;

  if (!accountId) {
    return res.status(400).json({ success: false, message: 'Account identifier (subgroup/achead) is required in path.' });
  }
  if (Object.keys(accountData).length === 0) {
    return res.status(400).json({ success: false, message: 'Request body cannot be empty for update.' });
  }

  try {
    const updatedAccount = await accountsService.updateLocalAccount(accountId, accountData);
    if (updatedAccount) {
      res.status(200).json(updatedAccount);
    } else {
      res.status(404).json({ success: false, message: 'Account not found or update failed.' });
    }
  } catch (error) {
    if (error.message && error.message.startsWith('DuplicateError:')) {
      return res.status(409).json({ success: false, message: error.message });
    }
    console.error(`[AccountsController] Error updating account ${accountId}:`, error);
    res.status(500).json({ success: false, message: 'Failed to update account.' });
  }
}

async function getAccountCreationSuggestions(req, res) {
  try {
    const suggestions = await accountsService.getAccountSuggestions();
    res.status(200).json(suggestions);
  } catch (error) {
    console.error('[AccountsController] Error fetching account suggestions:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve account suggestions.' });
  }
}

async function getRawCmpl(req, res) {
  try {
    const data = await accountsService.getRawCmplJsonData();
    // Implement ETag caching here if desired, similar to old /api/dbf/:file
    res.status(200).json(data);
  } catch (error) {
    console.error('[AccountsController] Error fetching raw CMPL data:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve CMPL data.' });
  }
}

async function getRawPmpl(req, res) {
  try {
    const data = await accountsService.getRawPmplJsonData();
    // Implement ETag caching here if desired
    res.status(200).json(data);
  } catch (error) {
    console.error('[AccountsController] Error fetching raw PMPL data:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve PMPL data.' });
  }
}

module.exports = {
  getAccounts,
  createAccount,
  getAccount,
  updateAccount,
  getAccountCreationSuggestions,
  getRawCmpl,
  getRawPmpl,
};

// Add a catch-all route for client-side routing paths
app.get([
  '/account-master/*',
  '/invoicing/*',
  '/db/account-master/*',
  '/db/invoicing/*',
  '/cash-receipts/*',
  '/cash-payments/*'
], (req, res) => {
  // Log the requested path to help with debugging
  console.log('Client-side route requested:', req.path);
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Specific handlers for invoicing edit pages
app.get('/invoicing/edit/:id', (req, res) => {
  console.log('Invoicing edit page requested for ID:', req.params.id);
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.get('/db/invoicing/edit/:id', (req, res) => {
  console.log('DB Invoicing edit page requested for ID:', req.params.id);
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Place this before the static middleware for other paths 
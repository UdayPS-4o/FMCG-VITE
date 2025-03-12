async function calculateCurrentStock() {
  // Fetch the sales, purchases, and transfers data
  const salesResponse = await fetch("/api/dbf/billdtl.json");
  const salesData = await salesResponse.json();

  const purchaseResponse = await fetch("/api/dbf/purdtl.json");
  const purchaseData = await purchaseResponse.json();

  const transferResponse = await fetch("/api/dbf/transfer.json");
  const transferData = await transferResponse.json();

  const stock = {};

  // Process purchases to increment stock
  for (const purchase of purchaseData) {
    const { CODE: code, QTY: qty, MULT_F: multF, UNIT: unit, FREE: free, GDN_CODE: gdn } = purchase;
    stock[code] = stock[code] || { pieces: 0, godowns: {} };
    stock[code].godowns[gdn] = stock[code].godowns[gdn] || { pieces: 0 };
    let qtyInPieces = qty;
    if (unit === "BOX" || unit === "Box") {
      qtyInPieces *= multF;
    }
    stock[code].pieces += qtyInPieces;
    stock[code].godowns[gdn].pieces += qtyInPieces;
    if (free) {
      stock[code].pieces += free;
      stock[code].godowns[gdn].pieces += free;
    }
  }

  // Process sales to decrement stock
  for (const sale of salesData) {
    const { CODE: code, QTY: qty, MULT_F: multF, UNIT: unit, FREE: free, GDN_CODE: gdn } = sale;
    let qtyInPieces = qty;
    if (unit === "BOX" || unit === "Box") {
      qtyInPieces *= multF;
    }
    if (stock[code]) {
      stock[code].godowns[gdn] = stock[code].godowns[gdn] || { pieces: 0 };
      stock[code].pieces -= qtyInPieces;
      stock[code].godowns[gdn].pieces -= qtyInPieces;
      if (free) {
        stock[code].pieces -= free;
        stock[code].godowns[gdn].pieces -= free;
      }
    }
  }

  // Process transfers
  for (const transfer of transferData) {
    const { CODE: code, QTY: qty, MULT_F: multF, UNIT: unit, TRF_TO: toGdn, GDN_CODE: fromGdn } = transfer;
    const qtyInPieces = (unit === "BOX" || unit === "Box") ? qty * multF : qty;
    stock[code] = stock[code] || { pieces: 0, godowns: {} };
    stock[code].godowns[fromGdn] = stock[code].godowns[fromGdn] || { pieces: 0 };
    stock[code].godowns[toGdn] = stock[code].godowns[toGdn] || { pieces: 0 };
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

  return stock;
}
// Call the function and log the result
calculateCurrentStock().then(stock => console.log(stock["GJ871"]));

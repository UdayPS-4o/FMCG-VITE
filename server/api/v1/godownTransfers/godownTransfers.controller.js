const godownTransfersService = require('../../../services/godownTransfers.service'); // Adjusted path

async function getAllGodownTransfers(req, res) {
  try {
    const transfers = await godownTransfersService.getLocalGodownTransfers();
    res.status(200).json(transfers);
  } catch (error) {
    console.error('[GodownTransfersController] Error fetching godown transfers:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve godown transfers.' });
  }
}

async function getGodownTransfer(req, res) {
  const { id } = req.params; // Local ID for godown.json entries
  if (!id) {
    return res.status(400).json({ success: false, message: 'Godown Transfer ID parameter is required.' });
  }
  try {
    const transfer = await godownTransfersService.getLocalGodownTransferById(id);
    if (transfer) {
      res.status(200).json(transfer);
    } else {
      res.status(404).json({ success: false, message: 'Godown transfer not found.' });
    }
  } catch (error) {
    console.error(`[GodownTransfersController] Error fetching godown transfer ${id}:`, error);
    res.status(500).json({ success: false, message: 'Failed to retrieve godown transfer.' });
  }
}

async function createGodownTransfer(req, res) {
  const transferData = req.body;
  // Basic validation
  if (!transferData || typeof transferData !== 'object' || !transferData.series || !transferData.fromGodown || !transferData.toGodown || !transferData.items || !Array.isArray(transferData.items) || transferData.items.length === 0) {
    return res.status(400).json({ success: false, message: 'Invalid godown transfer data. Required fields: series, fromGodown, toGodown, and at least one item.' });
  }

  try {
    const newTransfer = await godownTransfersService.addLocalGodownTransfer(transferData);
    if (newTransfer) {
      res.status(201).json(newTransfer);
    } else {
      res.status(500).json({ success: false, message: 'Failed to create godown transfer due to a server error.' });
    }
  } catch (error) {
    if (error.message && error.message.startsWith('DuplicateError:')) {
      return res.status(409).json({ success: false, message: error.message });
    }
    if (error.message && error.message.startsWith('ValidationError:')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error('[GodownTransfersController] Error creating godown transfer:', error);
    res.status(500).json({ success: false, message: 'Failed to create godown transfer.' });
  }
}

async function updateGodownTransfer(req, res) {
  const { id } = req.params; // Local ID for godown.json entries
  const transferData = req.body;

  if (!id) {
    return res.status(400).json({ success: false, message: 'Godown Transfer ID parameter is required.' });
  }
  if (Object.keys(transferData).length === 0) {
    return res.status(400).json({ success: false, message: 'Request body cannot be empty for update.' });
  }
  if (transferData.id && String(transferData.id) !== String(id)) {
      return res.status(400).json({ success: false, message: 'Transfer ID in body does not match ID in path.'});
  }


  try {
    const updatedTransfer = await godownTransfersService.updateLocalGodownTransfer(id, transferData);
    if (updatedTransfer) {
      res.status(200).json(updatedTransfer);
    } else {
      res.status(404).json({ success: false, message: 'Godown transfer not found or update failed.' });
    }
  } catch (error) {
    if (error.message && error.message.startsWith('DuplicateError:')) {
      return res.status(409).json({ success: false, message: error.message });
    }
    if (error.message && error.message.startsWith('ValidationError:')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    console.error(`[GodownTransfersController] Error updating godown transfer ${id}:`, error);
    res.status(500).json({ success: false, message: 'Failed to update godown transfer.' });
  }
}

async function getNextIds(req, res) {
  try {
    const ids = await godownTransfersService.getNextGodownTransferIdentifiers();
    res.status(200).json(ids);
  } catch (error) {
    console.error('[GodownTransfersController] Error fetching next godown transfer identifiers:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve next godown transfer identifiers.' });
  }
}

async function getPrintData(req, res) {
  const { id } = req.params; // Local ID for godown.json entries
  if (!id) {
    return res.status(400).json({ success: false, message: 'Godown Transfer ID parameter is required for printing.' });
  }
  try {
    const printData = await godownTransfersService.getGodownTransferPrintData(id);
    res.status(200).json(printData);
  } catch (error) {
    if (error.message && error.message.startsWith('GodownTransferNotFound:')) {
      return res.status(404).json({ success: false, message: error.message });
    }
    console.error(`[GodownTransfersController] Error fetching print data for godown transfer ${id}:`, error);
    res.status(500).json({ success: false, message: 'Failed to retrieve godown transfer print data.' });
  }
}

module.exports = {
  getAllGodownTransfers,
  getGodownTransfer,
  createGodownTransfer,
  updateGodownTransfer,
  getNextIds,
  getPrintData,
};

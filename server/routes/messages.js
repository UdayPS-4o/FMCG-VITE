const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');

const messagesFilePath = path.join(__dirname, '..', 'db', 'messages.json');

// Initialize messages file if it doesn't exist
const initMessagesFile = async () => {
    try {
        await fs.access(messagesFilePath);
    } catch {
        await fs.writeFile(messagesFilePath, '[]');
    }
};

initMessagesFile();

// GET all messages (for the admin)
router.get('/', async (req, res) => {
    try {
        const data = await fs.readFile(messagesFilePath, 'utf8');
        res.json({ success: true, messages: JSON.parse(data || '[]') });
    } catch (error) {
        console.error('Error reading messages:', error);
        res.status(500).json({ success: false, message: 'Failed to read messages' });
    }
});

// POST a new message
router.post('/', async (req, res) => {
    try {
        const newMessage = req.body;
        // make sure it has an id and timestamp
        if (!newMessage.id) newMessage.id = Date.now().toString();
        if (!newMessage.sentAt) newMessage.sentAt = new Date().toISOString();
        if (newMessage.isRead === undefined) newMessage.isRead = false;

        const data = await fs.readFile(messagesFilePath, 'utf8');
        const messages = JSON.parse(data || '[]');
        
        messages.push(newMessage);
        
        await fs.writeFile(messagesFilePath, JSON.stringify(messages, null, 2));
        res.json({ success: true, message: newMessage });
    } catch (error) {
        console.error('Error saving message:', error);
        res.status(500).json({ success: false, message: 'Failed to save message' });
    }
});

// PUT to mark as read
router.put('/:id/read', async (req, res) => {
    try {
        const { id } = req.params;
        const data = await fs.readFile(messagesFilePath, 'utf8');
        const messages = JSON.parse(data || '[]');
        
        let found = false;
        const updatedMessages = messages.map(msg => {
            if (msg.id === id) {
                found = true;
                return { ...msg, isRead: true };
            }
            return msg;
        });

        if (!found) {
            return res.status(404).json({ success: false, message: 'Message not found' });
        }

        await fs.writeFile(messagesFilePath, JSON.stringify(updatedMessages, null, 2));
        res.json({ success: true, message: 'Message marked as read' });
    } catch (error) {
        console.error('Error marking message as read:', error);
        res.status(500).json({ success: false, message: 'Failed to update message' });
    }
});

// PUT to mark all as read
router.put('/read-all', async (req, res) => {
    try {
        const { userId, isAdmin } = req.body;
        const data = await fs.readFile(messagesFilePath, 'utf8');
        const messages = JSON.parse(data || '[]');
        
        const updatedMessages = messages.map(msg => {
            if (msg.recipientId === userId || (isAdmin && msg.recipientId === 1)) {
                return { ...msg, isRead: true };
            }
            return msg;
        });

        await fs.writeFile(messagesFilePath, JSON.stringify(updatedMessages, null, 2));
        res.json({ success: true, message: 'All messages marked as read' });
    } catch (error) {
        console.error('Error marking all messages as read:', error);
        res.status(500).json({ success: false, message: 'Failed to update messages' });
    }
});

module.exports = router;

const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory state (resets on server restart, fine for a night's hangout)
let users = [];
// Track rate limits: key = `${fromId}-${toId}`, value = last action timestamp
const rateLimits = new Map();

// Config
const RATE_LIMIT_MS = 10 * 1000; // 10 seconds between adding BT to the same person

// Generate a simple ID
const generateId = () => Math.random().toString(36).substring(2, 9);

app.get('/api/state', (req, res) => {
    // Sort users by score descending
    const sortedUsers = [...users].sort((a, b) => b.score - a.score);
    res.json(sortedUsers);
});

app.post('/api/join', (req, res) => {
    const { name } = req.body;
    if (!name || name.trim() === '') {
        return res.status(400).json({ error: 'Name is required' });
    }
    
    // Check if user already exists (simple string match)
    let user = users.find(u => u.name.toLowerCase() === name.trim().toLowerCase());
    
    if (!user) {
        user = { id: generateId(), name: name.trim(), score: 0 };
        users.push(user);
    }
    
    res.json(user);
});

app.post('/api/bt', (req, res) => {
    const { fromId, toId } = req.body;
    
    if (!fromId || !toId) {
        return res.status(400).json({ error: 'Missing fromId or toId' });
    }
    
    if (fromId === toId) {
        return res.status(400).json({ error: 'Cannot BT yourself' });
    }
    
    const targetUser = users.find(u => u.id === toId);
    if (!targetUser) {
        return res.status(404).json({ error: 'Target user not found' });
    }

    // Rate limiting check
    const rateKey = `${fromId}-${toId}`;
    const lastAction = rateLimits.get(rateKey) || 0;
    const now = Date.now();
    
    if (now - lastAction < RATE_LIMIT_MS) {
        const waitTime = Math.ceil((RATE_LIMIT_MS - (now - lastAction)) / 1000);
        return res.status(429).json({ error: `Chill. Wait ${waitTime}s before BTing them again.` });
    }
    
    // Apply BT
    targetUser.score += 1;
    rateLimits.set(rateKey, now);
    
    res.json({ success: true, user: targetUser });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`BT Leaderboard running on port ${PORT}`);
});

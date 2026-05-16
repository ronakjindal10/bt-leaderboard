const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory state
let users = [];
// Track interactions: key = `${fromId}-${toId}`
const interactions = new Map();

const FIVE_MINS_MS = 5 * 60 * 1000;

const generateId = () => Math.random().toString(36).substring(2, 9);

app.get('/api/state', (req, res) => {
    const sortedUsers = [...users].sort((a, b) => b.score - a.score);
    res.json(sortedUsers);
});

app.post('/api/join', (req, res) => {
    const { name } = req.body;
    if (!name || name.trim() === '') return res.status(400).json({ error: 'Name is required' });
    
    let user = users.find(u => u.name.toLowerCase() === name.trim().toLowerCase());
    if (!user) {
        user = { id: generateId(), name: name.trim(), score: 0 };
        users.push(user);
    }
    res.json(user);
});

app.post('/api/bt', (req, res) => {
    const { fromId, toId } = req.body;
    if (!fromId || !toId) return res.status(400).json({ error: 'Missing ids' });
    if (fromId === toId) return res.status(400).json({ error: 'Cannot BT yourself' });
    
    const targetUser = users.find(u => u.id === toId);
    if (!targetUser) return res.status(404).json({ error: 'Target user not found' });

    const rateKey = `${fromId}-${toId}`;
    const now = Date.now();
    let interaction = interactions.get(rateKey) || { lastStandardBT: 0, rageTaps: 0, rageAwards: [] };

    // Clean up expired rage awards
    interaction.rageAwards = interaction.rageAwards.filter(t => now - t < FIVE_MINS_MS);

    let message = "";

    // Standard BT check
    if (now - interaction.lastStandardBT >= FIVE_MINS_MS) {
        interaction.lastStandardBT = now;
        interaction.rageTaps = 0; // Reset rage taps on successful standard BT
        targetUser.score += 1;
        message = "🎯 BT Successfully delivered! (Cooldown: 5m)";
    } else {
        // Standard is on cooldown, count towards Rage BT
        interaction.rageTaps += 1;
        
        if (interaction.rageTaps >= 5) {
            if (interaction.rageAwards.length < 2) {
                interaction.rageAwards.push(now);
                targetUser.score += 1;
                interaction.rageTaps = 0;
                message = "🔥 RAGE CLICK COMBO! +1 Extra BT! They must really be grinding your gears.";
            } else {
                interaction.rageTaps = 0;
                return res.status(429).json({ error: `🚨 Woah psycho! Max rage limit reached. Drink some water.` });
            }
        } else {
            const tapsLeft = 5 - interaction.rageTaps;
            const waitMins = Math.ceil((FIVE_MINS_MS - (now - interaction.lastStandardBT)) / 60000);
            return res.status(429).json({ error: `Cooldown (${waitMins}m left). *Secret tap ${interaction.rageTaps}/5* 🤫` });
        }
    }
    
    interactions.set(rateKey, interaction);
    res.json({ success: true, user: targetUser, message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`BT Leaderboard running on port ${PORT}`);
});

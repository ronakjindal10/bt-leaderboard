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

// Gist Persistence Logic
const GIST_ID = process.env.GIST_ID;
const GH_TOKEN = process.env.GH_TOKEN;

async function loadFromGist() {
    if (!GIST_ID) return;
    try {
        console.log('Loading state from Gist...');
        const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                ...(GH_TOKEN && { 'Authorization': `token ${GH_TOKEN}` })
            }
        });
        if (res.ok) {
            const data = await res.json();
            const content = data.files['state.json']?.content;
            if (content) {
                const parsed = JSON.parse(content);
                if (parsed.users && Array.isArray(parsed.users)) {
                    users = parsed.users;
                    console.log(`Loaded ${users.length} users from Gist.`);
                }
            }
        } else {
            console.error('Failed to load Gist:', await res.text());
        }
    } catch (e) {
        console.error('Gist load error:', e);
    }
}

async function syncToGist() {
    if (!GIST_ID || !GH_TOKEN) return;
    try {
        await fetch(`https://api.github.com/gists/${GIST_ID}`, {
            method: 'PATCH',
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'Authorization': `token ${GH_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                files: {
                    'state.json': {
                        content: JSON.stringify({ users })
                    }
                }
            })
        });
    } catch (e) {
        console.error('Gist sync error:', e);
    }
}

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
        syncToGist(); // Sync asynchronously
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
    let stateChanged = false;

    // Standard BT check
    if (now - interaction.lastStandardBT >= FIVE_MINS_MS) {
        interaction.lastStandardBT = now;
        interaction.rageTaps = 0; // Reset rage taps on successful standard BT
        targetUser.score += 1;
        stateChanged = true;
        message = "🎯 BT Successfully delivered! (Cooldown: 5m)";
    } else {
        // Standard is on cooldown, count towards Rage BT
        interaction.rageTaps += 1;
        
        if (interaction.rageTaps >= 5) {
            if (interaction.rageAwards.length < 2) {
                interaction.rageAwards.push(now);
                targetUser.score += 1;
                stateChanged = true;
                interaction.rageTaps = 0;
                message = "🔥 RAGE CLICK COMBO! +1 Extra BT! They must really be grinding your gears.";
            } else {
                interaction.rageTaps = 0;
                return res.status(429).json({ error: `🚨 Woah psycho! Max rage limit reached. Drink some water.` });
            }
        } else {
            const waitMins = Math.ceil((FIVE_MINS_MS - (now - interaction.lastStandardBT)) / 60000);
            return res.status(429).json({ error: `Cooldown (${waitMins}m left).` });
        }
    }
    
    interactions.set(rateKey, interaction);
    if (stateChanged) syncToGist(); // Sync asynchronously
    
    res.json({ success: true, user: targetUser, message });
});

const PORT = process.env.PORT || 3000;
loadFromGist().then(() => {
    app.listen(PORT, () => {
        console.log(`BT Leaderboard running on port ${PORT}`);
    });
});

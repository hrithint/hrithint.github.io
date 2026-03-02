const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;
const DB_FILE = path.join(__dirname, 'leaderboard.json');

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Initialize leaderboard.json if it doesn't exist
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify([], null, 4));
}

// GET: Fetch the top scorers
app.get('/api/leaderboard', (req, res) => {
    fs.readFile(DB_FILE, 'utf8', (err, data) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to read database' });
        }
        res.json(JSON.parse(data));
    });
});

// POST: Save a new score
app.post('/api/leaderboard', (req, res) => {
    const newEntry = req.body;

    fs.readFile(DB_FILE, 'utf8', (err, data) => {
        if (err) return res.status(500).json({ error: 'Failed to read database' });

        let leaderboard = JSON.parse(data);
        
        // Find if user already exists
        const existingIndex = leaderboard.findIndex(s => s.name === newEntry.name && s.company === newEntry.company);
        
        if (existingIndex !== -1) {
            // Update only if new score is better
            if (newEntry.score > leaderboard[existingIndex].score || 
               (newEntry.score === leaderboard[existingIndex].score && newEntry.completion > leaderboard[existingIndex].completion)) {
                leaderboard[existingIndex] = newEntry;
            }
        } else {
            leaderboard.push(newEntry);
        }

        // Sort and keep top 10 (or any number)
        leaderboard.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return b.completion - a.completion;
        });

        fs.writeFile(DB_FILE, JSON.stringify(leaderboard, null, 4), (err) => {
            if (err) return res.status(500).json({ error: 'Failed to save score' });
            res.json({ message: 'Score saved successfully', leaderboard });
        });
    });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

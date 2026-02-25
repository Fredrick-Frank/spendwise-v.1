const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();

// --- CONFIGURATION ---
const ADMIN_EMAIL = "igwefredrickchiemeka@gmail.com"; 
const ADMIN_PASSWORD = "passw0rd"; 

// OpenShift uses /data for persistent storage; fallback to local dir
const dbPath = fs.existsSync('/data') ? '/data/expenses.db' : path.join(__dirname, 'expenses.db');
const db = new sqlite3.Database(dbPath);

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
    secret: 'spendwise-secure-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// --- DATABASE SETUP ---
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE, role TEXT DEFAULT 'user')`);
    db.run(`CREATE TABLE IF NOT EXISTS expenses (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, amount REAL, category TEXT, description TEXT, date TEXT)`);
});

// --- AUTHENTICATION ---
app.get('/login', (req, res) => res.render('login'));

app.post('/auth', (req, res) => {
    const { email, password } = req.body;
    const isLoggingAsAdmin = (email.toLowerCase().trim() === ADMIN_EMAIL.toLowerCase());

    if (isLoggingAsAdmin && password !== ADMIN_PASSWORD) {
        return res.send("Invalid Admin Password. <a href='/login'>Go back</a>");
    }

    const role = isLoggingAsAdmin ? 'admin' : 'user';

    db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
        if (!user) {
            db.run("INSERT INTO users (email, role) VALUES (?, ?)", [email, role], function() {
                req.session.userId = this.lastID;
                req.session.userEmail = email;
                req.session.role = role;
                res.redirect('/');
            });
        } else {
            req.session.userId = user.id;
            req.session.userEmail = user.email;
            req.session.role = role; 
            res.redirect('/');
        }
    });
});

// --- ROLE TOGGLE ---
app.get('/toggle-role', (req, res) => {
    if (req.session.userEmail === ADMIN_EMAIL) {
        req.session.role = (req.session.role === 'admin') ? 'user' : 'admin';
        return res.redirect('/');
    }
    res.status(403).send("Unauthorized");
});

// --- EXPORT TO CSV (Raw data for Excel) ---
app.get('/export', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    let query = "SELECT amount, category, description, date FROM expenses WHERE user_id = ?";
    let params = [req.session.userId];
    if (req.session.role === 'admin') {
        query = "SELECT users.email, amount, category, description, date FROM expenses JOIN users ON expenses.user_id = users.id";
        params = [];
    }
    db.all(query, params, (err, rows) => {
        if (err || rows.length === 0) return res.redirect('/');
        const headers = req.session.role === 'admin' ? "User,Amount,Category,Description,Date\n" : "Amount,Category,Description,Date\n";
        const csvContent = rows.map(r => req.session.role === 'admin' 
            ? `${r.email},${r.amount},${r.category},"${r.description}",${r.date}`
            : `${r.amount},${r.category},"${r.description}",${r.date}`).join("\n");
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=spendwise_export.csv');
        res.status(200).send(headers + csvContent);
    });
});

// --- DASHBOARD ---
app.get('/', (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    let query = "SELECT * FROM expenses WHERE user_id = ? ORDER BY date DESC";
    let params = [req.session.userId];
    if (req.session.role === 'admin') {
        query = "SELECT expenses.*, users.email FROM expenses JOIN users ON expenses.user_id = users.id ORDER BY date DESC";
        params = [];
    }
    db.all(query, params, (err, rows) => {
        const total = rows.reduce((sum, row) => sum + row.amount, 0);
        const categories = {};
        rows.forEach(r => { categories[r.category] = (categories[r.category] || 0) + r.amount; });
        res.render('index', { 
            expenses: rows, role: req.session.role, userEmail: req.session.userEmail,
            ADMIN_EMAIL: ADMIN_EMAIL, totalSpent: total.toFixed(2), categoryTotals: categories
        });
    });
});

app.post('/add', (req, res) => {
    const { amount, category, description, date } = req.body;
    db.run("INSERT INTO expenses (user_id, amount, category, description, date) VALUES (?, ?, ?, ?, ?)",
        [req.session.userId, amount, category, description, date], () => res.redirect('/'));
});

app.post('/delete/:id', (req, res) => {
    db.run("DELETE FROM expenses WHERE id = ? AND (user_id = ? OR ? = 'admin')", 
        [req.params.id, req.session.userId, req.session.role], () => res.redirect('/'));
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server online at port ${PORT}`));
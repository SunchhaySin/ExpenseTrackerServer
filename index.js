const express = require("express");
const mysql = require("mysql2");
const bcrypt = require('bcrypt');
require('dotenv').config();

const app = express();
const port = process.env.DB_PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const connection = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: process.env.DB_SSL === "true" ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined,
})


// Server Test Endpoint
app.get('/', (req, res) => {
    res.json({ message: 'Server is running' });
});
// Get all users (as a test)
app.get('/users', (req, res) => {
    try {
        const query = 'SELECT * FROM User'
        connection.query(query, (err, result) => {
            if (err) {
                console.error(err)
                return res.status(500).json({ error: "Fetch Failed" })
            }
            res.json({ message: result })
        })

    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Server Error" })
    }
})

// User Register Endpoint
app.post('/reg', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({ error: "Missing Registration Fields" });
        }

        const encryptPass = await bcrypt.hash(password, 10);
        const query = 'INSERT INTO User (username, email, password) VALUES (?,?,?)';
        connection.query(query, [username, email, encryptPass], (err, result) => {
            if (err) {
                console.error(err);
                return res.status.json({ error: "Database Insert Failed" })
            }
            res.json({ message: result })
        })

    } catch (err) {
        console.error(err);
        return res.status.json({ error: "Server Ecountered An Error" })
    }
})

// User Login Entpoint
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: "Enter Login Credentials" })
        }
        const query = 'SELECT * FROM User WHERE email = ?';
        connection.query(query, [email], async (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: "Database " })
            }

            if (result.length == 0) {
                return res.status(401).json({ error: "Incorrect Credentials" })
            }
            const user = result[0];
            const pass = await bcrypt.compare(password, user.password)

            if (!pass) {
                return res.status(401).json({error: "Error Login"})
            }
            res.json(
                {
                    message: "Login Success",
                    result
                }
            )
        })


    } catch (err) {
        console.error(err)
        return res.status.json({ error: "Login Failed" })
    }
})

// Testing new Git Remote for new Repository URL

app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on port ${port}`);
});

module.exports = app;

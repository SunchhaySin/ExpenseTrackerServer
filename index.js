import express from 'express';
import mysql from 'mysql2';
import bcrypt from 'bcrypt';
import cors from 'cors';
import dotenv from 'dotenv';
import { expressHandler } from '@genkit-ai/express';
import { createWorker } from 'tesseract.js';
import { ai, ScanUpload } from './src/genkit.js';

dotenv.config();
const app = express();
const port = process.env.DB_PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cors());
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
                return res.status(500).json({ error: "Database Insert Failed" })
            }
            res.json({ message: result })
        })

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Server Encountered An Error" })
    }
})

// User Login Endpoint
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
                return res.status(401).json({ error: "Error Login" })
            }
            res.json({
                message: "Login Success",
                username: user.username,
                email: user.email,
                userID: user.userID
            })
        })


    } catch (err) {
        console.error(err)
        return res.status(500).json({ error: "Login Failed" })
    }
})

//Tesseract: transform image into text
async function imageTranslate(file) {
    const worker = await createWorker('eng');
    const { data: { text } } = await worker.recognize(file)
    await worker.terminate();
    return text;
}

// Scan User Uploads Endpoint (Calls Flow in genkit.ts)
app.post('/api/scan', async (req, res) => {
    try {
        const { images } = req.body;

        if (!images) {
            return res.status(400).json({
                success: false,
                error: 'imageBase64 is required',
            });
        }

        const extractedText = await imageTranslate(images)

        if (!extractedText) {
            return res.status(400).json({ error: "Image not compiled" })
        }

        //   const result = extractedText;
        const result = await ScanUpload(extractedText);

        return res.status(500).json({
            success: true,
            data: result,
        });
    } catch (error) {
        console.error(error);

        return res.status(500).json({
            success: false,
            error: 'Failed to scan upload',
        });
    }
});

// Inserting into Database Invoices Table
app.post('/upload/invoice', async (req, res) => {
    try {
        const { data } = req.body
        if (!data) {
            res.status(400).json({ error: "No invoice found" })
        }
        const columns = Object.keys(data).join(', ');
        const placeholders = Object.keys(data).map(() => '?').join(', ');
        const dataValues = Object.values(data);

        const query = `INSERT INTO Invoices (${columns}) VALUES (${placeholders})`;
        connection.query(query, dataValues, async (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: "Database Error" })
            }
            if (result.affectedRows === 0) {
                return res.status(401).json({ error: "Database Insert Failed" })
            }
            const response = result
            res.json({
                sucess: true,
                message: "Databse Insertion Success",
                data: response,
            })
        })
    } catch (err) {
        res.status(500).json({
            sucess: false,
            error: err.message
        })
    }
})

// Inserting into Database Receipt Table
app.post(`/upload/receipt`, async (req, res) => {
    try {
        const { userID, type, items, total_amount, biller, currency, date, time } = req.body;

        if (!userID || !total_amount || !biller || !currency) {
            return res.status(400).json({ error: "No Receipt found" })
        }

        const query = `INSERT INTO Receipts (userID, type, items, total_amount, biller, currency, date, time, creadedAt)
                         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?) `

        const values = [
            userID,
            type,
            JSON.stringify(items), 
            total_amount,
            biller,
            currency,
            date,
            time
        ];

        connection.query(query, values, (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: "Database Error" })
            }

            if (results.affectedRows === 0) {
                return res.status(401).json({ error: "Database Insert Failed" })
            }
            const response = results
            res.json({
                sucess: true,
                message: "Databse Insertion Success",
                data: response,
            })
        })

    } catch (err) {
        res.status(500).json({
            message: false,
            error: err.message
        })
    }
})
// Genkit AI Endpoint 
app.post('/api/test-ai', async (req, res) => {
    try {
        const { prompt } = req.body;
        const result = await ai.generate({
            prompt: prompt || 'Say hello and tell me you are working',
        });
        res.json({
            success: true,
            response: result.text
        });
    } catch (error) {
        console.error('AI Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('/assist', async (req, res) => {
    try {
        const { prompt } = req.body;
        const response = await ai.generate({
            prompt: `You are an personal assistant agent, respond accordingly to the user prompt: ${prompt}`
        })

        res.json(response.text)

    } catch (err) {
        res.status(500).json(err.message)
    }
})

app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on port ${port}`);
});

// module.exports = app;
export default app;
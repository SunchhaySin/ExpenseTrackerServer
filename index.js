import express from 'express';
import mysql from 'mysql2';
import bcrypt from 'bcrypt';
import cors from 'cors';
import dotenv from 'dotenv';
import { expressHandler } from '@genkit-ai/express';
import { createWorker } from 'tesseract.js';
import { ai, ScanUpload } from './dist/genkit.js';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';


dotenv.config();
const app = express();
const port = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET;


app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cookieParser());

const allowedOrigins = [
    process.env.FRONTEND_URL,
];
if (process.env.NODE_ENV !== 'production') {
  allowedOrigins.push('http://localhost:5173');
}

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`CORS blocked: ${origin}`));
        }
    },
    credentials: true,
}));

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
                console.log(err)
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

            // create token with user data inside
            const token = jwt.sign(
                { userID: user.userID, username: user.username, email: user.email },
                SECRET,
                { expiresIn: '7d' } // token expires in 7 days
            );
            // set token as cookie
            res.cookie('token', token, {
                httpOnly: true,   // JS cannot access it
                secure: true,    // set to true in production (HTTPS)
                sameSite: 'none',
                maxAge: 7 * 24 * 60 * 60 * 1000  // 7 days in milliseconds
            });

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

app.get('/auth/me', (req, res) => {
    const token = req.cookies.token;

    if (!token) {
        return res.status(401).json({ error: "Not logged in" });
    }

    try {
        const decoded = jwt.verify(token, SECRET);
        console.log(decoded)
        res.json({ userID: decoded.userID, username: decoded.username, email: decoded.email });
    } catch (err) {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
});

app.post('/logout', (req, res) => {
    res.clearCookie('token', {
        httpOnly: true,
        secure: true,
        sameSite: 'none'
    });
    res.json({ success: true, message: "Logged out" });
});

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

        return res.json({
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

        const query = `INSERT IGNORE INTO Invoices (${columns}) VALUES (${placeholders})`;
        connection.query(query, dataValues, async (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: "Database Error" })
            }
            if (result.affectedRows === 0) {
                return res.status(409).json({ error: "Duplicate Invoice" })
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
    console.log("Received:", req.body);
    try {
        const { userID, type, items, total_amount, biller, currency, date, time } = req.body;
        console.log("Items:", items, typeof items);
        if (!userID || !type || !items || !total_amount || !biller || !currency || !date || !time) {
            return res.status(400).json({ error: "No Receipt found" })
        }

        const query = `INSERT IGNORE INTO Receipts (userID, type, items, total_amount, biller, currency, date, time)
                         VALUES(?, ?, ?, ?, ?, ?, ?, ?) `

        const values = [
            userID,
            type,
            JSON.stringify(items),
            total_amount,
            biller,
            currency,
            date,
            time || null
        ];

        connection.query(query, values, (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: "Database Error" })
            }

            if (results.affectedRows === 0) {
                return res.status(409).json({ error: "Duplicate Receipt" })
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

app.get('/fetch/invoice/:id', async (req, res) => {
    try{
        const id = req.params.id
        const query = `SELECT * FROM Invoices WHERE userID=?`
        connection.query(query, [id], (err, result) => {
            if(err){
                console.error(err)
                res.status(500).json({error: err.message})
            }

            if (result.length === 0) {
                return res.status(404).json({ error: "No invoices found" });
            }

            res.json({success: true, data: result})
        })
    } catch (err){
        res.status(500).json({
            success: false,
            error: err.message
        })
    }
})

app.get('/fetch/receipt/:id', async (req, res) => {
    try{
        const id = req.params.id
        const query = `SELECT * FROM Receipts WHERE userID=?`
        connection.query(query, [id], (err, result) => {
            if(err){
                console.error(err)
                res.status(500).json({error: err.message})
            }

            if (result.length === 0) {
                return res.status(404).json({ error: "No receipts found" });
            }
            
            res.json({success: true, data: result})
        })
    } catch (err){
        res.status(500).json({
            success: false,
            error: err.message
        })
    }
})

// Delete Uploads by id 
app.delete('/delete/invoice/:userID/:uploadID', async (req, res) => {
    try {
        const { userID, uploadID } = req.params;
        const query = 'DELETE FROM Invoices WHERE userID = ? AND uploadID = ?';
        const result = connection.query(query, [userID, uploadID]);

        return res.json({
            success: true,
            data: result
        });
    } catch (err) {
        return res.status(500).json({
            message: "Deletion Failed",
            error: err.message
        });
    }
});

app.delete('/delete/receipt/:userID/:uploadID', async (req, res) => {
    try {
        const { userID, uploadID } = req.params;
        const query = 'DELETE FROM Receipts WHERE userID = ? AND receiptID = ?';
        const result = connection.query(query, [userID, uploadID]);
        
        return res.json({
            success: true,
            data: result,
        });
        
    } catch (err) {
        return res.status(500).json({
            message: "Deletion Failed",
            error: err.message
        });
    }
});
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
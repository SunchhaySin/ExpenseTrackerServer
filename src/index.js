import "./utils/loadEnv.js" // Import the Dotenv to access environment variable before other import which requires the env credentials
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import verifyToken from "./middleware/verifyToken.js";
import authRoutes from "./routes/auth.routes.js";
import uploadsRoutes from "./routes/upload.routes.js";
import aiRoutes from "./routes/ai.routes.js";



const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(cookieParser());

const allowedOrigins = [process.env.FRONTEND_URL];

if (process.env.NODE_ENV !== "production") {
  allowedOrigins.push("http://localhost:5173");
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked: ${origin}`));
      }
    },
    credentials: true,
  }),
);

// Public
app.use(authRoutes);

// Server Test Endpoint
app.get("/", (req, res) => {
  res.json({ message: "Server is running" });
});

// Protected
app.use(verifyToken);
app.use(uploadsRoutes);
app.use(aiRoutes);


app.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on port ${port}`);
});

// module.exports = app;
export default app;

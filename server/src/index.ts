import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// 1. THE CONNECTION LOGIC
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI as string);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ Error: ${error}`);
    process.exit(1); // Stop the server if the DB fails
  }
};

// 2. THE "PING" ROUTE (For the Kiosk/Frontend to check server health)
app.get("/api/health", (req, res) => {
  res.json({
    status: "Server is running",
    dbStatus:
      mongoose.connection.readyState === 1 ? "Connected" : "Disconnected",
  });
});

// 3. START THE ENGINE
app.listen(PORT, () => {
  connectDB();
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

import mongoose from "mongoose";

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

export default connectDB;

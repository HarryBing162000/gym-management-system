/**
 * env.ts
 * Must be the FIRST import in index.ts.
 * Loads .env before any other module executes,
 * so process.env is populated when middleware modules initialize.
 */
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

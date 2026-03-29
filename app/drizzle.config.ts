import { defineConfig } from "drizzle-kit";
import path from "path";

// Use __dirname-relative resolution — same strategy as db-path.ts
const DB_PATH = process.env.DATABASE_URL || path.join(__dirname, "data", "app.db");

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: DB_PATH,
  },
});

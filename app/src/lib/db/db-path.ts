/**
 * Canonical DB Path
 *
 * Single source of truth for the SQLite database file location.
 *
 * Uses process.cwd() which Next.js guarantees to be the project root
 * in both dev and production modes. The seed script must be run from
 * the app/ directory (which `npm run db:seed` does).
 *
 * All consumers (runtime, seed, drizzle config) MUST import from here.
 */

import path from "path";
import fs from "fs";

export const DB_PATH =
  process.env.DATABASE_URL || path.join(process.cwd(), "data", "app.db");

// Ensure the data directory exists
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

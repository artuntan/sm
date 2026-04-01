import { defineConfig } from "drizzle-kit";
import { loadProjectEnv } from "./scripts/lib/load-env.cjs";

loadProjectEnv({ cwd: process.cwd() });

const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
  migrations: {
    prefix: "timestamp",
  },
  ...(databaseUrl
    ? {
        dbCredentials: {
          url: databaseUrl,
        },
      }
    : {}),
});

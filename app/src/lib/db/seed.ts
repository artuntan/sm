/**
 * Database Seed — Teams + Bootstrap Admin Enrollment
 *
 * Idempotent: creates teams if they don't exist.
 * Enrolls the bootstrap admin as team_admin of all teams.
 *
 * Uses the canonical DB_PATH from db-path.ts so the seed
 * always hits the same database file as the runtime.
 *
 * Usage: npx tsx src/lib/db/seed.ts
 *        or: BOOTSTRAP_ADMIN_EMAIL=admin@dimes.com npx tsx src/lib/db/seed.ts
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, and } from "drizzle-orm";
import * as schema from "./schema";
import { DB_PATH } from "./db-path";

console.log(`📂 DB path: ${DB_PATH}`);

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

const db = drizzle(sqlite, { schema });

const SEED_TEAMS = [
  { id: "team_dimes_tr", slug: "dimes-tr", name: "Dimes TR" },
  { id: "team_dimes_club", slug: "dimes-club", name: "Dimes Club" },
  { id: "team_obsesso", slug: "obsesso", name: "Obsesso" },
];

async function seed() {
  console.log("🌱 Seeding database...");

  // Create teams
  for (const t of SEED_TEAMS) {
    const existing = await db
      .select()
      .from(schema.team)
      .where(eq(schema.team.slug, t.slug))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(schema.team).values({
        id: t.id,
        slug: t.slug,
        name: t.name,
        active: true,
        createdAt: new Date(),
      });
      console.log(`  ✓ Created team: ${t.name}`);
    } else {
      console.log(`  · Team exists: ${t.name}`);
    }
  }

  // Enroll bootstrap admin if exists
  const bootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
  if (bootstrapEmail) {
    const admins = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, bootstrapEmail.toLowerCase()))
      .limit(1);

    if (admins.length > 0) {
      const admin = admins[0];
      for (const t of SEED_TEAMS) {
        const existingMemberships = await db
          .select()
          .from(schema.teamMembership)
          .where(
            and(
              eq(schema.teamMembership.userId, admin.id),
              eq(schema.teamMembership.teamId, t.id)
            )
          )
          .limit(1);

        if (existingMemberships.length === 0) {
          await db.insert(schema.teamMembership).values({
            id: `mbr_${admin.id}_${t.id}`,
            userId: admin.id,
            teamId: t.id,
            role: "team_admin",
            active: true,
            joinedAt: new Date(),
          });
          console.log(`  ✓ Enrolled admin in: ${t.name}`);
        } else {
          console.log(`  · Admin already in: ${t.name}`);
        }
      }
    } else {
      console.log(`  · Bootstrap admin (${bootstrapEmail}) not yet signed up`);
    }
  } else {
    console.log(`  · No BOOTSTRAP_ADMIN_EMAIL set, skipping admin enrollment`);
  }

  console.log("✅ Seed complete");
  sqlite.close();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

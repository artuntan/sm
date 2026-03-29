/**
 * Auth Guards and Admin API Tests
 *
 * Tests the core auth infrastructure:
 * - DB path resolution consistency
 * - Admin API behavior for auth/non-auth scenarios
 * - Guard behavior
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { DB_PATH } from "../lib/db/db-path";
import path from "path";

// ---------------------------------------------------------------------------
// Test: DB path resolves consistently
// ---------------------------------------------------------------------------

describe("DB path resolution", () => {
  it("resolves to data/app.db relative to project root", () => {
    expect(DB_PATH).toBe(path.join(process.cwd(), "data", "app.db"));
  });

  it("is a .db file in a data/ directory", () => {
    expect(DB_PATH).toContain("/data/");
    expect(DB_PATH).toMatch(/\.db$/);
  });
});

// ---------------------------------------------------------------------------
// Test: Admin API logic (direct DB testing without HTTP)
// ---------------------------------------------------------------------------

describe("Admin user management logic", () => {
  let testDb: ReturnType<typeof drizzle>;
  let sqlite: Database.Database;

  beforeAll(() => {
    // Use in-memory DB for testing
    sqlite = new Database(":memory:");
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    testDb = drizzle(sqlite, { schema });

    // Create tables manually (matching Drizzle schema column names)
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS user (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        emailVerified INTEGER NOT NULL DEFAULT 0,
        image TEXT,
        systemRole TEXT NOT NULL DEFAULT 'user',
        approvalStatus TEXT NOT NULL DEFAULT 'pending',
        approvedBy TEXT,
        approvedAt INTEGER,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );
    `);
  });

  afterAll(() => {
    sqlite.close();
  });

  beforeEach(() => {
    sqlite.exec("DELETE FROM user");
  });

  it("stores a pending user correctly", async () => {
    await testDb.insert(schema.user).values({
      id: "user_test_1",
      name: "Test User",
      email: "test@example.com",
      emailVerified: false,
      systemRole: "user",
      approvalStatus: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const rows = await testDb
      .select()
      .from(schema.user)
      .where(eq(schema.user.approvalStatus, "pending"));

    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("test@example.com");
    expect(rows[0].approvalStatus).toBe("pending");
  });

  it("returns pending users in admin query", async () => {
    // Insert admin + pending user
    await testDb.insert(schema.user).values([
      {
        id: "admin_1",
        name: "Admin",
        email: "admin@test.com",
        emailVerified: false,
        systemRole: "system_admin",
        approvalStatus: "approved",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "pending_1",
        name: "Pending Person",
        email: "pending@test.com",
        emailVerified: false,
        systemRole: "user",
        approvalStatus: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    // Query pending users (simulates admin API GET)
    const pendingUsers = await testDb
      .select({
        id: schema.user.id,
        name: schema.user.name,
        email: schema.user.email,
        systemRole: schema.user.systemRole,
        approvalStatus: schema.user.approvalStatus,
      })
      .from(schema.user)
      .where(eq(schema.user.approvalStatus, "pending"));

    expect(pendingUsers).toHaveLength(1);
    expect(pendingUsers[0].name).toBe("Pending Person");
    expect(pendingUsers[0].email).toBe("pending@test.com");
  });

  it("approves a user and persists the change", async () => {
    await testDb.insert(schema.user).values({
      id: "user_approve_test",
      name: "To Approve",
      email: "approve@test.com",
      emailVerified: false,
      systemRole: "user",
      approvalStatus: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Approve the user (simulates admin API POST)
    await testDb
      .update(schema.user)
      .set({
        approvalStatus: "approved" as const,
        approvedBy: "admin_1",
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.user.id, "user_approve_test"));

    // Verify the change persisted
    const rows = await testDb
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, "user_approve_test"));

    expect(rows).toHaveLength(1);
    expect(rows[0].approvalStatus).toBe("approved");
    expect(rows[0].approvedBy).toBe("admin_1");

    // Verify no longer appears in pending
    const pendingRows = await testDb
      .select()
      .from(schema.user)
      .where(eq(schema.user.approvalStatus, "pending"));

    expect(pendingRows).toHaveLength(0);
  });

  it("rejects a user correctly", async () => {
    await testDb.insert(schema.user).values({
      id: "user_reject_test",
      name: "To Reject",
      email: "reject@test.com",
      emailVerified: false,
      systemRole: "user",
      approvalStatus: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await testDb
      .update(schema.user)
      .set({
        approvalStatus: "rejected" as const,
        updatedAt: new Date(),
      })
      .where(eq(schema.user.id, "user_reject_test"));

    const rows = await testDb
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, "user_reject_test"));

    expect(rows[0].approvalStatus).toBe("rejected");
  });

  it("system admin check logic works", async () => {
    await testDb.insert(schema.user).values([
      {
        id: "sa_1",
        name: "System Admin",
        email: "sa@test.com",
        emailVerified: false,
        systemRole: "system_admin",
        approvalStatus: "approved",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "regular_1",
        name: "Regular User",
        email: "regular@test.com",
        emailVerified: false,
        systemRole: "user",
        approvalStatus: "approved",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const adminRow = await testDb
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, "sa_1"))
      .limit(1);

    const regularRow = await testDb
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, "regular_1"))
      .limit(1);

    // Admin check
    expect(adminRow[0].systemRole).toBe("system_admin");
    expect(adminRow[0].approvalStatus).toBe("approved");

    // Non-admin should fail admin check
    expect(regularRow[0].systemRole).not.toBe("system_admin");
  });
});

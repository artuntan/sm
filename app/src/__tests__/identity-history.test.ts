/**
 * Identity, History & Profile Tests
 *
 * Tests:
 * - TeamContext includes name/slug
 * - Profile update via DB
 * - History detail data shape
 * - System admin history access
 * - FK constraint enforcement on teamId
 * - SchemaVersion support
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, and } from "drizzle-orm";
import * as schema from "../lib/db/schema";

describe("Identity, History & Profile", () => {
  let testDb: ReturnType<typeof drizzle>;
  let sqlite: Database.Database;

  beforeAll(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    testDb = drizzle(sqlite, { schema });

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

      CREATE TABLE IF NOT EXISTS team (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        createdAt INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS team_membership (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL REFERENCES user(id),
        teamId TEXT NOT NULL REFERENCES team(id),
        role TEXT NOT NULL DEFAULT 'member',
        active INTEGER NOT NULL DEFAULT 1,
        joinedAt INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS analysis_run (
        id TEXT PRIMARY KEY,
        teamId TEXT NOT NULL REFERENCES team(id),
        userId TEXT NOT NULL REFERENCES user(id),
        status TEXT NOT NULL DEFAULT 'running',
        totalRows INTEGER NOT NULL DEFAULT 0,
        completeRows INTEGER NOT NULL DEFAULT 0,
        partialRows INTEGER NOT NULL DEFAULT 0,
        errorRows INTEGER NOT NULL DEFAULT 0,
        inputSummary TEXT NOT NULL DEFAULT '[]',
        resultSnapshot TEXT NOT NULL DEFAULT '[]',
        startedAt INTEGER NOT NULL,
        completedAt INTEGER,
        schemaVersion INTEGER NOT NULL DEFAULT 1,
        note TEXT,
        archived INTEGER NOT NULL DEFAULT 0,
        tags TEXT NOT NULL DEFAULT '[]'
      );
    `);
  });

  afterAll(() => { sqlite.close(); });

  beforeEach(() => {
    sqlite.exec("DELETE FROM analysis_run");
    sqlite.exec("DELETE FROM team_membership");
    sqlite.exec("DELETE FROM team");
    sqlite.exec("DELETE FROM user");
  });

  // ---------------------------------------------------------------------------
  // Team context includes name/slug
  // ---------------------------------------------------------------------------

  it("team context query returns teamName and teamSlug", async () => {
    await testDb.insert(schema.team).values({
      id: "team_1", slug: "dimes-tr", name: "Dimes TR", active: true, createdAt: new Date(),
    });

    await testDb.insert(schema.user).values({
      id: "u1", name: "Test User", email: "test@test.com", emailVerified: false,
      systemRole: "user", approvalStatus: "approved", createdAt: new Date(), updatedAt: new Date(),
    });

    await testDb.insert(schema.teamMembership).values({
      id: "m1", userId: "u1", teamId: "team_1", role: "member", active: true, joinedAt: new Date(),
    });

    // Simulate what getTeamContext does
    const rows = await testDb
      .select({
        teamId: schema.teamMembership.teamId,
        role: schema.teamMembership.role,
        teamName: schema.team.name,
        teamSlug: schema.team.slug,
      })
      .from(schema.teamMembership)
      .innerJoin(schema.team, eq(schema.teamMembership.teamId, schema.team.id))
      .where(
        and(
          eq(schema.teamMembership.userId, "u1"),
          eq(schema.teamMembership.active, true)
        )
      )
      .limit(1);

    expect(rows).toHaveLength(1);
    expect(rows[0].teamName).toBe("Dimes TR");
    expect(rows[0].teamSlug).toBe("dimes-tr");
    expect(rows[0].role).toBe("member");
  });

  // ---------------------------------------------------------------------------
  // Profile update
  // ---------------------------------------------------------------------------

  it("can update user display name", async () => {
    await testDb.insert(schema.user).values({
      id: "u1", name: "Old Name", email: "test@test.com", emailVerified: false,
      systemRole: "user", approvalStatus: "approved", createdAt: new Date(), updatedAt: new Date(),
    });

    await testDb
      .update(schema.user)
      .set({ name: "New Name", updatedAt: new Date() })
      .where(eq(schema.user.id, "u1"));

    const rows = await testDb
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, "u1"))
      .limit(1);

    expect(rows[0].name).toBe("New Name");
  });

  // ---------------------------------------------------------------------------
  // History detail data shape
  // ---------------------------------------------------------------------------

  it("history detail returns full run with result snapshot", async () => {
    await testDb.insert(schema.team).values({
      id: "team_1", slug: "dimes-tr", name: "Dimes TR", active: true, createdAt: new Date(),
    });

    await testDb.insert(schema.user).values({
      id: "u1", name: "Test User", email: "test@test.com", emailVerified: false,
      systemRole: "user", approvalStatus: "approved", createdAt: new Date(), updatedAt: new Date(),
    });

    const inputSummary = JSON.stringify([{ instagram: "testhandle", tiktok: "tthandle" }]);
    const resultSnapshot = JSON.stringify([{ instagram: "testhandle", followers: 5000, engagementRate: 0.035 }]);

    await testDb.insert(schema.analysisRun).values({
      id: "run_1",
      teamId: "team_1",
      userId: "u1",
      status: "complete",
      totalRows: 1,
      completeRows: 1,
      partialRows: 0,
      errorRows: 0,
      inputSummary,
      resultSnapshot,
      schemaVersion: 2,
      startedAt: new Date(),
      completedAt: new Date(),
    });

    // Simulate detail API query
    const runs = await testDb
      .select({
        id: schema.analysisRun.id,
        teamId: schema.analysisRun.teamId,
        status: schema.analysisRun.status,
        totalRows: schema.analysisRun.totalRows,
        completeRows: schema.analysisRun.completeRows,
        inputSummary: schema.analysisRun.inputSummary,
        resultSnapshot: schema.analysisRun.resultSnapshot,
        schemaVersion: schema.analysisRun.schemaVersion,
        userName: schema.user.name,
      })
      .from(schema.analysisRun)
      .innerJoin(schema.user, eq(schema.analysisRun.userId, schema.user.id))
      .where(
        and(
          eq(schema.analysisRun.id, "run_1"),
          eq(schema.analysisRun.teamId, "team_1")
        )
      )
      .limit(1);

    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("complete");
    expect(runs[0].userName).toBe("Test User");
    expect(runs[0].schemaVersion).toBe(2);

    const parsed = JSON.parse(runs[0].resultSnapshot as string);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].followers).toBe(5000);
  });

  // ---------------------------------------------------------------------------
  // System admin can access any team's history
  // ---------------------------------------------------------------------------

  it("system admin can access history without team membership", async () => {
    await testDb.insert(schema.team).values({
      id: "team_1", slug: "dimes-tr", name: "Dimes TR", active: true, createdAt: new Date(),
    });

    await testDb.insert(schema.user).values([
      { id: "admin_1", name: "Admin", email: "admin@dimes.com", emailVerified: false, systemRole: "system_admin", approvalStatus: "approved", createdAt: new Date(), updatedAt: new Date() },
      { id: "u1", name: "User", email: "u@test.com", emailVerified: false, systemRole: "user", approvalStatus: "approved", createdAt: new Date(), updatedAt: new Date() },
    ]);

    await testDb.insert(schema.analysisRun).values({
      id: "run_1", teamId: "team_1", userId: "u1", status: "complete",
      totalRows: 3, completeRows: 3, partialRows: 0, errorRows: 0,
      inputSummary: "[]", resultSnapshot: "[]",
      startedAt: new Date(), completedAt: new Date(),
    });

    // Admin has no team membership — verify they can still query the run (no team filter)
    const adminMemberships = await testDb
      .select()
      .from(schema.teamMembership)
      .where(eq(schema.teamMembership.userId, "admin_1"));

    expect(adminMemberships).toHaveLength(0);

    // System admin reads run without team scoping
    const runs = await testDb
      .select()
      .from(schema.analysisRun)
      .where(eq(schema.analysisRun.id, "run_1"))
      .limit(1);

    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("complete");
    expect(runs[0].totalRows).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // Cross-team history isolation for normal users
  // ---------------------------------------------------------------------------

  it("normal user cannot access other team's history", async () => {
    await testDb.insert(schema.team).values([
      { id: "team_a", slug: "alpha", name: "Alpha", active: true, createdAt: new Date() },
      { id: "team_b", slug: "beta", name: "Beta", active: true, createdAt: new Date() },
    ]);

    await testDb.insert(schema.user).values({
      id: "u1", name: "User", email: "u@test.com", emailVerified: false,
      systemRole: "user", approvalStatus: "approved", createdAt: new Date(), updatedAt: new Date(),
    });

    await testDb.insert(schema.teamMembership).values({
      id: "m1", userId: "u1", teamId: "team_a", role: "member", active: true, joinedAt: new Date(),
    });

    await testDb.insert(schema.analysisRun).values({
      id: "run_b", teamId: "team_b", userId: "u1", status: "complete",
      totalRows: 1, completeRows: 1, partialRows: 0, errorRows: 0,
      inputSummary: "[]", resultSnapshot: "[]",
      startedAt: new Date(), completedAt: new Date(),
    });

    // User in team_a cannot access team_b's run (scoped by team)
    const runs = await testDb
      .select()
      .from(schema.analysisRun)
      .where(
        and(
          eq(schema.analysisRun.id, "run_b"),
          eq(schema.analysisRun.teamId, "team_a")
        )
      )
      .limit(1);

    // Should be empty — run belongs to team_b, not team_a
    expect(runs).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // FK constraint prevents invalid teamId
  // ---------------------------------------------------------------------------

  it("rejects analysis_run insert with non-existent teamId", async () => {
    await testDb.insert(schema.user).values({
      id: "u1", name: "Test User", email: "test@test.com", emailVerified: false,
      systemRole: "system_admin", approvalStatus: "approved", createdAt: new Date(), updatedAt: new Date(),
    });

    // Attempt to insert with teamId="system" which doesn't exist in team table
    await expect(
      testDb.insert(schema.analysisRun).values({
        id: "run_bad",
        teamId: "system",
        userId: "u1",
        status: "complete",
        totalRows: 1,
        completeRows: 1,
        partialRows: 0,
        errorRows: 0,
        inputSummary: "[]",
        resultSnapshot: "[]",
        startedAt: new Date(),
        completedAt: new Date(),
      })
    ).rejects.toThrow();
  });

  // ---------------------------------------------------------------------------
  // SchemaVersion defaults correctly
  // ---------------------------------------------------------------------------

  it("schemaVersion defaults to 1 when not specified", async () => {
    await testDb.insert(schema.team).values({
      id: "team_1", slug: "dimes-tr", name: "Dimes TR", active: true, createdAt: new Date(),
    });

    await testDb.insert(schema.user).values({
      id: "u1", name: "Test User", email: "test@test.com", emailVerified: false,
      systemRole: "user", approvalStatus: "approved", createdAt: new Date(), updatedAt: new Date(),
    });

    await testDb.insert(schema.analysisRun).values({
      id: "run_default",
      teamId: "team_1",
      userId: "u1",
      status: "complete",
      totalRows: 1,
      completeRows: 1,
      partialRows: 0,
      errorRows: 0,
      inputSummary: "[]",
      resultSnapshot: "[]",
      startedAt: new Date(),
      completedAt: new Date(),
    });

    const runs = await testDb
      .select({ schemaVersion: schema.analysisRun.schemaVersion })
      .from(schema.analysisRun)
      .where(eq(schema.analysisRun.id, "run_default"))
      .limit(1);

    expect(runs[0].schemaVersion).toBe(1);
  });
});

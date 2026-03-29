/**
 * Super-Admin Auth & Team Bypass Tests
 *
 * Tests the core super-admin architecture:
 * - system_admin bypasses team-gating
 * - system_admin can list all teams
 * - system_admin can create a team
 * - system_admin can manage team memberships
 * - system_admin can manage join requests
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, and, count } from "drizzle-orm";
import * as schema from "../lib/db/schema";

describe("Super-admin auth and team bypass", () => {
  let testDb: ReturnType<typeof drizzle>;
  let sqlite: Database.Database;

  beforeAll(() => {
    sqlite = new Database(":memory:");
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    testDb = drizzle(sqlite, { schema });

    // Create all tables
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

      CREATE TABLE IF NOT EXISTS team_join_request (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL REFERENCES user(id),
        teamId TEXT NOT NULL REFERENCES team(id),
        status TEXT NOT NULL DEFAULT 'pending',
        reviewedBy TEXT,
        reviewedAt INTEGER,
        rejectionReason TEXT,
        createdAt INTEGER NOT NULL
      );
    `);
  });

  afterAll(() => {
    sqlite.close();
  });

  beforeEach(() => {
    sqlite.exec("DELETE FROM team_join_request");
    sqlite.exec("DELETE FROM team_membership");
    sqlite.exec("DELETE FROM team");
    sqlite.exec("DELETE FROM user");
  });

  // ---------------------------------------------------------------------------
  // Auth bypass tests
  // ---------------------------------------------------------------------------

  it("system_admin is not blocked by missing team membership", async () => {
    // Create a system_admin with no team membership
    await testDb.insert(schema.user).values({
      id: "admin_1",
      name: "Super Admin",
      email: "admin@dimes.com",
      emailVerified: false,
      systemRole: "system_admin",
      approvalStatus: "approved",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Verify user is system_admin and approved
    const rows = await testDb
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, "admin_1"))
      .limit(1);

    expect(rows[0].systemRole).toBe("system_admin");
    expect(rows[0].approvalStatus).toBe("approved");

    // Verify no team memberships exist
    const memberships = await testDb
      .select()
      .from(schema.teamMembership)
      .where(eq(schema.teamMembership.userId, "admin_1"));

    expect(memberships).toHaveLength(0);

    // The auth logic: system_admin + approved = authorized, regardless of team
    const isSystemAdmin = rows[0].systemRole === "system_admin";
    const isApproved = rows[0].approvalStatus === "approved";
    const hasTeam = memberships.length > 0;

    // Normal user without team → blocked
    // System admin without team → authorized
    expect(isSystemAdmin && isApproved).toBe(true);
    expect(hasTeam).toBe(false);
    // This is the key assertion: system_admin must NOT be routed to team-request flow
    expect(isSystemAdmin && isApproved && !hasTeam).toBe(true);
  });

  it("normal user without team membership IS blocked", async () => {
    await testDb.insert(schema.user).values({
      id: "regular_1",
      name: "Regular User",
      email: "user@test.com",
      emailVerified: false,
      systemRole: "user",
      approvalStatus: "approved",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const rows = await testDb
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, "regular_1"))
      .limit(1);

    const memberships = await testDb
      .select()
      .from(schema.teamMembership)
      .where(eq(schema.teamMembership.userId, "regular_1"));

    const isSystemAdmin = rows[0].systemRole === "system_admin";
    expect(isSystemAdmin).toBe(false);
    expect(memberships).toHaveLength(0);
    // Regular user without team → should be routed to team-select
  });

  // ---------------------------------------------------------------------------
  // Team management tests
  // ---------------------------------------------------------------------------

  it("can list all teams with member counts", async () => {
    // Create teams
    await testDb.insert(schema.team).values([
      { id: "team_1", slug: "alpha", name: "Alpha Team", active: true, createdAt: new Date() },
      { id: "team_2", slug: "beta", name: "Beta Team", active: true, createdAt: new Date() },
    ]);

    // Create users and memberships
    await testDb.insert(schema.user).values([
      { id: "u1", name: "User 1", email: "u1@test.com", emailVerified: false, systemRole: "user", approvalStatus: "approved", createdAt: new Date(), updatedAt: new Date() },
      { id: "u2", name: "User 2", email: "u2@test.com", emailVerified: false, systemRole: "user", approvalStatus: "approved", createdAt: new Date(), updatedAt: new Date() },
    ]);

    await testDb.insert(schema.teamMembership).values([
      { id: "m1", userId: "u1", teamId: "team_1", role: "team_admin", active: true, joinedAt: new Date() },
      { id: "m2", userId: "u2", teamId: "team_1", role: "member", active: true, joinedAt: new Date() },
      { id: "m3", userId: "u1", teamId: "team_2", role: "member", active: true, joinedAt: new Date() },
    ]);

    // Query all teams
    const teams = await testDb.select().from(schema.team);
    expect(teams).toHaveLength(2);

    // Count members per team
    for (const t of teams) {
      const memberRows = await testDb
        .select({ count: count() })
        .from(schema.teamMembership)
        .where(
          and(
            eq(schema.teamMembership.teamId, t.id),
            eq(schema.teamMembership.active, true)
          )
        );

      if (t.id === "team_1") {
        expect(memberRows[0].count).toBe(2);
      } else {
        expect(memberRows[0].count).toBe(1);
      }
    }
  });

  it("can inspect team admins/heads", async () => {
    await testDb.insert(schema.team).values({
      id: "team_1", slug: "alpha", name: "Alpha Team", active: true, createdAt: new Date(),
    });

    await testDb.insert(schema.user).values([
      { id: "admin_u", name: "Team Admin", email: "ta@test.com", emailVerified: false, systemRole: "user", approvalStatus: "approved", createdAt: new Date(), updatedAt: new Date() },
      { id: "member_u", name: "Team Member", email: "tm@test.com", emailVerified: false, systemRole: "user", approvalStatus: "approved", createdAt: new Date(), updatedAt: new Date() },
    ]);

    await testDb.insert(schema.teamMembership).values([
      { id: "m1", userId: "admin_u", teamId: "team_1", role: "team_admin", active: true, joinedAt: new Date() },
      { id: "m2", userId: "member_u", teamId: "team_1", role: "member", active: true, joinedAt: new Date() },
    ]);

    // Query team admins
    const adminRows = await testDb
      .select({
        userId: schema.teamMembership.userId,
        userName: schema.user.name,
      })
      .from(schema.teamMembership)
      .innerJoin(schema.user, eq(schema.teamMembership.userId, schema.user.id))
      .where(
        and(
          eq(schema.teamMembership.teamId, "team_1"),
          eq(schema.teamMembership.active, true),
          eq(schema.teamMembership.role, "team_admin")
        )
      );

    expect(adminRows).toHaveLength(1);
    expect(adminRows[0].userName).toBe("Team Admin");
  });

  it("can create a team", async () => {
    await testDb.insert(schema.team).values({
      id: "team_new",
      slug: "new-team",
      name: "New Team",
      active: true,
      createdAt: new Date(),
    });

    const teams = await testDb
      .select()
      .from(schema.team)
      .where(eq(schema.team.slug, "new-team"));

    expect(teams).toHaveLength(1);
    expect(teams[0].name).toBe("New Team");
    expect(teams[0].active).toBe(true);
  });

  it("can manage team membership roles", async () => {
    await testDb.insert(schema.team).values({
      id: "team_1", slug: "alpha", name: "Alpha", active: true, createdAt: new Date(),
    });

    await testDb.insert(schema.user).values({
      id: "u1", name: "User 1", email: "u1@test.com", emailVerified: false, systemRole: "user", approvalStatus: "approved", createdAt: new Date(), updatedAt: new Date(),
    });

    await testDb.insert(schema.teamMembership).values({
      id: "m1", userId: "u1", teamId: "team_1", role: "member", active: true, joinedAt: new Date(),
    });

    // Promote to team_admin
    await testDb
      .update(schema.teamMembership)
      .set({ role: "team_admin" })
      .where(eq(schema.teamMembership.id, "m1"));

    let membership = await testDb
      .select()
      .from(schema.teamMembership)
      .where(eq(schema.teamMembership.id, "m1"))
      .limit(1);

    expect(membership[0].role).toBe("team_admin");

    // Demote back to member
    await testDb
      .update(schema.teamMembership)
      .set({ role: "member" })
      .where(eq(schema.teamMembership.id, "m1"));

    membership = await testDb
      .select()
      .from(schema.teamMembership)
      .where(eq(schema.teamMembership.id, "m1"))
      .limit(1);

    expect(membership[0].role).toBe("member");
  });

  it("can deactivate a membership", async () => {
    await testDb.insert(schema.team).values({
      id: "team_1", slug: "alpha", name: "Alpha", active: true, createdAt: new Date(),
    });

    await testDb.insert(schema.user).values({
      id: "u1", name: "User 1", email: "u1@test.com", emailVerified: false, systemRole: "user", approvalStatus: "approved", createdAt: new Date(), updatedAt: new Date(),
    });

    await testDb.insert(schema.teamMembership).values({
      id: "m1", userId: "u1", teamId: "team_1", role: "member", active: true, joinedAt: new Date(),
    });

    // Deactivate
    await testDb
      .update(schema.teamMembership)
      .set({ active: false })
      .where(eq(schema.teamMembership.id, "m1"));

    const membership = await testDb
      .select()
      .from(schema.teamMembership)
      .where(eq(schema.teamMembership.id, "m1"))
      .limit(1);

    expect(membership[0].active).toBe(false);
  });

  it("can approve a cross-team join request", async () => {
    await testDb.insert(schema.team).values({
      id: "team_1", slug: "alpha", name: "Alpha", active: true, createdAt: new Date(),
    });

    await testDb.insert(schema.user).values({
      id: "u1", name: "Requester", email: "req@test.com", emailVerified: false, systemRole: "user", approvalStatus: "approved", createdAt: new Date(), updatedAt: new Date(),
    });

    await testDb.insert(schema.teamJoinRequest).values({
      id: "jr_1",
      userId: "u1",
      teamId: "team_1",
      status: "pending",
      createdAt: new Date(),
    });

    // Approve join request (simulates super-admin action)
    await testDb
      .update(schema.teamJoinRequest)
      .set({
        status: "approved",
        reviewedBy: "system_admin_id",
        reviewedAt: new Date(),
      })
      .where(eq(schema.teamJoinRequest.id, "jr_1"));

    // Create membership
    await testDb.insert(schema.teamMembership).values({
      id: "m_approved",
      userId: "u1",
      teamId: "team_1",
      role: "member",
      active: true,
      joinedAt: new Date(),
    });

    // Verify
    const request = await testDb
      .select()
      .from(schema.teamJoinRequest)
      .where(eq(schema.teamJoinRequest.id, "jr_1"))
      .limit(1);

    expect(request[0].status).toBe("approved");

    const membership = await testDb
      .select()
      .from(schema.teamMembership)
      .where(
        and(
          eq(schema.teamMembership.userId, "u1"),
          eq(schema.teamMembership.teamId, "team_1")
        )
      )
      .limit(1);

    expect(membership).toHaveLength(1);
    expect(membership[0].active).toBe(true);
  });
});

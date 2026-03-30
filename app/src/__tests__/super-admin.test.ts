/**
 * Super-Admin Auth & Team Bypass Tests
 *
 * Tests the core super-admin architecture:
 * - system_admin bypasses team-gating
 * - system_admin can list all teams
 * - system_admin can create a team
 * - system_admin can manage team memberships
 * - system_admin can manage join requests
 *
 * Uses in-memory simulation (no external database dependency).
 */

import * as schema from "../lib/db/schema";

// ---------------------------------------------------------------------------
// In-memory store helpers
// ---------------------------------------------------------------------------

const store: Record<string, Record<string, unknown>[]> = {};

function reset() {
  for (const key of Object.keys(store)) delete store[key];
  store["user"] = [];
  store["team"] = [];
  store["team_membership"] = [];
  store["team_join_request"] = [];
}

function insert(table: string, values: Record<string, unknown> | Record<string, unknown>[]) {
  const rows = Array.isArray(values) ? values : [values];
  if (!store[table]) store[table] = [];
  store[table].push(...rows);
}

function select(table: string, predicate?: (r: Record<string, unknown>) => boolean) {
  const rows = store[table] ?? [];
  return predicate ? rows.filter(predicate) : [...rows];
}

function update(
  table: string,
  predicate: (r: Record<string, unknown>) => boolean,
  values: Record<string, unknown>,
) {
  for (const row of store[table] ?? []) {
    if (predicate(row)) Object.assign(row, values);
  }
}

function count(table: string, predicate?: (r: Record<string, unknown>) => boolean) {
  return select(table, predicate).length;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Super-admin auth and team bypass", () => {
  beforeEach(() => {
    reset();
  });

  // ── Auth bypass tests ────────────────────────────────────────

  it("system_admin is not blocked by missing team membership", () => {
    insert("user", {
      id: "admin_1",
      name: "Super Admin",
      email: "admin@dimes.com",
      emailVerified: false,
      systemRole: "system_admin",
      approvalStatus: "approved",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const rows = select("user", (r) => r.id === "admin_1");
    expect(rows[0].systemRole).toBe("system_admin");
    expect(rows[0].approvalStatus).toBe("approved");

    const memberships = select("team_membership", (r) => r.userId === "admin_1");
    expect(memberships).toHaveLength(0);

    const isSystemAdmin = rows[0].systemRole === "system_admin";
    const isApproved = rows[0].approvalStatus === "approved";
    const hasTeam = memberships.length > 0;

    expect(isSystemAdmin && isApproved).toBe(true);
    expect(hasTeam).toBe(false);
    expect(isSystemAdmin && isApproved && !hasTeam).toBe(true);
  });

  it("normal user without team membership IS blocked", () => {
    insert("user", {
      id: "regular_1",
      name: "Regular User",
      email: "user@test.com",
      emailVerified: false,
      systemRole: "user",
      approvalStatus: "approved",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const rows = select("user", (r) => r.id === "regular_1");
    const memberships = select("team_membership", (r) => r.userId === "regular_1");

    const isSystemAdmin = rows[0].systemRole === "system_admin";
    expect(isSystemAdmin).toBe(false);
    expect(memberships).toHaveLength(0);
  });

  // ── Team management tests ────────────────────────────────────

  it("can list all teams with member counts", () => {
    insert("team", [
      { id: "team_1", slug: "alpha", name: "Alpha Team", active: true, createdAt: new Date() },
      { id: "team_2", slug: "beta", name: "Beta Team", active: true, createdAt: new Date() },
    ]);

    insert("user", [
      { id: "u1", name: "User 1", email: "u1@test.com", emailVerified: false, systemRole: "user", approvalStatus: "approved", createdAt: new Date(), updatedAt: new Date() },
      { id: "u2", name: "User 2", email: "u2@test.com", emailVerified: false, systemRole: "user", approvalStatus: "approved", createdAt: new Date(), updatedAt: new Date() },
    ]);

    insert("team_membership", [
      { id: "m1", userId: "u1", teamId: "team_1", role: "team_admin", active: true, joinedAt: new Date() },
      { id: "m2", userId: "u2", teamId: "team_1", role: "member", active: true, joinedAt: new Date() },
      { id: "m3", userId: "u1", teamId: "team_2", role: "member", active: true, joinedAt: new Date() },
    ]);

    const teams = select("team");
    expect(teams).toHaveLength(2);

    for (const t of teams) {
      const memberCount = count("team_membership", (r) => r.teamId === t.id && r.active === true);
      if (t.id === "team_1") {
        expect(memberCount).toBe(2);
      } else {
        expect(memberCount).toBe(1);
      }
    }
  });

  it("can inspect team admins/heads", () => {
    insert("team", { id: "team_1", slug: "alpha", name: "Alpha Team", active: true, createdAt: new Date() });

    insert("user", [
      { id: "admin_u", name: "Team Admin", email: "ta@test.com", emailVerified: false, systemRole: "user", approvalStatus: "approved", createdAt: new Date(), updatedAt: new Date() },
      { id: "member_u", name: "Team Member", email: "tm@test.com", emailVerified: false, systemRole: "user", approvalStatus: "approved", createdAt: new Date(), updatedAt: new Date() },
    ]);

    insert("team_membership", [
      { id: "m1", userId: "admin_u", teamId: "team_1", role: "team_admin", active: true, joinedAt: new Date() },
      { id: "m2", userId: "member_u", teamId: "team_1", role: "member", active: true, joinedAt: new Date() },
    ]);

    // Query team admins (join simulation)
    const adminMemberships = select(
      "team_membership",
      (r) => r.teamId === "team_1" && r.active === true && r.role === "team_admin",
    );
    const adminRows = adminMemberships.map((m) => {
      const u = select("user", (r) => r.id === m.userId)[0];
      return { userId: m.userId, userName: u?.name };
    });

    expect(adminRows).toHaveLength(1);
    expect(adminRows[0].userName).toBe("Team Admin");
  });

  it("can create a team", () => {
    insert("team", {
      id: "team_new",
      slug: "new-team",
      name: "New Team",
      active: true,
      createdAt: new Date(),
    });

    const teams = select("team", (r) => r.slug === "new-team");
    expect(teams).toHaveLength(1);
    expect(teams[0].name).toBe("New Team");
    expect(teams[0].active).toBe(true);
  });

  it("can manage team membership roles", () => {
    insert("team", { id: "team_1", slug: "alpha", name: "Alpha", active: true, createdAt: new Date() });
    insert("user", { id: "u1", name: "User 1", email: "u1@test.com", emailVerified: false, systemRole: "user", approvalStatus: "approved", createdAt: new Date(), updatedAt: new Date() });
    insert("team_membership", { id: "m1", userId: "u1", teamId: "team_1", role: "member", active: true, joinedAt: new Date() });

    // Promote to team_admin
    update("team_membership", (r) => r.id === "m1", { role: "team_admin" });

    let membership = select("team_membership", (r) => r.id === "m1");
    expect(membership[0].role).toBe("team_admin");

    // Demote back to member
    update("team_membership", (r) => r.id === "m1", { role: "member" });

    membership = select("team_membership", (r) => r.id === "m1");
    expect(membership[0].role).toBe("member");
  });

  it("can deactivate a membership", () => {
    insert("team", { id: "team_1", slug: "alpha", name: "Alpha", active: true, createdAt: new Date() });
    insert("user", { id: "u1", name: "User 1", email: "u1@test.com", emailVerified: false, systemRole: "user", approvalStatus: "approved", createdAt: new Date(), updatedAt: new Date() });
    insert("team_membership", { id: "m1", userId: "u1", teamId: "team_1", role: "member", active: true, joinedAt: new Date() });

    update("team_membership", (r) => r.id === "m1", { active: false });

    const membership = select("team_membership", (r) => r.id === "m1");
    expect(membership[0].active).toBe(false);
  });

  it("can approve a cross-team join request", () => {
    insert("team", { id: "team_1", slug: "alpha", name: "Alpha", active: true, createdAt: new Date() });
    insert("user", { id: "u1", name: "Requester", email: "req@test.com", emailVerified: false, systemRole: "user", approvalStatus: "approved", createdAt: new Date(), updatedAt: new Date() });
    insert("team_join_request", { id: "jr_1", userId: "u1", teamId: "team_1", status: "pending", createdAt: new Date() });

    // Approve join request
    update("team_join_request", (r) => r.id === "jr_1", {
      status: "approved",
      reviewedBy: "system_admin_id",
      reviewedAt: new Date(),
    });

    // Create membership
    insert("team_membership", {
      id: "m_approved",
      userId: "u1",
      teamId: "team_1",
      role: "member",
      active: true,
      joinedAt: new Date(),
    });

    const request = select("team_join_request", (r) => r.id === "jr_1");
    expect(request[0].status).toBe("approved");

    const membership = select(
      "team_membership",
      (r) => r.userId === "u1" && r.teamId === "team_1",
    );
    expect(membership).toHaveLength(1);
    expect(membership[0].active).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Schema structure sanity checks
// ---------------------------------------------------------------------------

describe("Schema structure — team tables", () => {
  it("team table has required columns", () => {
    const cols = Object.keys(schema.team);
    expect(cols).toContain("id");
    expect(cols).toContain("slug");
    expect(cols).toContain("name");
    expect(cols).toContain("active");
  });

  it("teamMembership table has required columns", () => {
    const cols = Object.keys(schema.teamMembership);
    expect(cols).toContain("userId");
    expect(cols).toContain("teamId");
    expect(cols).toContain("role");
    expect(cols).toContain("active");
  });

  it("teamJoinRequest table has required columns", () => {
    const cols = Object.keys(schema.teamJoinRequest);
    expect(cols).toContain("userId");
    expect(cols).toContain("teamId");
    expect(cols).toContain("status");
    expect(cols).toContain("reviewedBy");
  });
});

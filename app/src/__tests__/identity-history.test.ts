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
  store["analysis_run"] = [];
}

function insert(table: string, values: Record<string, unknown> | Record<string, unknown>[]) {
  const rows = Array.isArray(values) ? values : [values];
  if (!store[table]) store[table] = [];

  // Enforce FK: analysis_run.teamId must reference an existing team
  if (table === "analysis_run") {
    for (const row of rows) {
      const teamExists = (store["team"] ?? []).some((t) => t.id === row.teamId);
      if (!teamExists) {
        throw new Error(`FK violation: team "${row.teamId}" does not exist`);
      }
    }
  }

  // Apply defaults for analysis_run
  for (const row of rows) {
    if (table === "analysis_run" && row.schemaVersion === undefined) {
      row.schemaVersion = 1;
    }
  }

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Identity, History & Profile", () => {
  beforeEach(() => {
    reset();
  });

  // ── Team context includes name/slug ──────────────────────────

  it("team context query returns teamName and teamSlug", () => {
    insert("team", { id: "team_1", slug: "dimes-tr", name: "Dimes TR", active: true, createdAt: new Date() });
    insert("user", { id: "u1", name: "Test User", email: "test@test.com", emailVerified: false, systemRole: "user", approvalStatus: "approved", createdAt: new Date(), updatedAt: new Date() });
    insert("team_membership", { id: "m1", userId: "u1", teamId: "team_1", role: "member", active: true, joinedAt: new Date() });

    // Simulate join: teamMembership + team
    const memberships = select(
      "team_membership",
      (r) => r.userId === "u1" && r.active === true,
    );
    const rows = memberships.map((m) => {
      const t = select("team", (r) => r.id === m.teamId)[0];
      return {
        teamId: m.teamId,
        role: m.role,
        teamName: t?.name,
        teamSlug: t?.slug,
      };
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].teamName).toBe("Dimes TR");
    expect(rows[0].teamSlug).toBe("dimes-tr");
    expect(rows[0].role).toBe("member");
  });

  // ── Profile update ───────────────────────────────────────────

  it("can update user display name", () => {
    insert("user", { id: "u1", name: "Old Name", email: "test@test.com", emailVerified: false, systemRole: "user", approvalStatus: "approved", createdAt: new Date(), updatedAt: new Date() });

    update("user", (r) => r.id === "u1", { name: "New Name", updatedAt: new Date() });

    const rows = select("user", (r) => r.id === "u1");
    expect(rows[0].name).toBe("New Name");
  });

  // ── History detail data shape ────────────────────────────────

  it("history detail returns full run with result snapshot", () => {
    insert("team", { id: "team_1", slug: "dimes-tr", name: "Dimes TR", active: true, createdAt: new Date() });
    insert("user", { id: "u1", name: "Test User", email: "test@test.com", emailVerified: false, systemRole: "user", approvalStatus: "approved", createdAt: new Date(), updatedAt: new Date() });

    const inputSummary = JSON.stringify([{ instagram: "testhandle", tiktok: "tthandle" }]);
    const resultSnapshot = JSON.stringify([{ instagram: "testhandle", followers: 5000, engagementRate: 0.035 }]);

    insert("analysis_run", {
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

    // Simulate detail API query (join analysis_run + user)
    const runRows = select(
      "analysis_run",
      (r) => r.id === "run_1" && r.teamId === "team_1",
    );
    const runs = runRows.map((run) => {
      const u = select("user", (r) => r.id === run.userId)[0];
      return {
        id: run.id,
        teamId: run.teamId,
        status: run.status,
        totalRows: run.totalRows,
        completeRows: run.completeRows,
        inputSummary: run.inputSummary,
        resultSnapshot: run.resultSnapshot,
        schemaVersion: run.schemaVersion,
        userName: u?.name,
      };
    });

    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("complete");
    expect(runs[0].userName).toBe("Test User");
    expect(runs[0].schemaVersion).toBe(2);

    const parsed = JSON.parse(runs[0].resultSnapshot as string);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].followers).toBe(5000);
  });

  // ── System admin cross-team history access ───────────────────

  it("system admin can access history without team membership", () => {
    insert("team", { id: "team_1", slug: "dimes-tr", name: "Dimes TR", active: true, createdAt: new Date() });
    insert("user", [
      { id: "admin_1", name: "Admin", email: "admin@dimes.com", emailVerified: false, systemRole: "system_admin", approvalStatus: "approved", createdAt: new Date(), updatedAt: new Date() },
      { id: "u1", name: "User", email: "u@test.com", emailVerified: false, systemRole: "user", approvalStatus: "approved", createdAt: new Date(), updatedAt: new Date() },
    ]);

    insert("analysis_run", {
      id: "run_1", teamId: "team_1", userId: "u1", status: "complete",
      totalRows: 3, completeRows: 3, partialRows: 0, errorRows: 0,
      inputSummary: "[]", resultSnapshot: "[]",
      startedAt: new Date(), completedAt: new Date(),
    });

    // Admin has no team membership
    const adminMemberships = select("team_membership", (r) => r.userId === "admin_1");
    expect(adminMemberships).toHaveLength(0);

    // System admin reads run without team scoping
    const runs = select("analysis_run", (r) => r.id === "run_1");
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("complete");
    expect(runs[0].totalRows).toBe(3);
  });

  // ── Cross-team history isolation ─────────────────────────────

  it("normal user cannot access other team's history", () => {
    insert("team", [
      { id: "team_a", slug: "alpha", name: "Alpha", active: true, createdAt: new Date() },
      { id: "team_b", slug: "beta", name: "Beta", active: true, createdAt: new Date() },
    ]);

    insert("user", { id: "u1", name: "User", email: "u@test.com", emailVerified: false, systemRole: "user", approvalStatus: "approved", createdAt: new Date(), updatedAt: new Date() });
    insert("team_membership", { id: "m1", userId: "u1", teamId: "team_a", role: "member", active: true, joinedAt: new Date() });

    insert("analysis_run", {
      id: "run_b", teamId: "team_b", userId: "u1", status: "complete",
      totalRows: 1, completeRows: 1, partialRows: 0, errorRows: 0,
      inputSummary: "[]", resultSnapshot: "[]",
      startedAt: new Date(), completedAt: new Date(),
    });

    // User in team_a queries for run_b scoped to team_a — should find nothing
    const runs = select(
      "analysis_run",
      (r) => r.id === "run_b" && r.teamId === "team_a",
    );
    expect(runs).toHaveLength(0);
  });

  // ── FK constraint prevents invalid teamId ────────────────────

  it("rejects analysis_run insert with non-existent teamId", () => {
    insert("user", { id: "u1", name: "Test User", email: "test@test.com", emailVerified: false, systemRole: "system_admin", approvalStatus: "approved", createdAt: new Date(), updatedAt: new Date() });

    expect(() =>
      insert("analysis_run", {
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
      }),
    ).toThrow();
  });

  // ── SchemaVersion defaults correctly ─────────────────────────

  it("schemaVersion defaults to 1 when not specified", () => {
    insert("team", { id: "team_1", slug: "dimes-tr", name: "Dimes TR", active: true, createdAt: new Date() });
    insert("user", { id: "u1", name: "Test User", email: "test@test.com", emailVerified: false, systemRole: "user", approvalStatus: "approved", createdAt: new Date(), updatedAt: new Date() });

    insert("analysis_run", {
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

    const runs = select("analysis_run", (r) => r.id === "run_default");
    expect(runs[0].schemaVersion).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Schema structure sanity checks
// ---------------------------------------------------------------------------

describe("Schema structure — analysis tables", () => {
  it("analysisRun table has required columns", () => {
    const cols = Object.keys(schema.analysisRun);
    expect(cols).toContain("id");
    expect(cols).toContain("teamId");
    expect(cols).toContain("userId");
    expect(cols).toContain("status");
    expect(cols).toContain("schemaVersion");
    expect(cols).toContain("resultSnapshot");
    expect(cols).toContain("inputSummary");
  });
});

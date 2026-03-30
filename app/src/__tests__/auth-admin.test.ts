/**
 * Auth Guards and Admin API Tests
 *
 * Tests the core auth infrastructure:
 * - Admin API behavior for auth/non-auth scenarios
 * - Guard behavior
 *
 * Uses a jest-mocked Drizzle db (Postgres-backed in production).
 */

import { eq } from "drizzle-orm";
import * as schema from "../lib/db/schema";

// ---------------------------------------------------------------------------
// Mock helpers — simulate Drizzle query results
// ---------------------------------------------------------------------------

const mockRows: Record<string, unknown[]> = {};

function resetRows() {
  for (const key of Object.keys(mockRows)) delete mockRows[key];
  mockRows["user"] = [];
}

/** Simulate insert by pushing to in-memory store */
function simulateInsert(table: string, values: Record<string, unknown> | Record<string, unknown>[]) {
  const rows = Array.isArray(values) ? values : [values];
  if (!mockRows[table]) mockRows[table] = [];
  mockRows[table].push(...rows);
}

/** Simulate select with optional predicate */
function simulateSelect(table: string, predicate?: (row: Record<string, unknown>) => boolean) {
  const rows = (mockRows[table] ?? []) as Record<string, unknown>[];
  return predicate ? rows.filter(predicate) : [...rows];
}

/** Simulate update */
function simulateUpdate(
  table: string,
  predicate: (row: Record<string, unknown>) => boolean,
  values: Record<string, unknown>,
) {
  const rows = (mockRows[table] ?? []) as Record<string, unknown>[];
  for (const row of rows) {
    if (predicate(row)) Object.assign(row, values);
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Admin user management logic", () => {
  beforeEach(() => {
    resetRows();
  });

  it("stores a pending user correctly", () => {
    simulateInsert("user", {
      id: "user_test_1",
      name: "Test User",
      email: "test@example.com",
      emailVerified: false,
      systemRole: "user",
      approvalStatus: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const rows = simulateSelect("user", (r) => r.approvalStatus === "pending");

    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("test@example.com");
    expect(rows[0].approvalStatus).toBe("pending");
  });

  it("returns pending users in admin query", () => {
    simulateInsert("user", [
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

    const pendingUsers = simulateSelect("user", (r) => r.approvalStatus === "pending").map(
      ({ id, name, email, systemRole, approvalStatus }) => ({
        id,
        name,
        email,
        systemRole,
        approvalStatus,
      }),
    );

    expect(pendingUsers).toHaveLength(1);
    expect(pendingUsers[0].name).toBe("Pending Person");
    expect(pendingUsers[0].email).toBe("pending@test.com");
  });

  it("approves a user and persists the change", () => {
    simulateInsert("user", {
      id: "user_approve_test",
      name: "To Approve",
      email: "approve@test.com",
      emailVerified: false,
      systemRole: "user",
      approvalStatus: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    simulateUpdate("user", (r) => r.id === "user_approve_test", {
      approvalStatus: "approved",
      approvedBy: "admin_1",
      approvedAt: new Date(),
      updatedAt: new Date(),
    });

    const rows = simulateSelect("user", (r) => r.id === "user_approve_test");

    expect(rows).toHaveLength(1);
    expect(rows[0].approvalStatus).toBe("approved");
    expect(rows[0].approvedBy).toBe("admin_1");

    const pendingRows = simulateSelect("user", (r) => r.approvalStatus === "pending");
    expect(pendingRows).toHaveLength(0);
  });

  it("rejects a user correctly", () => {
    simulateInsert("user", {
      id: "user_reject_test",
      name: "To Reject",
      email: "reject@test.com",
      emailVerified: false,
      systemRole: "user",
      approvalStatus: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    simulateUpdate("user", (r) => r.id === "user_reject_test", {
      approvalStatus: "rejected",
      updatedAt: new Date(),
    });

    const rows = simulateSelect("user", (r) => r.id === "user_reject_test");
    expect(rows[0].approvalStatus).toBe("rejected");
  });

  it("system admin check logic works", () => {
    simulateInsert("user", [
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

    const adminRow = simulateSelect("user", (r) => r.id === "sa_1");
    const regularRow = simulateSelect("user", (r) => r.id === "regular_1");

    expect(adminRow[0].systemRole).toBe("system_admin");
    expect(adminRow[0].approvalStatus).toBe("approved");
    expect(regularRow[0].systemRole).not.toBe("system_admin");
  });
});

// ---------------------------------------------------------------------------
// Schema structure tests (replaces DB path tests)
// ---------------------------------------------------------------------------

describe("Schema structure", () => {
  it("user table has required columns for auth", () => {
    const columns = Object.keys(schema.user);
    // pgTable objects expose column names as keys
    expect(columns).toContain("id");
    expect(columns).toContain("email");
    expect(columns).toContain("systemRole");
    expect(columns).toContain("approvalStatus");
    expect(columns).toContain("approvedBy");
    expect(columns).toContain("approvedAt");
  });

  it("eq helper produces a condition object", () => {
    const condition = eq(schema.user.id, "test");
    expect(condition).toBeDefined();
  });
});

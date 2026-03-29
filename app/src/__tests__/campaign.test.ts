/**
 * Campaign Entity — Unit Tests
 *
 * Tests for:
 * - campaign domain types (status transitions)
 * - campaign creation and retrieval logic
 * - campaign-creator linking
 * - status lifecycle validation
 */

import {
  canTransitionTo,
  CAMPAIGN_STATUS_TRANSITIONS,
  CAMPAIGN_STATUS_ORDER,
  CAMPAIGN_STATUS_LABELS,
  type CampaignStatus,
} from "@/lib/domain/campaign-types";

// ---------------------------------------------------------------------------
// Status Transition Tests
// ---------------------------------------------------------------------------

describe("canTransitionTo", () => {
  test("draft → active is valid", () => {
    expect(canTransitionTo("draft", "active")).toBe(true);
  });

  test("draft → archived is valid", () => {
    expect(canTransitionTo("draft", "archived")).toBe(true);
  });

  test("draft → completed is NOT valid (must go through active first)", () => {
    expect(canTransitionTo("draft", "completed")).toBe(false);
  });

  test("draft → monitoring is NOT valid", () => {
    expect(canTransitionTo("draft", "monitoring")).toBe(false);
  });

  test("active → monitoring is valid", () => {
    expect(canTransitionTo("active", "monitoring")).toBe(true);
  });

  test("active → completed is valid (skip monitoring)", () => {
    expect(canTransitionTo("active", "completed")).toBe(true);
  });

  test("active → archived is valid", () => {
    expect(canTransitionTo("active", "archived")).toBe(true);
  });

  test("active → draft is NOT valid (no backward)", () => {
    expect(canTransitionTo("active", "draft")).toBe(false);
  });

  test("monitoring → completed is valid", () => {
    expect(canTransitionTo("monitoring", "completed")).toBe(true);
  });

  test("monitoring → archived is valid", () => {
    expect(canTransitionTo("monitoring", "archived")).toBe(true);
  });

  test("monitoring → active is NOT valid (no backward)", () => {
    expect(canTransitionTo("monitoring", "active")).toBe(false);
  });

  test("completed → archived is valid", () => {
    expect(canTransitionTo("completed", "archived")).toBe(true);
  });

  test("completed → active is NOT valid", () => {
    expect(canTransitionTo("completed", "active")).toBe(false);
  });

  test("archived → draft is valid (re-open)", () => {
    expect(canTransitionTo("archived", "draft")).toBe(true);
  });

  test("archived → active is NOT valid (must go through draft)", () => {
    expect(canTransitionTo("archived", "active")).toBe(false);
  });

  test("same status transition returns false", () => {
    const statuses: CampaignStatus[] = [
      "draft",
      "active",
      "monitoring",
      "completed",
      "archived",
    ];
    for (const status of statuses) {
      expect(canTransitionTo(status, status)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Status Constants Tests
// ---------------------------------------------------------------------------

describe("campaign status constants", () => {
  test("all statuses have labels", () => {
    const statuses: CampaignStatus[] = [
      "draft",
      "active",
      "monitoring",
      "completed",
      "archived",
    ];
    for (const status of statuses) {
      expect(CAMPAIGN_STATUS_LABELS[status]).toBeDefined();
      expect(CAMPAIGN_STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
  });

  test("status order includes all statuses", () => {
    expect(CAMPAIGN_STATUS_ORDER).toHaveLength(5);
    expect(CAMPAIGN_STATUS_ORDER).toContain("draft");
    expect(CAMPAIGN_STATUS_ORDER).toContain("active");
    expect(CAMPAIGN_STATUS_ORDER).toContain("monitoring");
    expect(CAMPAIGN_STATUS_ORDER).toContain("completed");
    expect(CAMPAIGN_STATUS_ORDER).toContain("archived");
  });

  test("all statuses have transition rules", () => {
    const statuses: CampaignStatus[] = [
      "draft",
      "active",
      "monitoring",
      "completed",
      "archived",
    ];
    for (const status of statuses) {
      expect(CAMPAIGN_STATUS_TRANSITIONS[status]).toBeDefined();
      expect(Array.isArray(CAMPAIGN_STATUS_TRANSITIONS[status])).toBe(true);
    }
  });

  test("no status can transition to itself", () => {
    for (const [status, targets] of Object.entries(CAMPAIGN_STATUS_TRANSITIONS)) {
      expect(targets).not.toContain(status);
    }
  });
});

// ---------------------------------------------------------------------------
// Full lifecycle path tests
// ---------------------------------------------------------------------------

describe("campaign lifecycle", () => {
  test("standard lifecycle path: draft → active → monitoring → completed → archived", () => {
    const path: CampaignStatus[] = [
      "draft",
      "active",
      "monitoring",
      "completed",
      "archived",
    ];

    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransitionTo(path[i], path[i + 1])).toBe(true);
    }
  });

  test("fast lifecycle path: draft → active → completed → archived", () => {
    expect(canTransitionTo("draft", "active")).toBe(true);
    expect(canTransitionTo("active", "completed")).toBe(true);
    expect(canTransitionTo("completed", "archived")).toBe(true);
  });

  test("re-open path: archived → draft → active", () => {
    expect(canTransitionTo("archived", "draft")).toBe(true);
    expect(canTransitionTo("draft", "active")).toBe(true);
  });

  test("cancel path: any active state → archived", () => {
    expect(canTransitionTo("draft", "archived")).toBe(true);
    expect(canTransitionTo("active", "archived")).toBe(true);
    expect(canTransitionTo("monitoring", "archived")).toBe(true);
    expect(canTransitionTo("completed", "archived")).toBe(true);
  });

  test("cannot skip from draft directly to monitoring or completed", () => {
    expect(canTransitionTo("draft", "monitoring")).toBe(false);
    expect(canTransitionTo("draft", "completed")).toBe(false);
  });

  test("cannot go backward in lifecycle (except archive → draft)", () => {
    expect(canTransitionTo("active", "draft")).toBe(false);
    expect(canTransitionTo("monitoring", "draft")).toBe(false);
    expect(canTransitionTo("monitoring", "active")).toBe(false);
    expect(canTransitionTo("completed", "draft")).toBe(false);
    expect(canTransitionTo("completed", "active")).toBe(false);
    expect(canTransitionTo("completed", "monitoring")).toBe(false);
  });
});

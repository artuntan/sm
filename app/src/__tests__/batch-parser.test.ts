/**
 * Tests for batch-parser.ts
 *
 * Covers CSV, TSV, newline-separated parsing, header detection,
 * handle normalization, validation, and deduplication.
 */

import {
  parseBatchInput,
  normalizeHandle,
  isValidHandle,
  extractUniqueHandles,
} from "@/lib/domain/batch-parser";

describe("normalizeHandle", () => {
  it("strips @ prefix", () => {
    expect(normalizeHandle("@testuser")).toBe("testuser");
  });

  it("strips multiple @ symbols", () => {
    expect(normalizeHandle("@@testuser")).toBe("testuser");
  });

  it("lowercases", () => {
    expect(normalizeHandle("TestUser")).toBe("testuser");
  });

  it("trims whitespace", () => {
    expect(normalizeHandle("  testuser  ")).toBe("testuser");
  });

  it("combined normalization", () => {
    expect(normalizeHandle(" @TestUser ")).toBe("testuser");
  });
});

describe("isValidHandle", () => {
  it("accepts valid handles", () => {
    expect(isValidHandle("testuser")).toBe(true);
    expect(isValidHandle("test.user")).toBe(true);
    expect(isValidHandle("test_user")).toBe(true);
    expect(isValidHandle("user123")).toBe(true);
  });

  it("rejects empty", () => {
    expect(isValidHandle("")).toBe(false);
  });

  it("rejects handles with special chars", () => {
    expect(isValidHandle("user name")).toBe(false);
    expect(isValidHandle("user@name")).toBe(false);
    expect(isValidHandle("user!")).toBe(false);
  });

  it("rejects handles over 30 chars", () => {
    expect(isValidHandle("a".repeat(31))).toBe(false);
  });
});

describe("parseBatchInput", () => {
  it("returns empty for empty input", () => {
    const result = parseBatchInput("");
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("returns empty for whitespace-only input", () => {
    const result = parseBatchInput("   \n\n  ");
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("parses CSV with header", () => {
    const input = `instagram,tiktok,label,notes
@creator_a,@tk_creator_a,Beauty,Good engagement
creator_b,,Tech,`;

    const result = parseBatchInput(input);
    expect(result.rows).toHaveLength(2);
    expect(result.errors).toHaveLength(0);

    expect(result.rows[0].instagramUsername).toBe("creator_a");
    expect(result.rows[0].tiktokUsername).toBe("tk_creator_a");
    expect(result.rows[0].label).toBe("Beauty");
    expect(result.rows[0].notes).toBe("Good engagement");

    expect(result.rows[1].instagramUsername).toBe("creator_b");
    expect(result.rows[1].tiktokUsername).toBeNull();
    expect(result.rows[1].label).toBe("Tech");
  });

  it("parses TSV (tab-separated)", () => {
    const input = `instagram\ttiktok\tlabel
creator_a\ttk_a\tBeauty`;

    const result = parseBatchInput(input);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].instagramUsername).toBe("creator_a");
    expect(result.rows[0].tiktokUsername).toBe("tk_a");
    expect(result.rows[0].label).toBe("Beauty");
  });

  it("parses newline-separated handles (Instagram-only fallback)", () => {
    const input = `creator_a
@creator_b
creator_c`;

    const result = parseBatchInput(input);
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0].instagramUsername).toBe("creator_a");
    expect(result.rows[0].tiktokUsername).toBeNull();
    expect(result.rows[1].instagramUsername).toBe("creator_b");
    expect(result.rows[2].instagramUsername).toBe("creator_c");
  });

  it("reports validation errors for invalid handles", () => {
    const input = `instagram,tiktok
valid_user,
,
invalid user!,`;

    const result = parseBatchInput(input);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].instagramUsername).toBe("valid_user");

    // Empty row and invalid row should produce errors
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it("handles case-insensitive headers", () => {
    const input = `Instagram,TikTok,Label
creator_a,tk_a,test`;

    const result = parseBatchInput(input);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].instagramUsername).toBe("creator_a");
  });

  it("handles IG-only header", () => {
    const input = `ig,label
creator_a,Beauty
creator_b,Tech`;

    const result = parseBatchInput(input);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].instagramUsername).toBe("creator_a");
    expect(result.rows[0].label).toBe("Beauty");
  });

  it("supports TK shorthand header", () => {
    const input = `ig,tk,label
creator_a,tk_a,test`;

    const result = parseBatchInput(input);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].tiktokUsername).toBe("tk_a");
  });

  it("generates unique row IDs", () => {
    const input = `creator_a
creator_b`;

    const result = parseBatchInput(input);
    expect(result.rows[0].id).not.toBe(result.rows[1].id);
  });

  it("sets sourceRowIndex correctly", () => {
    const input = `instagram,tiktok
a_user,
b_user,`;

    const result = parseBatchInput(input);
    expect(result.rows[0].sourceRowIndex).toBe(1);
    expect(result.rows[1].sourceRowIndex).toBe(2);
  });
});

describe("extractUniqueHandles", () => {
  it("extracts unique handles per platform", () => {
    const rows = [
      { id: "1", instagramUsername: "user_a", tiktokUsername: "tk_a", label: null, notes: null, sourceRowIndex: 1 },
      { id: "2", instagramUsername: "user_a", tiktokUsername: "tk_b", label: null, notes: null, sourceRowIndex: 2 },
      { id: "3", instagramUsername: "user_b", tiktokUsername: null, label: null, notes: null, sourceRowIndex: 3 },
    ];

    const result = extractUniqueHandles(rows);
    expect(result.instagram).toEqual(["user_a", "user_b"]);
    expect(result.tiktok).toEqual(["tk_a", "tk_b"]);
  });

  it("handles empty rows", () => {
    const result = extractUniqueHandles([]);
    expect(result.instagram).toEqual([]);
    expect(result.tiktok).toEqual([]);
  });
});

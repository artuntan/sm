const path = require("node:path");

const {
  buildActualSchema,
  compareSchemaBaseline,
  loadLatestBaseline,
  normalizeArrayValue,
  normalizeActualColumnType,
} = require("../../scripts/lib/migration-baseline.cjs");

describe("migration baseline helpers", () => {
  const drizzleDir = path.resolve(process.cwd(), "drizzle");

  it("loads the latest committed baseline metadata", () => {
    const baseline = loadLatestBaseline(drizzleDir);

    expect(baseline.tag).toBe("20260401202510_unique_ogun");
    expect(baseline.hash).toBe(
      "26f0bd2ddc63e27e2f553379a922701281263e3ed6af130e7ba3c6c4e13ae308"
    );
    expect(baseline.expected.enums["public.platform"].values).toEqual([
      "instagram",
      "tiktok",
    ]);
    expect(baseline.expected.tables["public.user"].primaryKey).toEqual(["id"]);
  });

  it("normalizes postgres column types for schema comparison", () => {
    expect(
      normalizeActualColumnType({
        data_type: "timestamp without time zone",
        udt_name: "timestamp",
      })
    ).toBe("timestamp");
    expect(
      normalizeActualColumnType({
        data_type: "USER-DEFINED",
        udt_name: "platform",
      })
    ).toBe("platform");
    expect(
      normalizeActualColumnType({
        data_type: "integer",
        udt_name: "int4",
      })
    ).toBe("integer");
  });

  it("normalizes postgres array outputs from information_schema queries", () => {
    expect(normalizeArrayValue("{userId,teamId}")).toEqual(["teamId", "userId"]);
    expect(normalizeArrayValue(["id"])).toEqual(["id"]);
  });

  it("reports drift when expected objects are missing", () => {
    const baseline = loadLatestBaseline(drizzleDir);
    const actual = buildActualSchema({
      tables: [
        {
          table_schema: "public",
          table_name: "user",
        },
      ],
      columns: [
        {
          table_schema: "public",
          table_name: "user",
          column_name: "id",
          is_nullable: "NO",
          data_type: "text",
          udt_name: "text",
        },
      ],
      enums: [
        {
          enum_schema: "public",
          enum_name: "platform",
          enum_value: "instagram",
        },
      ],
      constraints: [
        {
          table_schema: "public",
          table_name: "user",
          constraint_name: "user_pkey",
          constraint_type: "PRIMARY KEY",
          columns: ["id"],
        },
      ],
    });

    const issues = compareSchemaBaseline(baseline.expected, actual);

    expect(issues).toEqual(
      expect.arrayContaining([
        "Missing enum public.approval_status",
        "Enum mismatch for public.platform: expected [instagram, tiktok], found [instagram]",
        "Missing table public.account",
      ])
    );
  });
});

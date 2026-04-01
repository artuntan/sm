import { getSslConfigForDatabaseUrl } from "@/lib/db/index";

describe("getSslConfigForDatabaseUrl", () => {
  test("returns undefined for non-RDS database urls", () => {
    expect(
      getSslConfigForDatabaseUrl("postgresql://localhost:5432/sm")
    ).toBeUndefined();
  });

  test("requires TLS verification for RDS database urls", () => {
    expect(
      getSslConfigForDatabaseUrl(
        "postgresql://user:pass@db-name.abc123.eu-central-1.rds.amazonaws.com:5432/sm"
      )
    ).toEqual({ rejectUnauthorized: true });
  });

  test("adds a CA certificate when one is provided", () => {
    expect(
      getSslConfigForDatabaseUrl(
        "postgresql://user:pass@db-name.abc123.eu-central-1.rds.amazonaws.com:5432/sm",
        "line-one\\nline-two"
      )
    ).toEqual({
      rejectUnauthorized: true,
      ca: "line-one\nline-two",
    });
  });
});

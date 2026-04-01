jest.mock("@/lib/db", () => ({
  pool: jest.fn(),
}));

import { pool } from "@/lib/db";
import { checkReadiness } from "@/lib/health/readiness";

const mockPool = pool as jest.MockedFunction<typeof pool>;
const query = jest.fn();

describe("checkReadiness", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DATABASE_URL = "postgres://localhost:5432/test";
    mockPool.mockReturnValue({ query } as never);
  });

  afterAll(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
  });

  test("uses a bounded query timeout for readiness checks", async () => {
    query.mockResolvedValue({ rows: [{ "?column?": 1 }] });

    const result = await checkReadiness();

    expect(result.ready).toBe(true);
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "select 1",
        query_timeout: 2_000,
      })
    );
  });

  test("returns a dependency error when the database check fails", async () => {
    query.mockRejectedValue(new Error("connection failed"));

    const result = await checkReadiness();

    expect(result.ready).toBe(false);
    expect(result.checks).toEqual([
      {
        name: "database",
        status: "error",
        message: "connection failed",
      },
    ]);
  });
});

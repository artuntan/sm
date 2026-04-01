jest.mock("@/lib/health/readiness", () => ({
  checkReadiness: jest.fn(),
}));

import { NextRequest } from "next/server";
import { GET as healthGet } from "@/app/api/health/route";
import { GET as readyGet } from "@/app/api/ready/route";
import { REQUEST_ID_HEADER } from "@/lib/logging/request-context";
import { checkReadiness } from "@/lib/health/readiness";

const mockCheckReadiness = checkReadiness as jest.MockedFunction<
  typeof checkReadiness
>;

describe("GET /api/health", () => {
  test("returns a healthy response with request id echo", async () => {
    const request = new NextRequest("http://localhost/api/health", {
      headers: {
        [REQUEST_ID_HEADER]: "req_health",
      },
    });

    const response = await healthGet(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe("req_health");
    expect(body.status).toBe("ok");
    expect(body.service).toBe("sm-app");
  });
});

describe("GET /api/ready", () => {
  beforeEach(() => {
    mockCheckReadiness.mockReset();
  });

  test("returns 200 when dependencies are ready", async () => {
    mockCheckReadiness.mockResolvedValue({
      ready: true,
      checks: [{ name: "database", status: "ok" }],
    });

    const request = new NextRequest("http://localhost/api/ready", {
      headers: {
        [REQUEST_ID_HEADER]: "req_ready",
      },
    });

    const response = await readyGet(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe("req_ready");
    expect(body.status).toBe("ready");
    expect(body.checks).toEqual([{ name: "database", status: "ok" }]);
  });

  test("returns 503 when dependencies are not ready", async () => {
    mockCheckReadiness.mockResolvedValue({
      ready: false,
      checks: [{ name: "database", status: "error", message: "connection failed" }],
    });

    const response = await readyGet(
      new NextRequest("http://localhost/api/ready")
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("not_ready");
    expect(body.checks).toEqual([
      { name: "database", status: "error", message: "connection failed" },
    ]);
  });
});

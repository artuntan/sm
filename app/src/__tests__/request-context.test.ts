import { NextRequest, NextResponse } from "next/server";
import {
  REQUEST_ID_HEADER,
  attachRequestId,
  getOrCreateRequestId,
} from "@/lib/logging/request-context";

describe("getOrCreateRequestId", () => {
  test("reuses an incoming request id when present", () => {
    const request = new NextRequest("http://localhost/api/analyze", {
      headers: {
        [REQUEST_ID_HEADER]: "req_existing",
      },
    });

    expect(getOrCreateRequestId(request)).toBe("req_existing");
  });

  test("creates a request id when one is missing", () => {
    const request = new NextRequest("http://localhost/api/analyze");
    const requestId = getOrCreateRequestId(request);

    expect(requestId).toEqual(expect.any(String));
    expect(requestId.length).toBeGreaterThan(10);
  });
});

describe("attachRequestId", () => {
  test("writes the request id header to the response", () => {
    const response = attachRequestId(
      NextResponse.json({ ok: true }),
      "req_attached"
    );

    expect(response.headers.get(REQUEST_ID_HEADER)).toBe("req_attached");
  });
});

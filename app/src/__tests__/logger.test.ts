jest.mock("pino", () => {
  const child = jest.fn(() => ({ mocked: true }));

  return {
    __esModule: true,
    default: jest.fn(() => ({
      child,
    })),
  };
});

import { NextRequest } from "next/server";
import pino from "pino";
import { getRouteLogger } from "@/lib/logging/logger";

describe("getRouteLogger", () => {
  test("reuses the explicit request id for logger bindings", () => {
    const request = new NextRequest("http://localhost/api/analyze", {
      method: "POST",
    });

    getRouteLogger(request, "/api/analyze", {}, "req_explicit");

    const pinoMock = pino as unknown as jest.Mock;
    const loggerInstance = pinoMock.mock.results[0]?.value as {
      child: jest.Mock;
    };

    expect(loggerInstance.child).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req_explicit",
        route: "/api/analyze",
        path: "/api/analyze",
        method: "POST",
      })
    );
  });
});

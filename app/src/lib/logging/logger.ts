import pino from "pino";
import { getOrCreateRequestId } from "@/lib/logging/request-context";

export const logger = pino({
  name: "sm-app",
  level:
    process.env.LOG_LEVEL ??
    (process.env.NODE_ENV === "production" ? "info" : "debug"),
  enabled: process.env.NODE_ENV !== "test",
  base: {
    service: "sm-app",
    environment: process.env.NODE_ENV ?? "development",
  },
});

export function getRouteLogger(
  request: Request,
  route: string,
  extra: Record<string, unknown> = {},
  requestId = getOrCreateRequestId(request)
) {
  const { pathname } = new URL(request.url);

  return logger.child({
    requestId,
    route,
    path: pathname,
    method: request.method,
    ...extra,
  });
}

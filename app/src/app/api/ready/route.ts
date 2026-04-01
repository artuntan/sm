import { NextRequest, NextResponse } from "next/server";
import { checkReadiness } from "@/lib/health/readiness";
import {
  attachRequestId,
  getOrCreateRequestId,
} from "@/lib/logging/request-context";

export async function GET(request: NextRequest) {
  const requestId = getOrCreateRequestId(request);
  const readiness = await checkReadiness();

  return attachRequestId(
    NextResponse.json(
      {
        status: readiness.ready ? "ready" : "not_ready",
        service: "sm-app",
        timestamp: new Date().toISOString(),
        checks: readiness.checks,
      },
      { status: readiness.ready ? 200 : 503 }
    ),
    requestId
  );
}

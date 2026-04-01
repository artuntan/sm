import { NextRequest, NextResponse } from "next/server";
import {
  attachRequestId,
  getOrCreateRequestId,
} from "@/lib/logging/request-context";

export async function GET(request: NextRequest) {
  const requestId = getOrCreateRequestId(request);

  return attachRequestId(
    NextResponse.json({
      status: "ok",
      service: "sm-app",
      timestamp: new Date().toISOString(),
    }),
    requestId
  );
}

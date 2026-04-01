import type { NextResponse } from "next/server";

export const REQUEST_ID_HEADER = "x-request-id";

type RequestLike = {
  headers: Headers;
};

export function getOrCreateRequestId(request: RequestLike): string {
  return request.headers.get(REQUEST_ID_HEADER) ?? crypto.randomUUID();
}

export function attachRequestId<T extends NextResponse>(
  response: T,
  requestId: string
): T {
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export function withRequestIdHeader(headers: Headers, requestId: string): Headers {
  headers.set(REQUEST_ID_HEADER, requestId);
  return headers;
}

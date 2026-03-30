/**
 * Standard API Error Response
 *
 * All API routes should use these helpers for consistent error responses.
 */

import { NextResponse } from "next/server";

type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_REQUEST"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  | "CONFLICT";

export function apiError(
  code: ErrorCode,
  message: string,
  status: number,
  details?: unknown
): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status }
  );
}

// Convenience helpers
export const unauthorized = (message = "Authentication required.") =>
  apiError("UNAUTHORIZED", message, 401);

export const forbidden = (message = "Access denied.") =>
  apiError("FORBIDDEN", message, 403);

export const notFound = (message = "Resource not found.") =>
  apiError("NOT_FOUND", message, 404);

export const badRequest = (message = "Invalid request.", details?: unknown) =>
  apiError("INVALID_REQUEST", message, 400, details);

export const validationError = (
  message = "Validation failed.",
  details?: unknown
) => apiError("VALIDATION_ERROR", message, 422, details);

export const conflict = (message = "Resource conflict.") =>
  apiError("CONFLICT", message, 409);

export const internalError = (message = "Internal server error.") =>
  apiError("INTERNAL_ERROR", message, 500);

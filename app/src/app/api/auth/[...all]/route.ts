/**
 * Better Auth — Catch-All API Route
 *
 * Handles all auth endpoints: /api/auth/sign-up, /api/auth/sign-in,
 * /api/auth/sign-out, /api/auth/get-session, etc.
 */

import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);

/**
 * Better Auth — Client Helpers
 *
 * Used in client components for sign-in, sign-up, sign-out, and session access.
 */

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : "",
});

export const { signIn, signUp, signOut, useSession } = authClient;

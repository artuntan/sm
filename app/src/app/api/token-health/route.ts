/**
 * GET /api/token-health
 *
 * Admin diagnostic endpoint that checks the current Meta access token status.
 * Returns structured information about token type, validity, scopes, and expiry
 * without ever exposing the actual token.
 *
 * Use this to:
 * - Verify token is valid after setup
 * - Confirm token type is "system_user" (non-expiring)
 * - Check required scopes are present
 * - Diagnose authentication failures
 */
import { NextResponse } from "next/server";
import { checkTokenHealth } from "@/lib/providers/token-health";
import type { TokenHealthStatus } from "@/lib/providers/token-health";

type HealthResponse = TokenHealthStatus & {
  recommendations: string[];
  tokenPrefix: string;
};

export async function GET(): Promise<NextResponse<HealthResponse>> {
  const health = await checkTokenHealth();

  const recommendations: string[] = [];
  const token = process.env.META_ACCESS_TOKEN ?? "";

  // Show only first 8 chars for identification (never full token)
  const tokenPrefix = token ? `${token.slice(0, 8)}...` : "(not set)";

  // Generate actionable recommendations
  if (!health.valid) {
    recommendations.push(
      "⛔ Token is invalid or expired. Generate a new System User Token in Meta Business Manager."
    );
  }

  if (health.tokenType === "user") {
    recommendations.push(
      "⚠️ This is a User Access Token — it will expire. Migrate to a System User Token for permanent access.",
      "See docs/META_TOKEN_SETUP.md for step-by-step migration guide."
    );
  }

  if (health.tokenType === "system_user" && health.neverExpires) {
    recommendations.push(
      "✅ System User Token detected — this token does not expire."
    );
  }

  if (health.valid && health.expiresAt) {
    const expiresDate = new Date(health.expiresAt);
    const daysLeft = Math.floor(
      (expiresDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    if (daysLeft <= 7) {
      recommendations.push(
        `🚨 Token expires in ${daysLeft} day(s)! Renew immediately.`
      );
    } else if (daysLeft <= 30) {
      recommendations.push(
        `⚠️ Token expires in ${daysLeft} days. Consider migrating to a System User Token.`
      );
    }
  }

  // Check required scopes
  const allScopes = [...health.scopes, ...health.granularScopes];
  const requiredScopes = ["instagram_basic", "instagram_manage_insights"];
  for (const scope of requiredScopes) {
    if (!allScopes.includes(scope)) {
      recommendations.push(
        `⚠️ Missing scope: ${scope}. This may cause API errors.`
      );
    }
  }

  return NextResponse.json({
    ...health,
    recommendations,
    tokenPrefix,
  });
}

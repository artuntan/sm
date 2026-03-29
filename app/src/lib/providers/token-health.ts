/**
 * Token health diagnostic service.
 *
 * Uses Meta's debug_token endpoint to introspect the current access token
 * and return structured status information without leaking the token itself.
 *
 * Reference: https://developers.facebook.com/docs/facebook-login/guides/access-tokens/debugging
 */

export type TokenHealthStatus = {
  valid: boolean;
  tokenType: "system_user" | "user" | "page" | "unknown";
  appId: string | null;
  appName: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  neverExpires: boolean;
  scopes: string[];
  granularScopes: string[];
  error: string | null;
  checkedAt: string;
};

/**
 * Introspect the current META_ACCESS_TOKEN using the Graph API debug_token endpoint.
 *
 * This makes a server-side call to Meta's token debug endpoint.
 * It does NOT require APP_SECRET — it uses the token itself as both
 * the input token and the access token for the debug call.
 *
 * For production, you should use APP_ID|APP_SECRET as the access_token
 * for the debug call. But self-introspection works for diagnostics.
 */
export async function checkTokenHealth(): Promise<TokenHealthStatus> {
  const token = process.env.META_ACCESS_TOKEN;
  const version = process.env.META_GRAPH_API_VERSION || "v23.0";
  const checkedAt = new Date().toISOString();

  if (!token) {
    return {
      valid: false,
      tokenType: "unknown",
      appId: null,
      appName: null,
      issuedAt: null,
      expiresAt: null,
      neverExpires: false,
      scopes: [],
      granularScopes: [],
      error: "META_ACCESS_TOKEN is not set",
      checkedAt,
    };
  }

  try {
    const params = new URLSearchParams({
      input_token: token,
      access_token: token, // Self-introspection
    });

    const url = `https://graph.facebook.com/${version}/debug_token?${params}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    const data = await response.json();

    if (data.error) {
      return {
        valid: false,
        tokenType: "unknown",
        appId: null,
        appName: null,
        issuedAt: null,
        expiresAt: null,
        neverExpires: false,
        scopes: [],
        granularScopes: [],
        error: `Meta API error: ${data.error.message} (code: ${data.error.code})`,
        checkedAt,
      };
    }

    const tokenData = data.data;
    if (!tokenData) {
      return {
        valid: false,
        tokenType: "unknown",
        appId: null,
        appName: null,
        issuedAt: null,
        expiresAt: null,
        neverExpires: false,
        scopes: [],
        granularScopes: [],
        error: "No token data returned from debug_token endpoint",
        checkedAt,
      };
    }

    // Determine token type
    let tokenType: TokenHealthStatus["tokenType"] = "unknown";
    const rawType = tokenData.type;
    if (rawType === "SYSTEM_USER") tokenType = "system_user";
    else if (rawType === "USER") tokenType = "user";
    else if (rawType === "PAGE") tokenType = "page";

    // Parse expiry
    const expiresAtUnix = tokenData.expires_at;
    const neverExpires = expiresAtUnix === 0; // 0 = never expires
    const expiresAt = neverExpires
      ? null
      : expiresAtUnix
        ? new Date(expiresAtUnix * 1000).toISOString()
        : null;

    // Parse issued_at
    const issuedAtUnix = tokenData.issued_at;
    const issuedAt = issuedAtUnix
      ? new Date(issuedAtUnix * 1000).toISOString()
      : null;

    // Scopes
    const scopes: string[] = tokenData.scopes ?? [];
    const granularScopes: string[] = (tokenData.granular_scopes ?? []).map(
      (s: { permission: string }) => s.permission
    );

    // Error from token data
    const tokenError = tokenData.error?.message ?? null;

    return {
      valid: tokenData.is_valid === true,
      tokenType,
      appId: tokenData.app_id ?? null,
      appName: tokenData.application ?? null,
      issuedAt,
      expiresAt,
      neverExpires,
      scopes,
      granularScopes,
      error: tokenError,
      checkedAt,
    };
  } catch (err) {
    return {
      valid: false,
      tokenType: "unknown",
      appId: null,
      appName: null,
      issuedAt: null,
      expiresAt: null,
      neverExpires: false,
      scopes: [],
      granularScopes: [],
      error: `Failed to check token: ${err instanceof Error ? err.message : "Unknown error"}`,
      checkedAt,
    };
  }
}

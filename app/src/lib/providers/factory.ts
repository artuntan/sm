/**
 * Provider factory — returns the correct provider for the given platform,
 * based on available credentials and provider mode configuration.
 *
 * Instagram: MetaBusinessDiscoveryProvider (official) → InstagramApifyProvider (fallback) → MockProvider (dev)
 *            Controlled by INSTAGRAM_PROVIDER_MODE: auto | meta | apify
 * TikTok:    TikTokResearchProvider (official) → TikTokApifyProvider (live fallback) → TikTokMockProvider (dev)
 */
import type { Platform } from "../domain/types";
import type { PlatformProvider } from "./interface";
import { MetaBusinessDiscoveryProvider } from "./meta-provider";
import { MockProvider } from "./mock-provider";
import { InstagramApifyProvider } from "./instagram-apify-provider";
import { TikTokResearchProvider } from "./tiktok-research-provider";
import { TikTokApifyProvider } from "./tiktok-apify-provider";
import { TikTokMockProvider } from "./tiktok-mock-provider";

const cachedProviders = new Map<string, PlatformProvider>();

type InstagramProviderMode = "auto" | "apify" | "meta";

function getInstagramProviderMode(): InstagramProviderMode {
  const mode = (process.env.INSTAGRAM_PROVIDER_MODE || "auto").toLowerCase();
  if (mode === "apify" || mode === "meta") return mode;
  return "auto";
}

export function getProvider(platform: Platform = "instagram"): PlatformProvider {
  const cached = cachedProviders.get(platform);
  if (cached) return cached;

  let provider: PlatformProvider;

  if (platform === "tiktok") {
    // Tier 1: Official TikTok Research API (requires approved access)
    const hasResearchCredentials =
      !!process.env.TIKTOK_RESEARCH_CLIENT_KEY &&
      !!process.env.TIKTOK_RESEARCH_CLIENT_SECRET;

    // Tier 2: Apify managed fallback (live, production-ready)
    const hasApifyToken = !!process.env.APIFY_API_TOKEN;

    if (hasResearchCredentials) {
      provider = new TikTokResearchProvider();
    } else if (hasApifyToken) {
      provider = new TikTokApifyProvider();
    } else {
      console.warn(
        "[Benchmark] No TikTok live provider configured. " +
          "Set APIFY_API_TOKEN for live TikTok data, or " +
          "TIKTOK_RESEARCH_CLIENT_KEY + SECRET for official Research API. " +
          "Falling back to mock provider."
      );
      provider = new TikTokMockProvider();
    }
  } else {
    // Instagram: 3-tier selection controlled by INSTAGRAM_PROVIDER_MODE
    const mode = getInstagramProviderMode();
    const hasApifyToken = !!process.env.APIFY_API_TOKEN;
    const hasMetaCredentials =
      !!process.env.META_ACCESS_TOKEN && !!process.env.META_IG_USER_ID;

    if (mode === "apify") {
      // Force Apify (explicit override)
      if (hasApifyToken) {
        provider = new InstagramApifyProvider();
      } else {
        console.warn(
          "[Benchmark] INSTAGRAM_PROVIDER_MODE=apify but APIFY_API_TOKEN not set. Falling back to mock."
        );
        provider = new MockProvider();
      }
    } else if (mode === "meta") {
      // Force Meta (explicit override)
      if (hasMetaCredentials) {
        provider = new MetaBusinessDiscoveryProvider();
      } else {
        console.warn(
          "[Benchmark] INSTAGRAM_PROVIDER_MODE=meta but META_ACCESS_TOKEN or META_IG_USER_ID not set. Falling back to mock."
        );
        provider = new MockProvider();
      }
    } else {
      // Auto mode: prefer Meta → Apify fallback → Mock
      if (hasMetaCredentials) {
        provider = new MetaBusinessDiscoveryProvider();
      } else if (hasApifyToken) {
        console.warn(
          "[Benchmark] Meta credentials not configured. Using Apify as Instagram fallback."
        );
        provider = new InstagramApifyProvider();
      } else {
        console.warn(
          "[Benchmark] No Instagram live provider configured. " +
            "Set META_ACCESS_TOKEN + META_IG_USER_ID for Meta Graph API (official, professional accounts), or " +
            "APIFY_API_TOKEN for Apify fallback (all public accounts). " +
            "Falling back to mock provider."
        );
        provider = new MockProvider();
      }
    }
  }

  cachedProviders.set(platform, provider);
  return provider;
}

/**
 * Reset cached providers (useful for testing).
 */
export function resetProvider(): void {
  cachedProviders.clear();
}

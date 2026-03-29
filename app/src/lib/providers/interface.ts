/**
 * Platform-aware provider interface for data access.
 */
import type { ProviderResult, ProviderSource } from "../domain/types";

export interface PlatformProvider {
  readonly name: ProviderSource;

  /**
   * Fetch recent media for a given username on this provider's platform.
   * The provider is responsible for fetching raw data and mapping
   * it to canonical ContentItem shapes.
   *
   * @throws ProviderError with a structured error code
   */
  fetchRecentMedia(username: string): Promise<ProviderResult>;
}

/** @deprecated Use PlatformProvider. Kept for backward compat. */
export type InstagramProvider = PlatformProvider;

export class ProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

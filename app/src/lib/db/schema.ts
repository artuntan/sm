/**
 * Database Schema — Drizzle ORM + SQLite
 *
 * Core tables for the multi-user team workspace:
 * - user / session / account / verification (Better Auth managed)
 * - team, team_membership, team_join_request (custom domain)
 * - analysis_run (team-scoped history)
 */

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// Better Auth core tables
// (Better Auth expects these exact names and columns)
// ---------------------------------------------------------------------------

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),

  // ── Custom fields ──────────────────────────────────────────
  systemRole: text("systemRole", { enum: ["system_admin", "user"] })
    .notNull()
    .default("user"),
  approvalStatus: text("approvalStatus", {
    enum: ["pending", "approved", "rejected", "suspended"],
  })
    .notNull()
    .default("pending"),
  approvedBy: text("approvedBy"),
  approvedAt: integer("approvedAt", { mode: "timestamp" }),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: integer("accessTokenExpiresAt", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refreshTokenExpiresAt", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }),
  updatedAt: integer("updatedAt", { mode: "timestamp" }),
});

// ---------------------------------------------------------------------------
// Team tables (custom domain)
// ---------------------------------------------------------------------------

export const team = sqliteTable("team", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
});

export const teamMembership = sqliteTable("team_membership", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id),
  teamId: text("teamId")
    .notNull()
    .references(() => team.id),
  role: text("role", { enum: ["team_admin", "member"] })
    .notNull()
    .default("member"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  joinedAt: integer("joinedAt", { mode: "timestamp" }).notNull(),
});

export const teamJoinRequest = sqliteTable("team_join_request", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id),
  teamId: text("teamId")
    .notNull()
    .references(() => team.id),
  status: text("status", { enum: ["pending", "approved", "rejected"] })
    .notNull()
    .default("pending"),
  reviewedBy: text("reviewedBy"),
  reviewedAt: integer("reviewedAt", { mode: "timestamp" }),
  rejectionReason: text("rejectionReason"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
});

// ---------------------------------------------------------------------------
// Analysis run history (team-scoped)
// ---------------------------------------------------------------------------

export const analysisRun = sqliteTable("analysis_run", {
  id: text("id").primaryKey(),
  teamId: text("teamId")
    .notNull()
    .references(() => team.id),
  userId: text("userId")
    .notNull()
    .references(() => user.id),
  status: text("status", {
    enum: ["running", "complete", "partial", "error"],
  }).notNull(),
  totalRows: integer("totalRows").notNull().default(0),
  completeRows: integer("completeRows").notNull().default(0),
  partialRows: integer("partialRows").notNull().default(0),
  errorRows: integer("errorRows").notNull().default(0),
  /** JSON: array of { instagram?, tiktok?, label? } */
  inputSummary: text("inputSummary").notNull().default("[]"),
  /** JSON: BatchRowResult[] — derived analysis snapshot */
  resultSnapshot: text("resultSnapshot").notNull().default("[]"),
  startedAt: integer("startedAt", { mode: "timestamp" }).notNull(),
  completedAt: integer("completedAt", { mode: "timestamp" }),
  /** Snapshot schema version — allows migration of stored result formats */
  schemaVersion: integer("schemaVersion").notNull().default(1),
  /** Free-text annotation — optional context from the user */
  note: text("note"),
  /** Soft-delete / archive flag */
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  /** JSON array of string tags for campaign/client grouping */
  tags: text("tags").notNull().default("[]"),
});

// ---------------------------------------------------------------------------
// Campaign entity (connects Workspace ↔ Coverage)
// ---------------------------------------------------------------------------

export const campaign = sqliteTable("campaign", {
  id: text("id").primaryKey(),
  teamId: text("teamId")
    .notNull()
    .references(() => team.id),
  name: text("name").notNull(),
  status: text("status", {
    enum: ["draft", "active", "monitoring", "completed", "archived"],
  })
    .notNull()
    .default("draft"),
  /** Coverage brand ID (e.g. "brand_dimes_tr") */
  brandId: text("brandId"),
  startDate: text("startDate"),
  endDate: text("endDate"),
  notes: text("notes"),
  budgetAmount: integer("budgetAmount"),
  budgetCurrency: text("budgetCurrency"),
  /** JSON array of string tags */
  tags: text("tags").notNull().default("[]"),
  /** JSON array of custom match keywords/hashtags for deliverable detection */
  matchKeywords: text("matchKeywords").notNull().default("[]"),
  /** JSON: extensible metadata (webhook config, scan preferences, etc.) */
  meta: text("meta").notNull().default("{}"),
  createdAt: text("createdAt").notNull(),
  updatedAt: text("updatedAt").notNull(),
  createdBy: text("createdBy")
    .notNull()
    .references(() => user.id),
});

export const campaignCreator = sqliteTable("campaign_creator", {
  id: text("id").primaryKey(),
  campaignId: text("campaignId")
    .notNull()
    .references(() => campaign.id),
  instagramHandle: text("instagramHandle"),
  tiktokHandle: text("tiktokHandle"),
  label: text("label"),
  role: text("role", { enum: ["primary", "secondary", "shortlisted"] })
    .notNull()
    .default("primary"),
  /** Link to the analysis_run that evaluated this creator */
  analysisRunId: text("analysisRunId"),
  budgetAmount: integer("budgetAmount"),
  budgetCurrency: text("budgetCurrency"),
  notes: text("notes"),
  addedAt: text("addedAt").notNull(),
});

export const campaignDeliverable = sqliteTable("campaign_deliverable", {
  id: text("id").primaryKey(),
  campaignId: text("campaignId")
    .notNull()
    .references(() => campaign.id),
  creatorId: text("creatorId")
    .notNull()
    .references(() => campaignCreator.id),
  platform: text("platform", { enum: ["instagram", "tiktok"] }).notNull(),
  postId: text("postId").notNull(),
  permalink: text("permalink").notNull(),
  caption: text("caption"),
  thumbnailUrl: text("thumbnailUrl"),
  views: integer("views"),
  likes: integer("likes"),
  publishedAt: text("publishedAt"),
  contentKind: text("contentKind"),
  /** "auto" = matched by keyword/tag, "manual" = operator added manually */
  matchType: text("matchType", { enum: ["auto", "manual"] })
    .notNull()
    .default("auto"),
  /** Why it matched (e.g., "caption_keyword: dimes", "tagged_user: dimes.tr") */
  matchReason: text("matchReason"),
  detectedAt: text("detectedAt").notNull(),
});

// ---------------------------------------------------------------------------
// Coverage product tables (Dimes Content Coverage Intelligence)
// These are SEPARATE from the benchmark product above.
// ---------------------------------------------------------------------------

export const coverageScanRun = sqliteTable("coverage_scan_run", {
  id: text("id").primaryKey(),
  type: text("type", { enum: ["backfill", "daily", "full", "fast"] }).notNull(),
  status: text("status", {
    enum: ["running", "complete", "partial", "error"],
  }).notNull(),
  startedAt: text("startedAt").notNull(),
  completedAt: text("completedAt"),
  accountsScanned: integer("accountsScanned").notNull().default(0),
  postsFound: integer("postsFound").notNull().default(0),
  newPostsIngested: integer("newPostsIngested").notNull().default(0),
  clustersCreated: integer("clustersCreated").notNull().default(0),
  /** JSON: ScanError[] */
  errorsJson: text("errorsJson").notNull().default("[]"),
});

export const coveragePost = sqliteTable("coverage_post", {
  id: text("id").primaryKey(),
  scanRunId: text("scanRunId").notNull(),
  accountId: text("accountId").notNull(),
  brandId: text("brandId").notNull(),
  platform: text("platform").notNull(),
  platformPostId: text("platformPostId").notNull(),
  permalink: text("permalink").notNull(),
  caption: text("caption"),
  normalizedCaption: text("normalizedCaption"),
  hashtagsJson: text("hashtagsJson").notNull().default("[]"),
  mentionsJson: text("mentionsJson").notNull().default("[]"),
  publishedAt: text("publishedAt").notNull(),
  fetchedAt: text("fetchedAt").notNull(),
  mediaType: text("mediaType"),
  thumbnailUrl: text("thumbnailUrl"),
  classification: text("classification").notNull(),
  classificationSignalsJson: text("classificationSignalsJson").notNull().default("[]"),
  clusterFingerprint: text("clusterFingerprint"),
});

// Per-account scan state — durable cursor for fast scans
export const coverageAccountScanState = sqliteTable("coverage_account_scan_state", {
  accountId: text("accountId").primaryKey(),
  platform: text("platform").notNull(),
  brandId: text("brandId").notNull(),
  lastSuccessfulScanAt: text("lastSuccessfulScanAt"),
  lastScanMode: text("lastScanMode", { enum: ["backfill", "daily", "full", "fast"] }),
  lastScanPostCount: integer("lastScanPostCount").notNull().default(0),
  latestPostPublishedAt: text("latestPostPublishedAt"),
  updatedAt: text("updatedAt").notNull(),
});

// ---------------------------------------------------------------------------
// Workspace Scan Cache — Durable provider result cache
// Eliminates redundant Apify/provider calls by storing ProviderResult per
// (platform, username) with tiered freshness logic.
// ---------------------------------------------------------------------------

export const creatorScanCache = sqliteTable("creator_scan_cache", {
  id: text("id").primaryKey(),
  platform: text("platform", { enum: ["instagram", "tiktok"] }).notNull(),
  /** Normalized lowercase username */
  username: text("username").notNull(),
  /** JSON: serialized ProviderResult (items, profile, totalFetched, source) */
  providerResultJson: text("providerResultJson").notNull(),
  /** Provider source label, e.g. "instagram-apify", "tiktok-apify" */
  providerSource: text("providerSource").notNull(),
  /** Number of content items in the cached result */
  itemCount: integer("itemCount").notNull().default(0),
  /** ISO timestamp when the provider was actually called */
  fetchedAt: text("fetchedAt").notNull(),
  /** ISO timestamp: computed cache expiry */
  expiresAt: text("expiresAt").notNull(),
});

// ---------------------------------------------------------------------------
// M2 — Normalized Media Warehouse
// Individual content items with dedup + metric tracking over time.
// ---------------------------------------------------------------------------

export const creatorMediaItem = sqliteTable("creator_media_item", {
  id: text("id").primaryKey(),
  platform: text("platform", { enum: ["instagram", "tiktok"] }).notNull(),
  /** Normalized lowercase creator username */
  username: text("username").notNull(),
  /** Platform-native post ID (e.g. Instagram shortcode, TikTok video ID) */
  externalId: text("externalId").notNull(),
  /** Full permalink URL */
  permalink: text("permalink").notNull(),
  caption: text("caption"),
  /** ISO timestamp of when the content was published */
  publishedAt: text("publishedAt").notNull(),
  /** Content kind: "REELS", "VIDEO", "CAROUSEL_ALBUM", etc. */
  contentKind: text("contentKind"),
  thumbnailUrl: text("thumbnailUrl"),
  /** Latest view count */
  views: integer("views"),
  /** Latest like count */
  likes: integer("likes"),
  /** Latest comment count */
  comments: integer("comments"),
  /** Is this content classified as commercial? */
  isCommercial: integer("isCommercial", { mode: "boolean" }).notNull().default(false),
  /** JSON: commercialMetadata from provider */
  commercialMetadataJson: text("commercialMetadataJson"),
  /** JSON: raw provider metadata snapshot */
  rawMetadataJson: text("rawMetadataJson"),
  /** ISO: when this item was first seen by our system */
  firstSeenAt: text("firstSeenAt").notNull(),
  /** ISO: when metrics were last refreshed */
  lastMetricUpdateAt: text("lastMetricUpdateAt").notNull(),
  /** Snapshot of previous views for drift detection */
  previousViews: integer("previousViews"),
  /** How many times metrics have been updated */
  metricUpdateCount: integer("metricUpdateCount").notNull().default(1),
});

// ---------------------------------------------------------------------------
// M3 — Creator Scan Profile (Adaptive Re-Scan Policy)
// Per-creator metadata: posting frequency, scan history, optimal TTL.
// ---------------------------------------------------------------------------

export const creatorScanProfile = sqliteTable("creator_scan_profile", {
  id: text("id").primaryKey(),
  platform: text("platform", { enum: ["instagram", "tiktok"] }).notNull(),
  /** Normalized lowercase username */
  username: text("username").notNull(),
  /** Total items seen across all scans */
  totalItemsSeen: integer("totalItemsSeen").notNull().default(0),
  /** Number of successful scans we've done for this creator */
  scanCount: integer("scanCount").notNull().default(0),
  /** Average posts per week (computed from warehouse data) */
  postsPerWeek: integer("postsPerWeek").notNull().default(0),
  /** Adaptive TTL in milliseconds — computed from posting frequency */
  adaptiveTtlMs: integer("adaptiveTtlMs").notNull().default(86400000),
  /** ISO: first time we ever scanned this creator */
  firstScanAt: text("firstScanAt").notNull(),
  /** ISO: most recent scan timestamp */
  lastScanAt: text("lastScanAt").notNull(),
  /** ISO: most recent post published date we've seen */
  latestPostAt: text("latestPostAt"),
  /** ISO: earliest post published date we've seen */
  earliestPostAt: text("earliestPostAt"),
  /** JSON: profile summary snapshot (followers, name, etc.) */
  profileSnapshotJson: text("profileSnapshotJson"),
  updatedAt: text("updatedAt").notNull(),
});

// ---------------------------------------------------------------------------
// Influencer Identity — Links IG + TT accounts as one person
// ---------------------------------------------------------------------------

export const influencerIdentity = sqliteTable("influencer_identity", {
  id: text("id").primaryKey(),
  /** Normalized lowercase IG username (nullable if TT-only) */
  instagramUsername: text("instagramUsername"),
  /** Normalized lowercase TT username (nullable if IG-only) */
  tiktokUsername: text("tiktokUsername"),
  /** Display name for the identity */
  displayName: text("displayName"),
  /** ISO: when first linked */
  createdAt: text("createdAt").notNull(),
  /** ISO: last update */
  updatedAt: text("updatedAt").notNull(),
});

/**
 * Database Schema — Drizzle ORM + PostgreSQL
 *
 * Core tables for the multi-user team workspace:
 * - user / session / account / verification (Better Auth managed)
 * - team, team_membership, team_join_request (custom domain)
 * - analysis_run (team-scoped history)
 * - campaign, campaign_creator, campaign_deliverable
 * - coverage_scan_run, coverage_post, coverage_account_scan_state
 * - creator_scan_cache, creator_media_item, creator_scan_profile
 * - influencer_identity
 */

import {
  pgTable,
  pgEnum,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const systemRoleEnum = pgEnum("system_role", ["system_admin", "user"]);
export const approvalStatusEnum = pgEnum("approval_status", [
  "pending",
  "approved",
  "rejected",
  "suspended",
]);
export const teamRoleEnum = pgEnum("team_role", ["team_admin", "member"]);
export const requestStatusEnum = pgEnum("request_status", [
  "pending",
  "approved",
  "rejected",
]);
export const runStatusEnum = pgEnum("run_status", [
  "running",
  "complete",
  "partial",
  "error",
]);
export const campaignStatusEnum = pgEnum("campaign_status", [
  "draft",
  "active",
  "monitoring",
  "completed",
  "archived",
]);
export const creatorRoleEnum = pgEnum("creator_role", [
  "primary",
  "secondary",
  "shortlisted",
]);
export const platformEnum = pgEnum("platform", ["instagram", "tiktok"]);
export const matchTypeEnum = pgEnum("match_type", ["auto", "manual"]);
export const scanTypeEnum = pgEnum("scan_type", [
  "backfill",
  "daily",
  "full",
  "fast",
]);

// ---------------------------------------------------------------------------
// Better Auth core tables
// (Better Auth expects these exact names and columns)
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),

  // ── Custom fields ──────────────────────────────────────────
  systemRole: systemRoleEnum("systemRole").notNull().default("user"),
  approvalStatus: approvalStatusEnum("approvalStatus")
    .notNull()
    .default("pending"),
  approvedBy: text("approvedBy"),
  approvedAt: timestamp("approvedAt"),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt"),
  updatedAt: timestamp("updatedAt"),
});

// ---------------------------------------------------------------------------
// Team tables (custom domain)
// ---------------------------------------------------------------------------

export const team = pgTable("team", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export const teamMembership = pgTable("team_membership", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id),
  teamId: text("teamId")
    .notNull()
    .references(() => team.id),
  role: teamRoleEnum("role").notNull().default("member"),
  active: boolean("active").notNull().default(true),
  joinedAt: timestamp("joinedAt").notNull().defaultNow(),
});

export const teamJoinRequest = pgTable("team_join_request", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id),
  teamId: text("teamId")
    .notNull()
    .references(() => team.id),
  status: requestStatusEnum("status").notNull().default("pending"),
  reviewedBy: text("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  rejectionReason: text("rejectionReason"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Analysis run history (team-scoped)
// ---------------------------------------------------------------------------

export const analysisRun = pgTable("analysis_run", {
  id: text("id").primaryKey(),
  teamId: text("teamId")
    .notNull()
    .references(() => team.id),
  userId: text("userId")
    .notNull()
    .references(() => user.id),
  status: runStatusEnum("status").notNull(),
  totalRows: integer("totalRows").notNull().default(0),
  completeRows: integer("completeRows").notNull().default(0),
  partialRows: integer("partialRows").notNull().default(0),
  errorRows: integer("errorRows").notNull().default(0),
  /** JSON: array of { instagram?, tiktok?, label? } */
  inputSummary: jsonb("inputSummary").notNull().default([]),
  /** JSON: BatchRowResult[] — derived analysis snapshot */
  resultSnapshot: jsonb("resultSnapshot").notNull().default([]),
  startedAt: timestamp("startedAt").notNull().defaultNow(),
  completedAt: timestamp("completedAt"),
  /** Snapshot schema version — allows migration of stored result formats */
  schemaVersion: integer("schemaVersion").notNull().default(1),
  /** Free-text annotation — optional context from the user */
  note: text("note"),
  /** Soft-delete / archive flag */
  archived: boolean("archived").notNull().default(false),
  /** JSON array of string tags for campaign/client grouping */
  tags: jsonb("tags").notNull().default([]),
});

// ---------------------------------------------------------------------------
// Campaign entity (connects Workspace ↔ Coverage)
// ---------------------------------------------------------------------------

export const campaign = pgTable("campaign", {
  id: text("id").primaryKey(),
  teamId: text("teamId")
    .notNull()
    .references(() => team.id),
  name: text("name").notNull(),
  status: campaignStatusEnum("status").notNull().default("draft"),
  /** Coverage brand ID (e.g. "brand_dimes_tr") */
  brandId: text("brandId"),
  startDate: text("startDate"),
  endDate: text("endDate"),
  notes: text("notes"),
  budgetAmount: integer("budgetAmount"),
  budgetCurrency: text("budgetCurrency"),
  /** JSON array of string tags */
  tags: jsonb("tags").notNull().default([]),
  /** JSON array of custom match keywords/hashtags for deliverable detection */
  matchKeywords: jsonb("matchKeywords").notNull().default([]),
  /** JSON: extensible metadata (webhook config, scan preferences, etc.) */
  meta: jsonb("meta").notNull().default({}),
  createdAt: text("createdAt").notNull(),
  updatedAt: text("updatedAt").notNull(),
  createdBy: text("createdBy")
    .notNull()
    .references(() => user.id),
});

export const campaignCreator = pgTable("campaign_creator", {
  id: text("id").primaryKey(),
  campaignId: text("campaignId")
    .notNull()
    .references(() => campaign.id),
  instagramHandle: text("instagramHandle"),
  tiktokHandle: text("tiktokHandle"),
  label: text("label"),
  role: creatorRoleEnum("role").notNull().default("primary"),
  /** Link to the analysis_run that evaluated this creator */
  analysisRunId: text("analysisRunId"),
  budgetAmount: integer("budgetAmount"),
  budgetCurrency: text("budgetCurrency"),
  notes: text("notes"),
  addedAt: text("addedAt").notNull(),
});

export const campaignDeliverable = pgTable("campaign_deliverable", {
  id: text("id").primaryKey(),
  campaignId: text("campaignId")
    .notNull()
    .references(() => campaign.id),
  creatorId: text("creatorId")
    .notNull()
    .references(() => campaignCreator.id),
  platform: platformEnum("platform").notNull(),
  postId: text("postId").notNull(),
  permalink: text("permalink").notNull(),
  caption: text("caption"),
  thumbnailUrl: text("thumbnailUrl"),
  views: integer("views"),
  likes: integer("likes"),
  publishedAt: text("publishedAt"),
  contentKind: text("contentKind"),
  /** "auto" = matched by keyword/tag, "manual" = operator added manually */
  matchType: matchTypeEnum("matchType").notNull().default("auto"),
  /** Why it matched (e.g., "caption_keyword: dimes", "tagged_user: dimes.tr") */
  matchReason: text("matchReason"),
  detectedAt: text("detectedAt").notNull(),
});

// ---------------------------------------------------------------------------
// Coverage product tables (Dimes Content Coverage Intelligence)
// ---------------------------------------------------------------------------

export const coverageScanRun = pgTable("coverage_scan_run", {
  id: text("id").primaryKey(),
  type: scanTypeEnum("type").notNull(),
  status: runStatusEnum("status").notNull(),
  startedAt: text("startedAt").notNull(),
  completedAt: text("completedAt"),
  accountsScanned: integer("accountsScanned").notNull().default(0),
  postsFound: integer("postsFound").notNull().default(0),
  newPostsIngested: integer("newPostsIngested").notNull().default(0),
  clustersCreated: integer("clustersCreated").notNull().default(0),
  /** JSON: ScanError[] */
  errorsJson: jsonb("errorsJson").notNull().default([]),
});

export const coveragePost = pgTable("coverage_post", {
  id: text("id").primaryKey(),
  scanRunId: text("scanRunId").notNull(),
  accountId: text("accountId").notNull(),
  brandId: text("brandId").notNull(),
  platform: text("platform").notNull(),
  platformPostId: text("platformPostId").notNull(),
  permalink: text("permalink").notNull(),
  caption: text("caption"),
  normalizedCaption: text("normalizedCaption"),
  hashtagsJson: jsonb("hashtagsJson").notNull().default([]),
  mentionsJson: jsonb("mentionsJson").notNull().default([]),
  publishedAt: text("publishedAt").notNull(),
  fetchedAt: text("fetchedAt").notNull(),
  mediaType: text("mediaType"),
  thumbnailUrl: text("thumbnailUrl"),
  classification: text("classification").notNull(),
  classificationSignalsJson: jsonb("classificationSignalsJson")
    .notNull()
    .default([]),
  clusterFingerprint: text("clusterFingerprint"),
});

// Per-account scan state — durable cursor for fast scans
export const coverageAccountScanState = pgTable(
  "coverage_account_scan_state",
  {
    accountId: text("accountId").primaryKey(),
    platform: text("platform").notNull(),
    brandId: text("brandId").notNull(),
    lastSuccessfulScanAt: text("lastSuccessfulScanAt"),
    lastScanMode: scanTypeEnum("lastScanMode"),
    lastScanPostCount: integer("lastScanPostCount").notNull().default(0),
    latestPostPublishedAt: text("latestPostPublishedAt"),
    updatedAt: text("updatedAt").notNull(),
  }
);

// ---------------------------------------------------------------------------
// Workspace Scan Cache — Durable provider result cache
// ---------------------------------------------------------------------------

export const creatorScanCache = pgTable("creator_scan_cache", {
  id: text("id").primaryKey(),
  platform: platformEnum("platform").notNull(),
  /** Normalized lowercase username */
  username: text("username").notNull(),
  /** JSON: serialized ProviderResult (items, profile, totalFetched, source) */
  providerResultJson: jsonb("providerResultJson").notNull(),
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
// ---------------------------------------------------------------------------

export const creatorMediaItem = pgTable("creator_media_item", {
  id: text("id").primaryKey(),
  platform: platformEnum("platform").notNull(),
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
  isCommercial: boolean("isCommercial").notNull().default(false),
  /** JSON: commercialMetadata from provider */
  commercialMetadataJson: jsonb("commercialMetadataJson"),
  /** JSON: raw provider metadata snapshot */
  rawMetadataJson: jsonb("rawMetadataJson"),
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
// ---------------------------------------------------------------------------

export const creatorScanProfile = pgTable("creator_scan_profile", {
  id: text("id").primaryKey(),
  platform: platformEnum("platform").notNull(),
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
  profileSnapshotJson: jsonb("profileSnapshotJson"),
  updatedAt: text("updatedAt").notNull(),
});

// ---------------------------------------------------------------------------
// Influencer Identity — Links IG + TT accounts as one person
// ---------------------------------------------------------------------------

export const influencerIdentity = pgTable("influencer_identity", {
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

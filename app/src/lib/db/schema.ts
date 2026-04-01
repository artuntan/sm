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
  index,
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
export const jobStatusEnum = pgEnum("job_status", [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);
export const outboxStatusEnum = pgEnum("outbox_status", [
  "pending",
  "processing",
  "published",
  "failed",
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
}, (table) => [
  index("session_user_id_idx").on(table.userId),
]);

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
}, (table) => [
  index("team_membership_user_id_idx").on(table.userId),
  index("team_membership_team_id_idx").on(table.teamId),
]);

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
}, (table) => [
  index("team_join_request_user_id_idx").on(table.userId),
  index("team_join_request_team_id_idx").on(table.teamId),
  index("team_join_request_status_idx").on(table.status),
]);

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
}, (table) => [
  index("analysis_run_team_id_idx").on(table.teamId),
  index("analysis_run_user_id_idx").on(table.userId),
  index("analysis_run_status_idx").on(table.status),
]);

// ---------------------------------------------------------------------------
// Durable job foundation
// ---------------------------------------------------------------------------

export const job = pgTable("job", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  status: jobStatusEnum("status").notNull().default("queued"),
  teamId: text("teamId").references(() => team.id),
  createdBy: text("createdBy").references(() => user.id),
  payloadJson: jsonb("payloadJson").notNull().default({}),
  resultJson: jsonb("resultJson"),
  idempotencyKey: text("idempotencyKey").notNull(),
  maxAttempts: integer("maxAttempts").notNull().default(3),
  attemptCount: integer("attemptCount").notNull().default(0),
  priority: integer("priority").notNull().default(100),
  availableAt: timestamp("availableAt").notNull().defaultNow(),
  leaseExpiresAt: timestamp("leaseExpiresAt"),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  lastError: text("lastError"),
  parentJobId: text("parentJobId"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("job_idempotency_key_uidx").on(table.idempotencyKey),
  index("job_status_available_at_idx").on(table.status, table.availableAt),
  index("job_team_id_idx").on(table.teamId),
  index("job_created_by_idx").on(table.createdBy),
  index("job_parent_job_id_idx").on(table.parentJobId),
  index("job_kind_idx").on(table.kind),
]);

export const jobAttempt = pgTable("job_attempt", {
  id: text("id").primaryKey(),
  jobId: text("jobId")
    .notNull()
    .references(() => job.id),
  attemptNumber: integer("attemptNumber").notNull(),
  status: text("status").notNull(),
  error: text("error"),
  startedAt: timestamp("startedAt").notNull().defaultNow(),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
}, (table) => [
  index("job_attempt_job_id_idx").on(table.jobId),
]);

export const outboxEvent = pgTable("outbox_event", {
  id: text("id").primaryKey(),
  topic: text("topic").notNull(),
  aggregateType: text("aggregateType"),
  aggregateId: text("aggregateId"),
  payloadJson: jsonb("payloadJson").notNull().default({}),
  status: outboxStatusEnum("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  availableAt: timestamp("availableAt").notNull().defaultNow(),
  publishedAt: timestamp("publishedAt"),
  lastError: text("lastError"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
}, (table) => [
  index("outbox_event_status_available_at_idx").on(table.status, table.availableAt),
  index("outbox_event_aggregate_idx").on(table.aggregateType, table.aggregateId),
  index("outbox_event_topic_idx").on(table.topic),
]);

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
}, (table) => [
  index("campaign_team_id_idx").on(table.teamId),
  index("campaign_brand_id_idx").on(table.brandId),
  index("campaign_status_idx").on(table.status),
]);

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
}, (table) => [
  index("campaign_creator_campaign_id_idx").on(table.campaignId),
]);

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
}, (table) => [
  index("campaign_deliverable_campaign_id_idx").on(table.campaignId),
  index("campaign_deliverable_creator_id_idx").on(table.creatorId),
]);

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
}, (table) => [
  index("coverage_post_brand_id_idx").on(table.brandId),
  index("coverage_post_account_id_idx").on(table.accountId),
  index("coverage_post_scan_run_id_idx").on(table.scanRunId),
]);

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
}, (table) => [
  index("creator_scan_cache_platform_username_idx").on(table.platform, table.username),
]);

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
}, (table) => [
  index("creator_media_item_platform_username_idx").on(table.platform, table.username),
]);

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
}, (table) => [
  index("creator_scan_profile_platform_username_idx").on(table.platform, table.username),
]);

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

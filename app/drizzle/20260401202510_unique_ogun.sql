CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'active', 'monitoring', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."creator_role" AS ENUM('primary', 'secondary', 'shortlisted');--> statement-breakpoint
CREATE TYPE "public"."match_type" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TYPE "public"."platform" AS ENUM('instagram', 'tiktok');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'complete', 'partial', 'error');--> statement-breakpoint
CREATE TYPE "public"."scan_type" AS ENUM('backfill', 'daily', 'full', 'fast');--> statement-breakpoint
CREATE TYPE "public"."system_role" AS ENUM('system_admin', 'user');--> statement-breakpoint
CREATE TYPE "public"."team_role" AS ENUM('team_admin', 'member');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp,
	"refreshTokenExpiresAt" timestamp,
	"scope" text,
	"password" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analysis_run" (
	"id" text PRIMARY KEY NOT NULL,
	"teamId" text NOT NULL,
	"userId" text NOT NULL,
	"status" "run_status" NOT NULL,
	"totalRows" integer DEFAULT 0 NOT NULL,
	"completeRows" integer DEFAULT 0 NOT NULL,
	"partialRows" integer DEFAULT 0 NOT NULL,
	"errorRows" integer DEFAULT 0 NOT NULL,
	"inputSummary" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"resultSnapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"startedAt" timestamp DEFAULT now() NOT NULL,
	"completedAt" timestamp,
	"schemaVersion" integer DEFAULT 1 NOT NULL,
	"note" text,
	"archived" boolean DEFAULT false NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign" (
	"id" text PRIMARY KEY NOT NULL,
	"teamId" text NOT NULL,
	"name" text NOT NULL,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"brandId" text,
	"startDate" text,
	"endDate" text,
	"notes" text,
	"budgetAmount" integer,
	"budgetCurrency" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"matchKeywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"createdAt" text NOT NULL,
	"updatedAt" text NOT NULL,
	"createdBy" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_creator" (
	"id" text PRIMARY KEY NOT NULL,
	"campaignId" text NOT NULL,
	"instagramHandle" text,
	"tiktokHandle" text,
	"label" text,
	"role" "creator_role" DEFAULT 'primary' NOT NULL,
	"analysisRunId" text,
	"budgetAmount" integer,
	"budgetCurrency" text,
	"notes" text,
	"addedAt" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_deliverable" (
	"id" text PRIMARY KEY NOT NULL,
	"campaignId" text NOT NULL,
	"creatorId" text NOT NULL,
	"platform" "platform" NOT NULL,
	"postId" text NOT NULL,
	"permalink" text NOT NULL,
	"caption" text,
	"thumbnailUrl" text,
	"views" integer,
	"likes" integer,
	"publishedAt" text,
	"contentKind" text,
	"matchType" "match_type" DEFAULT 'auto' NOT NULL,
	"matchReason" text,
	"detectedAt" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coverage_account_scan_state" (
	"accountId" text PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"brandId" text NOT NULL,
	"lastSuccessfulScanAt" text,
	"lastScanMode" "scan_type",
	"lastScanPostCount" integer DEFAULT 0 NOT NULL,
	"latestPostPublishedAt" text,
	"updatedAt" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coverage_post" (
	"id" text PRIMARY KEY NOT NULL,
	"scanRunId" text NOT NULL,
	"accountId" text NOT NULL,
	"brandId" text NOT NULL,
	"platform" text NOT NULL,
	"platformPostId" text NOT NULL,
	"permalink" text NOT NULL,
	"caption" text,
	"normalizedCaption" text,
	"hashtagsJson" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mentionsJson" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"publishedAt" text NOT NULL,
	"fetchedAt" text NOT NULL,
	"mediaType" text,
	"thumbnailUrl" text,
	"classification" text NOT NULL,
	"classificationSignalsJson" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"clusterFingerprint" text
);
--> statement-breakpoint
CREATE TABLE "coverage_scan_run" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "scan_type" NOT NULL,
	"status" "run_status" NOT NULL,
	"startedAt" text NOT NULL,
	"completedAt" text,
	"accountsScanned" integer DEFAULT 0 NOT NULL,
	"postsFound" integer DEFAULT 0 NOT NULL,
	"newPostsIngested" integer DEFAULT 0 NOT NULL,
	"clustersCreated" integer DEFAULT 0 NOT NULL,
	"errorsJson" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_media_item" (
	"id" text PRIMARY KEY NOT NULL,
	"platform" "platform" NOT NULL,
	"username" text NOT NULL,
	"externalId" text NOT NULL,
	"permalink" text NOT NULL,
	"caption" text,
	"publishedAt" text NOT NULL,
	"contentKind" text,
	"thumbnailUrl" text,
	"views" integer,
	"likes" integer,
	"comments" integer,
	"isCommercial" boolean DEFAULT false NOT NULL,
	"commercialMetadataJson" jsonb,
	"rawMetadataJson" jsonb,
	"firstSeenAt" text NOT NULL,
	"lastMetricUpdateAt" text NOT NULL,
	"previousViews" integer,
	"metricUpdateCount" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_scan_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"platform" "platform" NOT NULL,
	"username" text NOT NULL,
	"providerResultJson" jsonb NOT NULL,
	"providerSource" text NOT NULL,
	"itemCount" integer DEFAULT 0 NOT NULL,
	"fetchedAt" text NOT NULL,
	"expiresAt" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_scan_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"platform" "platform" NOT NULL,
	"username" text NOT NULL,
	"totalItemsSeen" integer DEFAULT 0 NOT NULL,
	"scanCount" integer DEFAULT 0 NOT NULL,
	"postsPerWeek" integer DEFAULT 0 NOT NULL,
	"adaptiveTtlMs" integer DEFAULT 86400000 NOT NULL,
	"firstScanAt" text NOT NULL,
	"lastScanAt" text NOT NULL,
	"latestPostAt" text,
	"earliestPostAt" text,
	"profileSnapshotJson" jsonb,
	"updatedAt" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "influencer_identity" (
	"id" text PRIMARY KEY NOT NULL,
	"instagramUsername" text,
	"tiktokUsername" text,
	"displayName" text,
	"createdAt" text NOT NULL,
	"updatedAt" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "team" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "team_join_request" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"teamId" text NOT NULL,
	"status" "request_status" DEFAULT 'pending' NOT NULL,
	"reviewedBy" text,
	"reviewedAt" timestamp,
	"rejectionReason" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_membership" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"teamId" text NOT NULL,
	"role" "team_role" DEFAULT 'member' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"joinedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"systemRole" "system_role" DEFAULT 'user' NOT NULL,
	"approvalStatus" "approval_status" DEFAULT 'pending' NOT NULL,
	"approvedBy" text,
	"approvedAt" timestamp,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp,
	"updatedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_run" ADD CONSTRAINT "analysis_run_teamId_team_id_fk" FOREIGN KEY ("teamId") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analysis_run" ADD CONSTRAINT "analysis_run_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_teamId_team_id_fk" FOREIGN KEY ("teamId") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_creator" ADD CONSTRAINT "campaign_creator_campaignId_campaign_id_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."campaign"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_deliverable" ADD CONSTRAINT "campaign_deliverable_campaignId_campaign_id_fk" FOREIGN KEY ("campaignId") REFERENCES "public"."campaign"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_deliverable" ADD CONSTRAINT "campaign_deliverable_creatorId_campaign_creator_id_fk" FOREIGN KEY ("creatorId") REFERENCES "public"."campaign_creator"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_join_request" ADD CONSTRAINT "team_join_request_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_join_request" ADD CONSTRAINT "team_join_request_teamId_team_id_fk" FOREIGN KEY ("teamId") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_membership" ADD CONSTRAINT "team_membership_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_membership" ADD CONSTRAINT "team_membership_teamId_team_id_fk" FOREIGN KEY ("teamId") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analysis_run_team_id_idx" ON "analysis_run" USING btree ("teamId");--> statement-breakpoint
CREATE INDEX "analysis_run_user_id_idx" ON "analysis_run" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "analysis_run_status_idx" ON "analysis_run" USING btree ("status");--> statement-breakpoint
CREATE INDEX "campaign_team_id_idx" ON "campaign" USING btree ("teamId");--> statement-breakpoint
CREATE INDEX "campaign_brand_id_idx" ON "campaign" USING btree ("brandId");--> statement-breakpoint
CREATE INDEX "campaign_status_idx" ON "campaign" USING btree ("status");--> statement-breakpoint
CREATE INDEX "campaign_creator_campaign_id_idx" ON "campaign_creator" USING btree ("campaignId");--> statement-breakpoint
CREATE INDEX "campaign_deliverable_campaign_id_idx" ON "campaign_deliverable" USING btree ("campaignId");--> statement-breakpoint
CREATE INDEX "campaign_deliverable_creator_id_idx" ON "campaign_deliverable" USING btree ("creatorId");--> statement-breakpoint
CREATE INDEX "coverage_post_brand_id_idx" ON "coverage_post" USING btree ("brandId");--> statement-breakpoint
CREATE INDEX "coverage_post_account_id_idx" ON "coverage_post" USING btree ("accountId");--> statement-breakpoint
CREATE INDEX "coverage_post_scan_run_id_idx" ON "coverage_post" USING btree ("scanRunId");--> statement-breakpoint
CREATE INDEX "creator_media_item_platform_username_idx" ON "creator_media_item" USING btree ("platform","username");--> statement-breakpoint
CREATE INDEX "creator_scan_cache_platform_username_idx" ON "creator_scan_cache" USING btree ("platform","username");--> statement-breakpoint
CREATE INDEX "creator_scan_profile_platform_username_idx" ON "creator_scan_profile" USING btree ("platform","username");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "team_join_request_user_id_idx" ON "team_join_request" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "team_join_request_team_id_idx" ON "team_join_request" USING btree ("teamId");--> statement-breakpoint
CREATE INDEX "team_join_request_status_idx" ON "team_join_request" USING btree ("status");--> statement-breakpoint
CREATE INDEX "team_membership_user_id_idx" ON "team_membership" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "team_membership_team_id_idx" ON "team_membership" USING btree ("teamId");
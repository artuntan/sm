CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'processing', 'published', 'failed');--> statement-breakpoint
CREATE TABLE "job" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"teamId" text,
	"createdBy" text,
	"payloadJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resultJson" jsonb,
	"idempotencyKey" text NOT NULL,
	"maxAttempts" integer DEFAULT 3 NOT NULL,
	"attemptCount" integer DEFAULT 0 NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"availableAt" timestamp DEFAULT now() NOT NULL,
	"leaseExpiresAt" timestamp,
	"startedAt" timestamp,
	"completedAt" timestamp,
	"lastError" text,
	"parentJobId" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"jobId" text NOT NULL,
	"attemptNumber" integer NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"startedAt" timestamp DEFAULT now() NOT NULL,
	"completedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_event" (
	"id" text PRIMARY KEY NOT NULL,
	"topic" text NOT NULL,
	"aggregateType" text,
	"aggregateId" text,
	"payloadJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"availableAt" timestamp DEFAULT now() NOT NULL,
	"publishedAt" timestamp,
	"lastError" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_teamId_team_id_fk" FOREIGN KEY ("teamId") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_attempt" ADD CONSTRAINT "job_attempt_jobId_job_id_fk" FOREIGN KEY ("jobId") REFERENCES "public"."job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_idempotency_key_uidx" ON "job" USING btree ("idempotencyKey");--> statement-breakpoint
CREATE INDEX "job_status_available_at_idx" ON "job" USING btree ("status","availableAt");--> statement-breakpoint
CREATE INDEX "job_team_id_idx" ON "job" USING btree ("teamId");--> statement-breakpoint
CREATE INDEX "job_created_by_idx" ON "job" USING btree ("createdBy");--> statement-breakpoint
CREATE INDEX "job_parent_job_id_idx" ON "job" USING btree ("parentJobId");--> statement-breakpoint
CREATE INDEX "job_kind_idx" ON "job" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "job_attempt_job_id_idx" ON "job_attempt" USING btree ("jobId");--> statement-breakpoint
CREATE INDEX "outbox_event_status_available_at_idx" ON "outbox_event" USING btree ("status","availableAt");--> statement-breakpoint
CREATE INDEX "outbox_event_aggregate_idx" ON "outbox_event" USING btree ("aggregateType","aggregateId");--> statement-breakpoint
CREATE INDEX "outbox_event_topic_idx" ON "outbox_event" USING btree ("topic");
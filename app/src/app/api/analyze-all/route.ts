import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireApproved,
  requireTeamMemberOrSystemAdmin,
} from "@/lib/auth/guards";
import { checkRateLimit, expensiveApiLimiter } from "@/lib/rate-limit";
import type {
  MultiPlatformResult,
  Platform,
  PlatformAnalysis,
} from "@/lib/domain/types";
import { analyzeCreatorWithIdentity } from "@/lib/services/analyze-service";
import { enqueueJob } from "@/lib/services/job-service";
import { BATCH_ANALYSIS_JOB_KIND } from "@/lib/jobs/kinds";

const AnalyzeAllSchema = z.object({
  instagram: z.string().min(1).max(100).optional().nullable(),
  tiktok: z.string().min(1).max(100).optional().nullable(),
  forceRefresh: z.boolean().optional().default(false),
});

const BatchRowSchema = z
  .object({
    id: z.string().min(1),
    instagramUsername: z.string().min(1).max(100).nullable(),
    tiktokUsername: z.string().min(1).max(100).nullable(),
    label: z.string().max(200).nullable().optional(),
    notes: z.string().max(2_000).nullable().optional(),
    sourceRowIndex: z.number().int().positive(),
  })
  .refine(
    (row) => Boolean(row.instagramUsername || row.tiktokUsername),
    {
      message: "Each row must include at least one platform username.",
      path: ["rows"],
    }
  );

const BatchAnalyzeSchema = z.object({
  rows: z.array(BatchRowSchema).min(1).max(250),
  forceRefresh: z.boolean().optional().default(false),
});

async function parseRequestBody(request: NextRequest): Promise<
  | { ok: true; body: unknown }
  | { ok: false; response: NextResponse }
> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: "Request body must be valid JSON.",
          },
        },
        { status: 400 }
      ),
    };
  }
}

export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(expensiveApiLimiter, "analyze-all");
  if (limited) {
    return limited;
  }

  const parsedRequest = await parseRequestBody(request);
  if (!parsedRequest.ok) {
    return parsedRequest.response;
  }

  const body = parsedRequest.body;

  if (body && typeof body === "object" && Array.isArray((body as { rows?: unknown[] }).rows)) {
    const authResult = await requireTeamMemberOrSystemAdmin();
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const { user, team } = authResult;
    if (!team?.teamId) {
      return NextResponse.json(
        {
          error: {
            code: "NO_TEAM",
            message: "Team membership is required for durable batch analysis.",
          },
        },
        { status: 422 }
      );
    }

    const batchParseResult = BatchAnalyzeSchema.safeParse(body);
    if (!batchParseResult.success) {
      return NextResponse.json(
        {
          error: {
            code: "INVALID_REQUEST",
            message: batchParseResult.error.issues
              .map((issue) => issue.message)
              .join("; "),
          },
        },
        { status: 400 }
      );
    }

    const startedAt = new Date().toISOString();
    const job = await enqueueJob({
      kind: BATCH_ANALYSIS_JOB_KIND,
      teamId: team.teamId,
      createdBy: user.id,
      maxAttempts: 2,
      priority: 50,
      idempotencyKey: `batch-analysis:${crypto.randomUUID()}`,
      payload: {
        rows: batchParseResult.data.rows,
        forceRefresh: batchParseResult.data.forceRefresh,
        startedAt,
      },
    });

    return NextResponse.json(
      {
        jobId: job.id,
        status: job.status,
        statusUrl: `/api/batch-jobs/${job.id}`,
      },
      { status: 202 }
    );
  }

  const user = await requireApproved();
  if (user instanceof NextResponse) {
    return user;
  }

  const parseResult = AnalyzeAllSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: parseResult.error.issues.map((issue) => issue.message).join("; "),
        },
      },
      { status: 400 }
    );
  }

  const { instagram, tiktok, forceRefresh } = parseResult.data;

  if (!instagram && !tiktok) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "At least one username (instagram or tiktok) is required.",
        },
      },
      { status: 400 }
    );
  }

  const tasks: Promise<[Platform, PlatformAnalysis]>[] = [];

  if (instagram) {
    tasks.push(
      analyzeCreatorWithIdentity("instagram", instagram, {
        forceRefresh,
        pairedWith: tiktok ?? null,
      }).then((analysis) => ["instagram", analysis])
    );
  }

  if (tiktok) {
    tasks.push(
      analyzeCreatorWithIdentity("tiktok", tiktok, {
        forceRefresh,
        pairedWith: instagram ?? null,
      }).then((analysis) => ["tiktok", analysis])
    );
  }

  const results = await Promise.allSettled(tasks);
  const platforms: MultiPlatformResult["platforms"] = {};

  for (const result of results) {
    if (result.status === "fulfilled") {
      const [platform, analysis] = result.value;
      platforms[platform] = analysis;
    }
  }

  return NextResponse.json({
    analyzedAt: new Date().toISOString(),
    query: {
      instagram: instagram ?? null,
      tiktok: tiktok ?? null,
    },
    platforms,
  } satisfies MultiPlatformResult);
}

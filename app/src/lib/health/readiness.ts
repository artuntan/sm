import { pool } from "@/lib/db";
import type { QueryConfig } from "pg";

const READINESS_QUERY_TIMEOUT_MS = 2_000;

type TimedQueryConfig = QueryConfig & {
  query_timeout: number;
};

export type ReadinessCheck = {
  name: string;
  status: "ok" | "error";
  message?: string;
};

export async function checkReadiness(): Promise<{
  ready: boolean;
  checks: ReadinessCheck[];
}> {
  const checks: ReadinessCheck[] = [];

  if (!process.env.DATABASE_URL) {
    checks.push({
      name: "database",
      status: "error",
      message: "DATABASE_URL is not configured",
    });

    return { ready: false, checks };
  }

  try {
    const readinessQuery: TimedQueryConfig = {
      text: "select 1",
      query_timeout: READINESS_QUERY_TIMEOUT_MS,
    };

    await pool().query(readinessQuery);
    checks.push({ name: "database", status: "ok" });
  } catch (error) {
    checks.push({
      name: "database",
      status: "error",
      message: error instanceof Error ? error.message : "Database check failed",
    });
  }

  return {
    ready: checks.every((check) => check.status === "ok"),
    checks,
  };
}

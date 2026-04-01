import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadProjectEnv } = require("./lib/load-env.cjs");

function parseLimit(raw: string | undefined): number {
  if (!raw) {
    return 10;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Expected a positive integer limit, received "${raw}"`);
  }

  return parsed;
}

async function main() {
  loadProjectEnv();

  const limit = parseLimit(process.argv[2] ?? process.env.JOB_RUN_LIMIT);
  const { runReadyJobs } = await import("../src/lib/jobs/runner");
  const results = await runReadyJobs(limit);
  const processed = results.filter(Boolean);

  const summary = processed.reduce(
    (acc, job) => {
      if (!job) {
        return acc;
      }

      acc[job.status] = (acc[job.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  console.log(
    JSON.stringify(
      {
        limit,
        processedCount: processed.length,
        summary,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("[jobs] drain failed", error);
  process.exitCode = 1;
});

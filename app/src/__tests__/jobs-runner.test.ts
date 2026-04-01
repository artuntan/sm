import { createJobRunner } from "@/lib/jobs/runner";
import { createJobService, createInMemoryJobStore } from "@/lib/services/job-service";

describe("durable job foundation", () => {
  const fixedNow = new Date("2026-04-01T10:00:00.000Z");

  it("returns the existing job for duplicate idempotency keys", async () => {
    const store = createInMemoryJobStore();
    const publish = jest.fn().mockResolvedValue(undefined);
    const service = createJobService({
      store,
      queue: { publish },
      now: () => fixedNow,
    });

    const first = await service.enqueue({
      kind: "test.noop",
      payload: { value: 1 },
      idempotencyKey: "same-key",
    });

    const duplicate = await service.enqueue({
      kind: "test.noop",
      payload: { value: 2 },
      idempotencyKey: "same-key",
    });

    expect(duplicate.id).toBe(first.id);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("retries a transient failure and eventually completes", async () => {
    const store = createInMemoryJobStore();
    const service = createJobService({
      store,
      queue: { publish: jest.fn().mockResolvedValue(undefined) },
      now: () => fixedNow,
    });

    const job = await service.enqueue({
      kind: "test.retry",
      payload: { username: "creator" },
      idempotencyKey: "retry-job",
      maxAttempts: 2,
    });

    let calls = 0;
    const runner = createJobRunner({
      store,
      getHandler: () => async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error("temporary upstream failure");
        }

        return { ok: true };
      },
      now: () => fixedNow,
      retryDelayMs: () => 1_000,
    });

    await runner.run(job.id);

    const afterFirstAttempt = await service.getJobDetails(job.id);
    expect(afterFirstAttempt?.job.status).toBe("queued");
    expect(afterFirstAttempt?.job.attemptCount).toBe(1);
    expect(afterFirstAttempt?.attempts).toHaveLength(1);
    expect(afterFirstAttempt?.attempts[0].status).toBe("retrying");
    expect(afterFirstAttempt?.job.lastError).toContain("temporary upstream failure");

    await runner.run(job.id);

    const afterSecondAttempt = await service.getJobDetails(job.id);
    expect(afterSecondAttempt?.job.status).toBe("completed");
    expect(afterSecondAttempt?.job.attemptCount).toBe(2);
    expect(afterSecondAttempt?.job.resultJson).toEqual({ ok: true });
    expect(afterSecondAttempt?.attempts).toHaveLength(2);
    expect(afterSecondAttempt?.attempts[1].status).toBe("completed");
  });

  it("marks a job as failed once retries are exhausted", async () => {
    const store = createInMemoryJobStore();
    const service = createJobService({
      store,
      queue: { publish: jest.fn().mockResolvedValue(undefined) },
      now: () => fixedNow,
    });

    const job = await service.enqueue({
      kind: "test.fail",
      payload: {},
      idempotencyKey: "terminal-failure",
      maxAttempts: 1,
    });

    const runner = createJobRunner({
      store,
      getHandler: () => async () => {
        throw new Error("permanent failure");
      },
      now: () => fixedNow,
      retryDelayMs: () => 1_000,
    });

    await runner.run(job.id);

    const details = await service.getJobDetails(job.id);
    expect(details?.job.status).toBe("failed");
    expect(details?.job.attemptCount).toBe(1);
    expect(details?.job.lastError).toContain("permanent failure");
    expect(details?.attempts).toHaveLength(1);
    expect(details?.attempts[0].status).toBe("failed");
  });
});

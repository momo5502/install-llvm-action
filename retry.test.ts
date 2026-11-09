import * as assert from "assert";
import * as tc from "@actions/tool-cache";

import { RetryClock, retryUntilDeadline } from "./retry";

const OPTIONS = { deadlineMilliseconds: 60_000, firstDelayMilliseconds: 15_000, maxDelayMilliseconds: 20_000 };

function fakeClock(): RetryClock & { sleeps: number[] } {
  let time = 0;
  const sleeps: number[] = [];
  return {
    sleeps,
    now: () => time,
    sleep: async milliseconds => {
      sleeps.push(milliseconds);
      time += milliseconds;
    },
  };
}

function failing(errors: unknown[]): () => Promise<string> {
  return async () => {
    const error = errors.shift();
    if (error !== undefined) {
      throw error;
    }
    return "archive";
  };
}

async function main() {
  {
    const clock = fakeClock();
    const result = await retryUntilDeadline(
      failing([new tc.HTTPError(504), new tc.HTTPError(429), new Error("socket hang up")]),
      OPTIONS,
      clock,
    );
    assert.strictEqual(result, "archive");
    assert.deepStrictEqual(clock.sleeps, [15_000, 20_000, 20_000]);
  }
  {
    const clock = fakeClock();
    await assert.rejects(retryUntilDeadline(failing([new tc.HTTPError(404)]), OPTIONS, clock), tc.HTTPError);
    assert.deepStrictEqual(clock.sleeps, []);
  }
  {
    const clock = fakeClock();
    const errors = Array.from({ length: 10 }, () => new tc.HTTPError(503));
    await assert.rejects(retryUntilDeadline(failing(errors), OPTIONS, clock), tc.HTTPError);
    assert.deepStrictEqual(clock.sleeps, [15_000, 20_000, 20_000, 5_000]);
  }
  console.log("retry tests passed");
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

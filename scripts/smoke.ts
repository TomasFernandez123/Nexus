import {
  E2EHarnessError,
  runCliHelpSmoke,
  runMcpHealthSmoke,
  type HarnessDeps,
} from '../tests/e2e/harness.js';
import { createE2EFixture, type E2EFixture } from '../tests/e2e/fixtures/index.js';

export const runE2E = async (
  fixture: E2EFixture = createE2EFixture(),
  deps?: HarnessDeps,
): Promise<void> => {
  await runCliHelpSmoke(fixture, deps);
  await runMcpHealthSmoke(fixture, deps);
};

const formatError = (error: unknown): string => {
  if (error instanceof E2EHarnessError) {
    return JSON.stringify(
      {
        step: error.diagnostics.step,
        reason: error.diagnostics.reason,
        processState: error.diagnostics.processState,
      },
      null,
      2,
    );
  }

  return error instanceof Error ? error.message : String(error);
};

export const main = async (): Promise<void> => {
  await runE2E();
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(formatError(error));
    process.exitCode = 1;
  });
}

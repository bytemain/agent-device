import assert from 'node:assert/strict';
import fc from 'fast-check';
import { test } from 'vitest';
import {
  compareDifferentialCases,
  swiftToolchainAvailable,
  SWIFT_RUN_TIMEOUT_MS,
  writeDifferentialFailureArtifact,
} from './conformance-harness.ts';
import { differentialBatchArbitrary } from './conformance-generator.ts';
import { readIosSnapshotEngineFixture } from './conformance-fixture.ts';

type DifferentialCase = Parameters<typeof compareDifferentialCases>[0][number];

const FUZZ_SEEDS = [219101, 219102, 219103, 219104];
const RUNS_PER_SEED = 8;
const MAX_TOTAL_DURATION_MS = 60_000;

const differentialTest = swiftToolchainAvailable() ? test : test.skip;

differentialTest('authored Swift and TypeScript golden cases agree', () => {
  const fixture = readIosSnapshotEngineFixture();
  const cases = fixture.cases
    .filter((testCase) => testCase.swift && !testCase.interactiveOnly)
    .map((testCase) => ({
      name: testCase.name,
      projection: testCase.projection,
      interactiveOnly: false as const,
      depth: testCase.depth,
      scope: testCase.scope,
      foldPolicy: testCase.foldPolicy,
      viewport: fixture.viewport,
      nodes: testCase.nodes,
    }));
  const mismatch = compareDifferentialCases(cases);
  assert.equal(mismatch, undefined, mismatch ? JSON.stringify(mismatch, null, 2) : '');
});

differentialTest('deterministic Swift/TypeScript differential fuzz stays under 60000ms', () => {
  assertDifferentialFuzz();
});

function assertDifferentialFuzz(): void {
  const startedAt = performance.now();
  for (const seed of FUZZ_SEEDS) {
    assertDifferentialSeed(seed);
    assertWithinKillCriterion(startedAt, seed);
  }
  assert.ok(true);
}

function assertDifferentialSeed(seed: number): void {
  const result = fc.check(
    fc.property(
      differentialBatchArbitrary,
      (cases) => compareDifferentialCases(cases) === undefined,
    ),
    {
      seed,
      numRuns: RUNS_PER_SEED,
      endOnFailure: true,
      interruptAfterTimeLimit: SWIFT_RUN_TIMEOUT_MS,
    },
  );
  if (!result.failed) return;

  const counterexample = Array.isArray(result.counterexample?.[0])
    ? (result.counterexample[0] as DifferentialCase[])
    : [];
  const mismatch = compareDifferentialCases(counterexample);
  const testCase = mismatch?.case ?? counterexample[0];
  if (!testCase) {
    throw new Error('differential fuzz failed without a reproducible case: ' + String(result));
  }
  const artifact = writeDifferentialFailureArtifact({
    testCase,
    seed,
    counterexamplePath: result.counterexamplePath ?? 'unknown',
  });
  throw new Error(
    'Swift/TypeScript differential mismatch for ' +
      testCase.name +
      '; minimal case: ' +
      artifact.casePath +
      '; replay: ' +
      artifact.replayCommand,
  );
}

function assertWithinKillCriterion(startedAt: number, seed: number): void {
  if (performance.now() - startedAt <= MAX_TOTAL_DURATION_MS) return;
  throw new Error(
    'differential fuzz exceeded its ' +
      String(MAX_TOTAL_DURATION_MS) +
      'ms kill criterion after seed ' +
      String(seed),
  );
}

import { spawnSync } from 'node:child_process';
import type { ReplaySuiteResult } from '@agent-device/contracts/replay';

export type EngineResult = {
  engine: 'maestro' | 'agent-device';
  outcome: 'pass' | 'fail';
  exitCode: number;
  /** Failure provenance stays distinct from the behavioral comparison. */
  failureKind?: 'behavioral' | 'infrastructure';
};

export function runMaestroEngine(command: string, args: string[]): EngineResult {
  const [bin = '', ...rest] = command.split(' ').filter(Boolean);
  const result = spawnSync(bin, [...rest, ...args], { stdio: 'inherit', cwd: process.cwd() });
  // Maestro does not expose typed failure provenance. Until it does, a non-zero exit cannot
  // safely satisfy a behavioral divergence waiver.
  return buildEngineResult('maestro', result, () => 'infrastructure');
}

export function classifyAgentDeviceFailure(stdout: string): 'behavioral' | 'infrastructure' {
  try {
    const envelope = JSON.parse(stdout) as { data?: ReplaySuiteResult };
    const failures = envelope.data?.failures;
    if (!Array.isArray(failures) || failures.length === 0) return 'infrastructure';
    return failures.some((failure) => failure.infrastructure === true)
      ? 'infrastructure'
      : 'behavioral';
  } catch {
    // A non-zero process that did not return the promised suite envelope never reached a
    // classifiable behavioral oracle. Keep it red, but do not call it a divergence.
    return 'infrastructure';
  }
}

/** What the device workflows set AGENT_DEVICE_CLI to, and the default here. */
const DEFAULT_AGENT_DEVICE_CLI = '--experimental-strip-types src/bin.ts';

/**
 * AGENT_DEVICE_CLI is a command *line* — node flags plus the entry script —
 * mirroring AGENT_DEVICE_PERF_CLI in scripts/perf/config.ts. Tokenizing it here,
 * beside the spawn it feeds, is what keeps `runAgentDeviceEngine`'s precondition
 * satisfiable: no caller downstream holds a string that is neither a path nor an
 * argv. A path with spaces is unreachable through the variable, as in the perf
 * harness; pass it as a single array element instead.
 */
export function resolveAgentDeviceCliArgv(value: string | undefined): string[] {
  return (value?.trim() || DEFAULT_AGENT_DEVICE_CLI).split(/\s+/);
}

/**
 * `cliArgv` is a node argv — node flags plus the entry script — never a single
 * command string. AGENT_DEVICE_CLI carries `--experimental-strip-types src/bin.ts`
 * on every device workflow, so a lone `string` here spawns node with that whole
 * line as one option ("bad option: --experimental-strip-types src/bin.ts") and
 * every scenario infrastructure-fails. By the time a path reaches this array it
 * is already its own element, spaces and all.
 */
export function runAgentDeviceEngine(cliArgv: readonly string[], args: string[]): EngineResult {
  const result = spawnSync(process.execPath, [...cliArgv, ...args, '--json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return buildEngineResult('agent-device', result, () => classifyAgentDeviceFailure(result.stdout));
}

function buildEngineResult(
  engine: EngineResult['engine'],
  result: { status: number | null; error?: Error },
  classifyFailure: () => NonNullable<EngineResult['failureKind']>,
): EngineResult {
  const exitCode = result.status ?? 1;
  if (exitCode === 0) return { engine, outcome: 'pass', exitCode };
  return {
    engine,
    outcome: 'fail',
    exitCode,
    failureKind:
      result.status === null || result.error !== undefined ? 'infrastructure' : classifyFailure(),
  };
}

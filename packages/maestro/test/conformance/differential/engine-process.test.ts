import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  classifyAgentDeviceFailure,
  resolveAgentDeviceCliArgv,
  runAgentDeviceEngine,
} from './engine-process.ts';

test('agent-device JSON distinguishes infrastructure from behavioral failures', () => {
  const result = (infrastructure?: true) =>
    JSON.stringify({
      success: true,
      data: {
        failures: [
          {
            status: 'failed',
            ...(infrastructure ? { infrastructure } : {}),
          },
        ],
      },
    });

  assert.equal(classifyAgentDeviceFailure(result(true)), 'infrastructure');
  assert.equal(classifyAgentDeviceFailure(result()), 'behavioral');
  assert.equal(classifyAgentDeviceFailure('not-json'), 'infrastructure');
});

test('agent-device execution accepts a CLI path containing spaces', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-device-engine path-'));
  const cliPath = path.join(root, 'agent device.mjs');
  try {
    fs.writeFileSync(cliPath, '');
    assert.deepEqual(runAgentDeviceEngine([cliPath], []), {
      engine: 'agent-device',
      outcome: 'pass',
      exitCode: 0,
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// The regression the nightly ran into for two days: AGENT_DEVICE_CLI carries node
// flags, and passing that line to node as one argument aborts before the CLI loads
// ("bad option: --experimental-strip-types src/bin.ts"), which every scenario then
// reports as an engine infrastructure failure rather than a divergence. Running the
// workflow's own shape end to end is what pins it — a fixture path with no flag
// cannot tell an argv from a command line.
test('agent-device execution spawns node flags as their own arguments', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-device-engine-argv-'));
  const cliPath = path.join(root, 'cli.ts');
  try {
    fs.writeFileSync(cliPath, 'const code: number = 0;\nprocess.exit(code);\n');
    assert.deepEqual(
      runAgentDeviceEngine(resolveAgentDeviceCliArgv(`--experimental-strip-types ${cliPath}`), []),
      { engine: 'agent-device', outcome: 'pass', exitCode: 0 },
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the agent-device CLI argv is the workflow command line, tokenized', () => {
  // The fallback is the source-CLI line the device workflows pass explicitly, so a
  // hand run without the variable reproduces CI rather than looking for a dist build.
  assert.deepEqual(resolveAgentDeviceCliArgv(undefined), [
    '--experimental-strip-types',
    'src/bin.ts',
  ]);
  assert.deepEqual(resolveAgentDeviceCliArgv('  '), ['--experimental-strip-types', 'src/bin.ts']);
  assert.deepEqual(resolveAgentDeviceCliArgv(' bin/agent-device.mjs '), ['bin/agent-device.mjs']);
});

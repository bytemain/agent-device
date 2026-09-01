import assert from 'node:assert/strict';
import { test } from 'vitest';
import { AppError } from '@agent-device/kernel/errors';
import {
  parseGitHubActionsArtifactInstallSourceSpec,
  parseInstallSourceConfig,
} from './install-source-config.ts';

test('parses GitHub Actions artifact specs into the exact install source shape', () => {
  assert.deepEqual(parseGitHubActionsArtifactInstallSourceSpec('  acme/mobile: 12345  '), {
    kind: 'github-actions-artifact',
    owner: 'acme',
    repo: 'mobile',
    artifactId: 12345,
  });
  assert.deepEqual(parseGitHubActionsArtifactInstallSourceSpec('acme/mobile: build-debug'), {
    kind: 'github-actions-artifact',
    owner: 'acme',
    repo: 'mobile',
    artifactName: 'build-debug',
  });
});

test('parses config artifact names and numeric IDs with trimmed repository fields', () => {
  assert.deepEqual(
    parseInstallSourceConfig(
      {
        type: 'github-actions-artifact',
        repo: ' acme/mobile ',
        artifact: ' build-debug ',
      },
      'user config file',
    ),
    {
      kind: 'github-actions-artifact',
      owner: 'acme',
      repo: 'mobile',
      artifactName: 'build-debug',
    },
  );
  assert.deepEqual(
    parseInstallSourceConfig(
      { type: 'github-actions-artifact', repo: 'acme/mobile', artifact: '12345' },
      'project config file',
    ),
    {
      kind: 'github-actions-artifact',
      owner: 'acme',
      repo: 'mobile',
      artifactId: 12345,
    },
  );
});

test('rejects empty and malformed source values with typed INVALID_ARGS errors', () => {
  assertInvalidArgs(
    () => parseGitHubActionsArtifactInstallSourceSpec(''),
    '--github-actions-artifact must use owner/repo:artifact, for example thymikee/RNCLI83:6635342232',
  );
  assertInvalidArgs(
    () => parseGitHubActionsArtifactInstallSourceSpec('acme/mobile:'),
    '--github-actions-artifact must use owner/repo:artifact, for example thymikee/RNCLI83:6635342232',
  );
  assertInvalidArgs(
    () =>
      parseInstallSourceConfig(
        { type: 'github-actions-artifact', repo: 'acme/mobile', artifact: ' ' },
        'config',
      ),
    'config installSource.artifact must be a non-empty string.',
  );
  assertInvalidArgs(
    () => parseInstallSourceConfig({ type: 'github-actions-artifact', repo: 'acme' }, 'config'),
    'config installSource.repo must use owner/repo.',
  );
});

function assertInvalidArgs(run: () => unknown, message: string): void {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, 'INVALID_ARGS');
    assert.equal(error.message, message);
    assert.equal(error.cause, undefined);
    return true;
  });
}

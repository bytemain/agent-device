import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'vitest';
import {
  DEFAULT_EVIDENCE_DIR,
  EVIDENCE_FIXTURE_PATH,
  PUBLISHED_EVIDENCE,
  fetchEvidenceCommand,
  listEvidenceFiles,
  readEvidenceDir,
  readEvidenceFile,
  renderEvidenceReport,
} from './evidence.ts';

const temporaryDirs: string[] = [];

afterEach(() => {
  for (const dir of temporaryDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function temporaryEvidenceDir(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ios-snapshot-evidence-'));
  temporaryDirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

test('the derived fixture is a schema-valid raw result from the published revision', () => {
  const entry = readEvidenceFile(EVIDENCE_FIXTURE_PATH);
  assert.deepEqual(entry.errors, []);
  assert.equal(entry.revision, '71fb2483f30d90e615e949601c836aeebbf450c5');
  assert.equal(entry.status, 'completed');
  assert.equal(entry.cells, 2);
  assert.equal(entry.published, 'unlisted');
});

test('reads every JSON file in an evidence directory and reports schema drift per file', () => {
  const fixture = fs.readFileSync(EVIDENCE_FIXTURE_PATH, 'utf8');
  const drifted = JSON.stringify({ ...JSON.parse(fixture), unexpected: true });
  const dir = temporaryEvidenceDir({
    'b-drifted.json': drifted,
    'a-valid.json': fixture,
    'notes.md': 'ignored',
    'broken.json': '{',
  });
  const entries = readEvidenceDir(dir);
  assert.deepEqual(
    entries.map((entry) => [entry.file, entry.errors.length === 0]),
    [
      ['a-valid.json', true],
      ['b-drifted.json', false],
      ['broken.json', false],
    ],
  );
  assert.match(entries[1]!.errors.join('\n'), /unknown property/);
  assert.match(entries[2]!.errors.join('\n'), /not JSON/);
  assert.match(renderEvidenceReport(dir, entries), /b-drifted\.json: INVALID/);
});

test('a published file name is checked against its recorded sha256', () => {
  const [file, sha256] = Object.entries(PUBLISHED_EVIDENCE)[0]!;
  const dir = temporaryEvidenceDir({ [file]: fs.readFileSync(EVIDENCE_FIXTURE_PATH, 'utf8') });
  const [entry] = readEvidenceDir(dir);
  assert.equal(entry!.published, 'mismatch');
  assert.notEqual(entry!.sha256, sha256);
});

test('the evidence README cites every published hash and the fetch recipe', () => {
  const readme = fs.readFileSync(path.join(DEFAULT_EVIDENCE_DIR, 'README.md'), 'utf8');
  for (const [file, sha256] of Object.entries(PUBLISHED_EVIDENCE)) {
    assert.ok(readme.includes(file), `README does not list ${file}`);
    assert.ok(readme.includes(sha256), `README does not cite the sha256 of ${file}`);
  }
  assert.ok(readme.includes(fetchEvidenceCommand()));
});

test('fetched evidence under the in-tree directory matches the published corpus', (context) => {
  const files = listEvidenceFiles(DEFAULT_EVIDENCE_DIR);
  if (files.length === 0) {
    context.skip(`${DEFAULT_EVIDENCE_DIR} holds no evidence; run ${fetchEvidenceCommand()}`);
  }
  for (const entry of readEvidenceDir(DEFAULT_EVIDENCE_DIR)) {
    assert.deepEqual(entry.errors, [], `${entry.file} does not match the raw result schema`);
    assert.notEqual(entry.published, 'mismatch', `${entry.file} differs from the published hash`);
  }
});

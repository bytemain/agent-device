import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRawResult } from './schema.ts';
import type { BenchmarkResult } from './types.ts';

const EVIDENCE_BRANCH = 'evidence/ios-snapshot';
export const DEFAULT_EVIDENCE_DIR = path.join(import.meta.dirname, 'evidence');
export const EVIDENCE_FIXTURE_PATH = path.join(import.meta.dirname, 'evidence-fixture.v1.json');

/** Raw results published on the evidence branch, keyed by file name; measured at 71fb2483f. */
export const PUBLISHED_EVIDENCE: Readonly<Record<string, string>> = {
  'ios-snapshot-cold-local-71fb2483f.json':
    '532a83247bfbf8ee47039f80ac429f067c84679e92c781768c1044da1ae6e9bf',
  'ios-snapshot-warm-relaunch-local-71fb2483f.json':
    '6d299e8baec69662dca2c1ad8f1348e4361d5afaa781080e9a6b9b3dac362cbf',
  'ios-snapshot-proxy-71fb2483f.json':
    'b11b7a07be9e4dcf003f3af66943682a6733c6f21f5f43d3d9e88b3fb37b51a7',
};

export type EvidenceFile = {
  file: string;
  sha256: string;
  published: 'match' | 'mismatch' | 'unlisted';
  revision: string | null;
  status: BenchmarkResult['status'] | null;
  cells: number;
  errors: string[];
};

export function fetchEvidenceCommand(file = '<file>'): string {
  const destination = path.posix.join('scripts/ios-snapshot-benchmark/evidence', file);
  return `git fetch origin ${EVIDENCE_BRANCH} && git show FETCH_HEAD:${file} > ${destination}`;
}

export function listEvidenceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort();
}

export function readEvidenceFile(filePath: string): EvidenceFile {
  const file = path.basename(filePath);
  const bytes = fs.readFileSync(filePath);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const parsed = parseJson(bytes.toString('utf8'));
  const errors = parsed.ok ? validateRawResult(parsed.value) : [parsed.error];
  const result = parsed.ok && errors.length === 0 ? (parsed.value as BenchmarkResult) : null;
  return {
    file,
    sha256,
    published: publishedState(file, sha256),
    revision: result?.revision.commit ?? null,
    status: result?.status ?? null,
    cells: result?.measurements.length ?? 0,
    errors,
  };
}

export function readEvidenceDir(dir: string): EvidenceFile[] {
  return listEvidenceFiles(dir).map((file) => readEvidenceFile(path.join(dir, file)));
}

export function renderEvidenceReport(dir: string, files: EvidenceFile[]): string {
  const lines = [`Evidence directory: ${dir}`];
  for (const entry of files) {
    lines.push(
      `- ${entry.file}: ${entry.errors.length === 0 ? 'valid' : 'INVALID'}; ` +
        `revision ${entry.revision ?? '–'}; status ${entry.status ?? '–'}; ` +
        `${entry.cells} cells; sha256 ${entry.sha256} (${entry.published})`,
      ...entry.errors.map((error) => `    ${error}`),
    );
  }
  return `${lines.join('\n')}\n`;
}

function publishedState(file: string, sha256: string): EvidenceFile['published'] {
  const expected = PUBLISHED_EVIDENCE[file];
  if (expected === undefined) return 'unlisted';
  return expected === sha256 ? 'match' : 'mismatch';
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (error) {
    return { ok: false, error: `not JSON: ${error instanceof Error ? error.message : error}` };
  }
}

function readEvidenceDirOption(argv: string[]): string {
  const normalized = argv[0] === '--' ? argv.slice(1) : argv;
  if (normalized.length === 0) return DEFAULT_EVIDENCE_DIR;
  if (normalized[0] === '--evidence-dir' && normalized[1] && normalized.length === 2) {
    return path.resolve(normalized[1]);
  }
  throw new Error('Usage: pnpm bench:ios-snapshot:evidence -- [--evidence-dir <dir>]');
}

function runEvidenceReport(argv: string[]): void {
  const dir = readEvidenceDirOption(argv);
  const files = readEvidenceDir(dir);
  if (files.length === 0) {
    throw new Error(`${dir} holds no evidence; fetch it with: ${fetchEvidenceCommand()}`);
  }
  process.stdout.write(renderEvidenceReport(dir, files));
  const rejected = files.filter(
    (entry) => entry.errors.length > 0 || entry.published === 'mismatch',
  );
  if (rejected.length > 0) {
    throw new Error(`${rejected.length} evidence file(s) failed validation.`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    runEvidenceReport(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

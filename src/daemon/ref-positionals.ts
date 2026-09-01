import { REF_GRAMMAR_HINT, splitRefGenerationSuffix } from '@agent-device/kernel/snapshot';
import type { DaemonResponse } from './types.ts';
import { errorResponse } from './response.ts';

export type ParsedVersionedRef =
  | { ok: true; ref: string; generation?: number }
  | { ok: false; response: DaemonResponse };

export function parseVersionedRefPositional(refInput: string): ParsedVersionedRef {
  const split = splitRefGenerationSuffix(refInput);
  if (!split) {
    return {
      ok: false,
      response: errorResponse(
        'INVALID_ARGS',
        `Invalid ref "${refInput}" — malformed generation suffix.`,
        { hint: REF_GRAMMAR_HINT },
      ),
    };
  }
  return { ok: true, ref: split.base, generation: split.generation };
}

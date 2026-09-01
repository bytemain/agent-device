import { expect, test } from 'vitest';
import { refSnapshotFlagGuardResponse } from '../ref-snapshot-flags.ts';

test('refSnapshotFlagGuardResponse returns unsupported snapshot flags for @ref flows', () => {
  const response = refSnapshotFlagGuardResponse('press', {
    snapshotDepth: 2,
    snapshotScope: 'Login',
    snapshotRaw: true,
  });
  expect(response).toEqual({
    ok: false,
    error: {
      code: 'INVALID_ARGS',
      message: 'press @ref does not support --depth, --scope, --raw.',
    },
  });
});

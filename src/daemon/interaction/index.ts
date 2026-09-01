import type { Rect } from '@agent-device/kernel/snapshot';
import { buildRuntimeCaptureInput } from '../snapshot-runtime-capture-input.ts';
import { setSessionSnapshot } from '../session-snapshot.ts';
import { captureSnapshot as captureSnapshotThroughHandler } from '../handlers/snapshot-capture.ts';
import type { BoundGestureExecutor } from '../gesture-runtime.ts';
import type { BoundTouchExecutor } from '../touch-runtime.ts';
import { captureInteractionSnapshot } from './internal/interaction-snapshot.ts';
import {
  createInteractionRuntime as createInternalInteractionRuntime,
  finalizeTouchInteraction,
} from './internal/interaction-route-support.ts';
import type {
  CaptureSnapshotForSession,
  FindRouteInput,
  InteractionRouteInput,
} from './internal/types.ts';

export type {
  CaptureSnapshotForSession,
  ContextFromFlags,
  FindRouteInput,
  InteractionRouteInput,
  RefSnapshotFlagGuardResponse,
} from './internal/types.ts';

export { readTextForNode } from '../interaction-read.ts';
export { assertRecordedFillParameterization } from './internal/interaction-recorded-input.ts';
export { publishInteractionAmbiguityCandidates } from './internal/interaction-ambiguity-publication.ts';
export {
  assertRefMutationAdmitted,
  refMutationAdmissionResponse,
} from './internal/interaction-ref-policy.ts';
import { readSettleRequest, settleFlagGuardResponse } from './internal/interaction-flags.ts';
import { refSnapshotFlagGuardResponse } from '../ref-snapshot-flags.ts';

export { readSettleRequest, refSnapshotFlagGuardResponse, settleFlagGuardResponse };

export { finalizeTouchInteraction };

export const captureSnapshotForSession: CaptureSnapshotForSession = async (
  session,
  flags,
  sessionStore,
  contextFromFlags,
  options,
) => {
  return await captureInteractionSnapshot({
    session,
    flags,
    contextFromFlags,
    options,
    capture: async ({ flags: effectiveFlags, options: captureOptions, context }) => {
      const { snapshot } = await captureSnapshotThroughHandler({
        device: session.device,
        session,
        flags: effectiveFlags,
        outPath: effectiveFlags.out,
        logPath: context.logPath ?? '',
        includeRects: captureOptions.includeRects,
        androidFreshnessMode: captureOptions.androidFreshnessMode,
        signal: captureOptions.signal,
        ...(captureOptions.boundCapture
          ? {
              captureData: async () =>
                await captureOptions.boundCapture!(
                  buildRuntimeCaptureInput({
                    flags: effectiveFlags,
                    session,
                    snapshotScope: effectiveFlags.snapshotScope,
                    includeRects: captureOptions.includeRects,
                    signal: captureOptions.signal,
                    context,
                  }),
                ),
            }
          : {}),
      });
      return snapshot;
    },
    publishSnapshot: (snapshot) => {
      setSessionSnapshot(session, snapshot);
      sessionStore.set(session.name, session);
    },
  });
};

export function createInteractionRuntime(
  params: InteractionRouteInput & {
    pairedGestureViewport?: Rect;
    touchExecutor?: BoundTouchExecutor;
    gestures?: BoundGestureExecutor;
  },
) {
  return createInternalInteractionRuntime({
    ...params,
    captureSnapshotForSession: params.captureSnapshotForSession ?? captureSnapshotForSession,
  });
}

export async function handleInteractionCommands(
  params: InteractionRouteInput,
): Promise<import('../types.ts').DaemonResponse | null> {
  const { handleInteractionCommands: handle } = await import('./internal/interaction.ts');
  return await handle({
    ...params,
    captureSnapshotForSession: params.captureSnapshotForSession ?? captureSnapshotForSession,
  });
}

export async function handleFindCommands(
  params: FindRouteInput,
): Promise<import('../types.ts').DaemonResponse | null> {
  const { handleFindCommands: handle } = await import('./internal/find.ts');
  return await handle(params);
}

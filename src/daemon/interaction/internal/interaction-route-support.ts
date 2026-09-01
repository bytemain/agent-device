import { AppError as KernelAppError } from '@agent-device/kernel/errors';
import type { Rect } from '@agent-device/kernel/snapshot';
import { buildAppleRunnerRequestOptions } from '../../apple-runner-options.ts';
import { markDeferredInteractionOutcome } from '../../deferred-interaction-outcome.ts';
import { isLocalIosRunnerSession } from '../../direct-ios-selector.ts';
import { expireRefFrame } from '../../ref-frame.ts';
import { recordTouchVisualizationEvent } from '../../recording-gestures.ts';
import { createDaemonRuntimeSessionStore } from '../../runtime-session.ts';
import { isSessionRecording } from '../../session-script-publication-capability.ts';
import { setSessionSnapshot } from '../../session-snapshot.ts';
import { confirmIosOffscreenTargetVisible } from '../../offscreen-target-probe.ts';
import { NO_ACTIVE_SESSION_MESSAGE } from '../../response.ts';
import type { BoundGestureExecutor } from '../../gesture-runtime.ts';
import type { BoundTouchExecutor } from '../../touch-runtime.ts';
import { finalizeTouchInteraction as finalizeInteraction } from './interaction-common.ts';
import { createInteractionRuntime as createInternalInteractionRuntime } from './interaction-runtime.ts';
import type { InteractionRouteExecutionInput, InteractionFinalizationOperations } from './types.ts';
import type { DaemonResponse, SessionState } from '../../types.ts';
import type { SessionStore } from '../../session-store.ts';

export function createInteractionRuntime(
  params: InteractionRouteExecutionInput & {
    pairedGestureViewport?: Rect;
    touchExecutor?: BoundTouchExecutor;
    gestures?: BoundGestureExecutor;
  },
) {
  const session = params.sessionStore.get(params.sessionName);
  if (!session) throw new KernelAppError('SESSION_NOT_FOUND', NO_ACTIVE_SESSION_MESSAGE);
  return createInternalInteractionRuntime({
    requestId: params.req.meta?.requestId,
    flags: params.req.flags,
    session,
    contextFromFlags: params.contextFromFlags,
    captureSnapshot: async (flags, options) =>
      await params.captureSnapshotForSession(
        session,
        flags,
        params.sessionStore,
        params.contextFromFlags,
        options,
      ),
    runtimeSessions: createDaemonRuntimeSessionStore({
      sessionName: params.sessionName,
      getSession: () => session,
      recordOptions: {
        includeSnapshot: true,
        omitRefFrameSnapshot: params.req.internal?.findResolvedTarget !== undefined,
      },
      setRecord: (record) => {
        if (!record.snapshot) return;
        setSessionSnapshot(session, record.snapshot);
        params.sessionStore.set(params.sessionName, session);
      },
    }),
    expireRefFrame: () => expireRefFrame(session),
    confirmOffscreenTargetVisible: isLocalIosRunnerSession(session, {
      skipPendingPostGestureStabilization: false,
    })
      ? async (node, rootViewport) =>
          await confirmIosOffscreenTargetVisible({
            session,
            node,
            rootViewport,
            requestOptions: buildAppleRunnerRequestOptions({
              req: params.req,
              logPath: params.logPath,
              traceLogPath: session.trace?.outPath,
            }),
          })
      : undefined,
    pairedGestureViewport: params.pairedGestureViewport,
    touchExecutor: params.touchExecutor,
    gestures: params.gestures,
  });
}

type FinalizeTouchInteractionInput = Omit<
  Parameters<typeof finalizeInteraction>[0],
  'operations'
> & {
  session: SessionState;
  sessionStore: SessionStore;
};

export function finalizeTouchInteraction(params: FinalizeTouchInteractionInput): DaemonResponse {
  const { session, sessionStore, ...finalization } = params;
  return finalizeInteraction({
    ...finalization,
    operations: {
      recordAction: sessionStore.recordAction.bind(sessionStore, session),
      markDeferredOutcome: (mark) => markDeferredInteractionOutcome({ session, ...mark }),
      isSessionRecording: isSessionRecording.bind(null, session),
      recordGestureVisualization: recordTouchVisualizationEvent.bind(null, session),
    } satisfies InteractionFinalizationOperations,
  });
}

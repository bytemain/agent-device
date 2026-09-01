import type { CommandFlags } from '@agent-device/contracts/command';
import type { AndroidObservationAdapter } from '@agent-device/contracts/android-observation';
import type { Rect, SnapshotPreferredBackend, SnapshotState } from '@agent-device/kernel/snapshot';
import type { DeviceInfo } from '@agent-device/kernel/device';
import type { CommandSessionStore } from '../../../runtime-contract.ts';
import type {
  BindDeviceRuntime,
  InspectDeviceRuntimeFacts,
} from '../../request-runtime-binding.ts';
import type { DeferredInteractionOutcomeMark } from '../../deferred-interaction-outcome.ts';
import type { DaemonInvokeFn, DaemonRequest, SessionState } from '../../types.ts';
import type { RecordActionEntry } from '../../session-action-recorder.ts';
import type { DaemonCommandContext } from '../../context.ts';
import type { SessionStore } from '../../session-store.ts';
import type { BoundGestureExecutor } from '../../gesture-runtime.ts';
import type { BoundTouchExecutor } from '../../touch-runtime.ts';
import type { BoundSnapshotCapture } from '../../snapshot-runtime-binding.ts';
import type { recordTouchVisualizationEvent } from '../../recording-gestures.ts';

export type ContextFromFlags = (
  flags: CommandFlags | undefined,
  appBundleId?: string,
  traceLogPath?: string,
) => DaemonCommandContext;

export type CaptureSnapshotForSession = (
  session: SessionState,
  flags: CommandFlags | undefined,
  sessionStore: SessionStore,
  contextFromFlags: ContextFromFlags,
  options: InteractionSnapshotOptions,
) => Promise<SnapshotState>;

export type InteractionRouteInput = {
  req: DaemonRequest;
  sessionName: string;
  logPath?: string;
  sessionStore: SessionStore;
  captureSnapshotForSession?: CaptureSnapshotForSession;
  contextFromFlags: ContextFromFlags;
  inspectFacts?: InspectDeviceRuntimeFacts;
  bindDevice?: BindDeviceRuntime;
  androidObservation?: AndroidObservationAdapter;
};

export type InteractionRouteExecutionInput = Omit<
  InteractionRouteInput,
  'captureSnapshotForSession'
> & {
  captureSnapshotForSession: CaptureSnapshotForSession;
};

export type FindRouteInput = {
  req: DaemonRequest;
  sessionName: string;
  logPath: string;
  sessionStore: SessionStore;
  invoke: DaemonInvokeFn;
  inspectFacts?: InspectDeviceRuntimeFacts;
  bindDevice?: BindDeviceRuntime;
};

export type RefSnapshotFlagGuardResponse =
  typeof import('../../ref-snapshot-flags.ts').refSnapshotFlagGuardResponse;

export type InteractionSessionView = Readonly<{
  device: DeviceInfo;
  appBundleId?: string;
  trace?: SessionState['trace'];
}>;

export type InteractionSnapshotOptions = {
  interactiveOnly: boolean;
  preferredBackend?: SnapshotPreferredBackend;
  androidFreshnessMode?: 'ref-refresh';
  includeRects?: boolean;
  signal?: AbortSignal;
  boundCapture?: BoundSnapshotCapture;
};

export type InteractionCaptureOperation = (
  flags: CommandFlags | undefined,
  options: InteractionSnapshotOptions,
) => Promise<SnapshotState>;

export type InteractionRuntimeInput = {
  requestId?: string;
  flags: CommandFlags | undefined;
  session: InteractionSessionView;
  contextFromFlags: ContextFromFlags;
  captureSnapshot: InteractionCaptureOperation;
  runtimeSessions: CommandSessionStore;
  expireRefFrame: () => void;
  confirmOffscreenTargetVisible?: (
    node: Pick<import('@agent-device/kernel/snapshot').SnapshotNode, 'identifier' | 'label'>,
    rootViewport: Rect | null,
  ) => Promise<Rect | null>;
  pairedGestureViewport?: Rect;
  touchExecutor?: BoundTouchExecutor;
  gestures?: BoundGestureExecutor;
};

export type InteractionGestureVisualization = (
  ...args: Parameters<typeof recordTouchVisualizationEvent> extends [SessionState, ...infer Rest]
    ? Rest
    : never
) => void;

export type InteractionFinalizationOperations = Readonly<{
  recordAction: (entry: RecordActionEntry) => void;
  markDeferredOutcome: (params: DeferredInteractionOutcomeMark) => void;
  isSessionRecording: () => boolean;
  recordGestureVisualization: InteractionGestureVisualization;
}>;

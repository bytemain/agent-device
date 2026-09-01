import { test, expect, vi, beforeEach } from 'vitest';
import { legacyDispatchCapture } from '../../../__tests__/legacy-snapshot-capture-fixture.ts';
import { WEB_DESKTOP_DEVICE } from '../../../../__tests__/test-utils/device-fixtures.ts';
import {
  makeAndroidSession as makeBaseAndroidSession,
  makeIosSession,
} from '../../../../__tests__/test-utils/session-factories.ts';
import { makeSessionStore } from '../../../../__tests__/test-utils/store-factory.ts';
import { handleInteractionCommands } from '../../index.ts';
import { buildSnapshotState } from '../../../../core/snapshot-state.ts';
import {
  contextFromFlags,
  makeSession,
  makeVisibleButtonSnapshot,
} from './interaction-touch-fixtures.ts';

// Non-touch interaction routing: the `get` and `is` reads the public handler
// owns. Touch commands live in the interaction-touch* test files.

const { mockRunAppleRunnerCommand } = vi.hoisted(() => ({
  mockRunAppleRunnerCommand: vi.fn(),
}));

vi.mock('../../../handlers/snapshot-interactor-capture.ts', async () => {
  const fixture = await import('../../../__tests__/legacy-snapshot-capture-fixture.ts');
  return { captureSnapshotWithInteractor: fixture.captureSnapshotThroughLegacyDispatchFixture };
});

vi.mock('@agent-device/platform-android/mechanics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agent-device/platform-android/mechanics')>();
  return {
    ...actual,
    getAndroidAppState: vi.fn(async () => ({})),
    getAndroidBlockingDialogObservation: vi.fn(async () => ({ status: 'clear' }) as const),
  };
});

vi.mock('@agent-device/platform-apple/runner/operations', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@agent-device/platform-apple/runner/operations')>();
  return {
    ...actual,
    runAppleRunnerCommand: mockRunAppleRunnerCommand,
  };
});

import {
  getRuntimeBindings,
  resetGetRuntimeFixture,
} from '../../../__tests__/interaction-get-runtime-fixture.ts';
import {
  getAndroidAppState,
  getAndroidBlockingDialogObservation,
} from '@agent-device/platform-android/mechanics';
const mockGetAndroidAppState = vi.mocked(getAndroidAppState);
const mockGetAndroidBlockingDialogObservation = vi.mocked(getAndroidBlockingDialogObservation);
beforeEach(() => {
  legacyDispatchCapture.mockReset();
  legacyDispatchCapture.mockResolvedValue({});
  mockGetAndroidAppState.mockReset();
  mockGetAndroidAppState.mockResolvedValue({});
  mockGetAndroidBlockingDialogObservation.mockReset();
  mockGetAndroidBlockingDialogObservation.mockResolvedValue({ status: 'clear' });
  mockRunAppleRunnerCommand.mockReset();
  mockRunAppleRunnerCommand.mockResolvedValue({});
  resetGetRuntimeFixture();
});

test('is visible preserves CLI snapshot flags during runtime snapshot capture', async () => {
  const sessionStore = makeSessionStore();
  const sessionName = 'snapshot-flags';
  sessionStore.set(sessionName, makeSession(sessionName));

  legacyDispatchCapture.mockImplementation(async (_device, command) => {
    if (command !== 'snapshot') throw new Error(`unexpected command: ${command}`);
    return {
      nodes: [
        {
          index: 0,
          depth: 0,
          type: 'XCUIElementTypeWindow',
          label: 'Login',
          rect: { x: 0, y: 0, width: 390, height: 844 },
        },
        {
          index: 1,
          depth: 1,
          parentIndex: 0,
          type: 'XCUIElementTypeButton',
          label: 'Continue',
          identifier: 'auth_continue',
          rect: { x: 10, y: 20, width: 100, height: 40 },
          enabled: true,
          hittable: true,
          visible: true,
        },
      ],
      backend: 'xctest',
    };
  });

  const response = await handleInteractionCommands({
    req: {
      token: 't',
      session: sessionName,
      command: 'is',
      positionals: ['visible', 'id=auth_continue'],
      flags: { snapshotDepth: 2, snapshotScope: 'Login', snapshotRaw: true },
    },
    sessionName,
    sessionStore,
    contextFromFlags,
    ...getRuntimeBindings(),
  });

  expect(response?.ok).toBe(true);
  expect(legacyDispatchCapture.mock.calls[0]?.[4]).toMatchObject({
    snapshotDepth: 2,
    snapshotScope: 'Login',
    snapshotRaw: true,
    snapshotInteractiveOnly: false,
    snapshotIncludeRects: true,
  });
});

test('is visible reuses fresh cached iOS snapshots with rects', async () => {
  const sessionStore = makeSessionStore();
  const sessionName = 'ios-visible-cached';
  const session = makeSession(sessionName);
  session.snapshot = makeVisibleButtonSnapshot('Cached action', 'xctest');
  sessionStore.set(sessionName, session);
  legacyDispatchCapture.mockRejectedValue(new Error('unexpected fresh snapshot'));

  const response = await handleInteractionCommands({
    req: {
      token: 't',
      session: sessionName,
      command: 'is',
      positionals: ['visible', 'label="Cached action"'],
      flags: {},
    },
    sessionName,
    sessionStore,
    contextFromFlags,
    ...getRuntimeBindings(),
  });

  expect(response?.ok).toBe(true);
  expect(legacyDispatchCapture).not.toHaveBeenCalled();
});

test('is visible recaptures web snapshots when cached nodes may lack rects', async () => {
  const sessionStore = makeSessionStore();
  const sessionName = 'web-visible-refreshes-rects';
  const session = makeSession(sessionName);
  session.device = WEB_DESKTOP_DEVICE;
  session.snapshot = buildSnapshotState(
    {
      nodes: [{ index: 0, type: 'button', label: 'Submit order' }],
      backend: 'web',
    },
    { snapshotInteractiveOnly: false },
  );
  sessionStore.set(sessionName, session);
  legacyDispatchCapture.mockResolvedValue(makeVisibleButtonSnapshot('Submit order', 'web'));

  const response = await handleInteractionCommands({
    req: {
      token: 't',
      session: sessionName,
      command: 'is',
      positionals: ['visible', 'label="Submit order"'],
      flags: {},
    },
    sessionName,
    sessionStore,
    contextFromFlags,
    ...getRuntimeBindings(),
  });

  expect(response?.ok).toBe(true);
  expect(legacyDispatchCapture.mock.calls[0]?.[4]).toMatchObject({
    snapshotIncludeRects: true,
  });
});

// PIN CHANGED TWICE (#1739, R37). #557 asserted `ok: true` with `pass: false` and zero snapshots
// here, from the direct-iOS shortcut. That broke `is`'s documented contract — it "exits non-zero
// on failure" (website/docs/docs/commands.md) — and on device printed `Passed: is text` with exit
// 0 for a failed assertion. The reversal made the shortcut answer only when the predicate held;
// the shortcut is now retired outright, so the bound capture answers every predicate and this is
// simply what `is` does. The assertion below is unchanged across both edits because it was always
// about the OUTCOME, not about which path produced it.
test('a failing is predicate is COMMAND_FAILED, never a zero-exit pass', async () => {
  const sessionStore = makeSessionStore();
  const sessionName = 'is-selected-ios-direct-selector-false';
  sessionStore.set(sessionName, makeIosSession(sessionName, { appBundleId: 'com.example.app' }));
  mockRunAppleRunnerCommand.mockResolvedValue({
    found: true,
    nodes: [
      {
        index: 0,
        depth: 0,
        type: 'Button',
        label: 'Submit',
        identifier: 'submit',
        selected: false,
        rect: { x: 126, y: 555, width: 75, height: 38 },
      },
    ],
  });

  const response = await handleInteractionCommands({
    req: {
      token: 't',
      session: sessionName,
      command: 'is',
      positionals: ['selected', 'id="submit"'],
      flags: {},
    },
    sessionName,
    sessionStore,
    contextFromFlags,
    ...getRuntimeBindings(),
  });

  // The session snapshot has no `id=submit`, so the bound capture reports the typed selector
  // failure. Nothing can report a failed assertion as a completed command.
  expect(response?.ok).toBe(false);
  expect(legacyDispatchCapture.mock.calls.filter((call) => call[1] === 'snapshot')).toHaveLength(1);
  if (response?.ok === false) {
    expect(response.error?.code).toBe('COMMAND_FAILED');
  }
});

test('is visible passes for list text that inherits viewport visibility from an ancestor', async () => {
  const sessionStore = makeSessionStore();
  const sessionName = 'visible-list-item';
  sessionStore.set(sessionName, makeSession(sessionName));

  legacyDispatchCapture.mockImplementation(async (_device, command) => {
    if (command !== 'snapshot') throw new Error(`unexpected command: ${command}`);
    return {
      nodes: [
        { index: 0, type: 'Application', rect: { x: 0, y: 0, width: 390, height: 844 } },
        {
          index: 1,
          parentIndex: 0,
          type: 'XCUIElementTypeCell',
          rect: { x: 0, y: 160, width: 390, height: 44 },
          hittable: false,
        },
        {
          index: 2,
          parentIndex: 1,
          type: 'XCUIElementTypeStaticText',
          label: 'Trip ideas',
          hittable: false,
        },
      ],
      backend: 'xctest',
    };
  });

  const response = await handleInteractionCommands({
    req: {
      token: 't',
      session: sessionName,
      command: 'is',
      positionals: ['visible', 'label="Trip ideas"'],
      flags: {},
    },
    sessionName,
    sessionStore,
    contextFromFlags,
    ...getRuntimeBindings(),
  });

  expect(response).toBeTruthy();
  expect(response?.ok).toBe(true);
  if (response?.ok) {
    expect(response.data?.predicate).toBe('visible');
    expect(response.data?.pass).toBe(true);
    expect(response.data?.selector).toBe('label="Trip ideas"');
  }
});

test('is visible fails for nodes outside the current viewport', async () => {
  const sessionStore = makeSessionStore();
  const sessionName = 'visible-offscreen';
  sessionStore.set(sessionName, makeSession(sessionName));

  legacyDispatchCapture.mockImplementation(async (_device, command) => {
    if (command !== 'snapshot') throw new Error(`unexpected command: ${command}`);
    return {
      nodes: [
        { index: 0, type: 'Application', rect: { x: 0, y: 0, width: 390, height: 844 } },
        {
          index: 1,
          parentIndex: 0,
          type: 'XCUIElementTypeStaticText',
          label: 'Far item',
          rect: { x: 20, y: 2600, width: 120, height: 40 },
          hittable: false,
        },
      ],
      backend: 'xctest',
    };
  });

  const response = await handleInteractionCommands({
    req: {
      token: 't',
      session: sessionName,
      command: 'is',
      positionals: ['visible', 'label="Far item"'],
      flags: {},
    },
    sessionName,
    sessionStore,
    contextFromFlags,
    ...getRuntimeBindings(),
  });

  expect(response).toBeTruthy();
  expect(response?.ok).toBe(false);
  if (response && !response.ok) {
    expect(response.error.code).toBe('COMMAND_FAILED');
    expect(response.error.message).toMatch(/actual=\{"visible":false/);
  }
});

test('is reports Android permission dialog blocker when app content assertion fails', async () => {
  const sessionStore = makeSessionStore();
  const sessionName = 'android-permission-blocked';
  sessionStore.set(
    sessionName,
    makeBaseAndroidSession(sessionName, { appBundleId: 'com.example.demo' }),
  );

  legacyDispatchCapture.mockImplementation(async (_device, command) => {
    if (command !== 'snapshot') throw new Error(`unexpected command: ${command}`);
    return { nodes: [], backend: 'uiautomator' };
  });
  mockGetAndroidAppState.mockResolvedValue({
    package: 'com.google.android.permissioncontroller',
    activity: 'com.android.permissioncontroller.permission.ui.GrantPermissionsActivity',
  });

  const response = await handleInteractionCommands({
    req: {
      token: 't',
      session: sessionName,
      command: 'is',
      positionals: ['visible', 'label="Metro Ready"'],
      flags: {},
    },
    sessionName,
    sessionStore,
    contextFromFlags,
    ...getRuntimeBindings(),
  });

  expect(response).toBeTruthy();
  expect(response?.ok).toBe(false);
  if (response && !response.ok) {
    expect(response.error.message).toMatch(/permission dialog is blocking/);
    expect(response.error.details).toMatchObject({
      blockedBy: 'android_foreground_surface',
      expectedPackage: 'com.example.demo',
      foregroundPackage: 'com.google.android.permissioncontroller',
    });
  }
});

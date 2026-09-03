import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import type { DeviceInfo } from '@agent-device/kernel/device';
import { button, node, text } from './alert-fixtures.ts';

const runAndroidAdb = vi.fn(async (_device: DeviceInfo, _args: string[]) => ({
  exitCode: 0,
  stdout: '',
  stderr: '',
}));
vi.mock('../adb.ts', () => ({ runAndroidAdb }));

const { handleAndroidAlert } = await import('../alert.ts');

const device: DeviceInfo = {
  platform: 'android',
  id: 'emulator-5554',
  name: 'Pixel',
  kind: 'emulator',
  booted: true,
};

test('dismissing a button alert records the tapped button and its coordinates', async () => {
  runAndroidAdb.mockClear();
  const result = await handleAndroidAlert(device, 'dismiss', {
    captureNodes: async () => [
      node(0, 'android.app.AlertDialog'),
      text(1, 'Automation confirmation', 'android:id/alertTitle'),
      button(2, 'Cancel', 'android:id/button2', { x: 210, y: 612 }),
    ],
  });

  assert.deepEqual(result, {
    kind: 'alertHandled',
    platform: 'android',
    action: 'dismiss',
    handled: true,
    alert: {
      title: 'Automation confirmation',
      buttons: ['Cancel'],
      platform: 'android',
      source: 'native-dialog',
      packageName: 'com.example.app',
    },
    button: 'Cancel',
    coordinates: { x: 274, y: 638 },
    message: 'Alert dismissed',
  });
  assert.deepEqual(runAndroidAdb.mock.calls[0]?.[1], ['shell', 'input', 'tap', '274', '638']);
});

test('accepting a button alert records the tapped button and its coordinates', async () => {
  runAndroidAdb.mockClear();
  const result = await handleAndroidAlert(device, 'accept', {
    captureNodes: async () => [
      node(0, 'android.app.AlertDialog'),
      text(1, 'Automation confirmation', 'android:id/alertTitle'),
      button(2, 'OK', 'android:id/button1', { x: 52, y: 612 }),
    ],
  });

  assert.equal(result.kind, 'alertHandled');
  assert.deepEqual('coordinates' in result ? result.coordinates : undefined, { x: 116, y: 638 });
});

test('a fallback Back dismissal (no matching button) carries no coordinates', async () => {
  runAndroidAdb.mockClear();
  const result = await handleAndroidAlert(device, 'dismiss', {
    captureNodes: async () => [
      node(0, 'android.app.AlertDialog'),
      text(1, 'Automation confirmation', 'android:id/alertTitle'),
    ],
  });

  assert.equal(result.kind, 'alertHandled');
  assert.ok(result.kind === 'alertHandled' && !('coordinates' in result));
  assert.equal(result.kind === 'alertHandled' ? result.button : undefined, 'Back');
  assert.deepEqual(runAndroidAdb.mock.calls[0]?.[1], ['shell', 'input', 'keyevent', '4']);
});

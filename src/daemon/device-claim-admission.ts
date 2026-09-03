import type { DeviceInfo } from '@agent-device/kernel/device';
import type {
  DeviceBindingIntent,
  RuntimeOwnerRef,
} from '@agent-device/contracts/platform-runtime';
import type { DeviceClaimPolicy } from '../core/command-descriptor/types.ts';
import { emitDiagnostic } from '@agent-device/host-kit/diagnostics';
import {
  inspectAllocatorHeldDeviceClaim,
  requireAllocatorHeldDeviceClaim,
} from './device-claim-allocator.ts';
import { allocatorHeldAdmissionError, deviceClaimConflictError } from './device-claim-conflict.ts';
import { deviceClaimRuleForOwner } from './device-claim-rule.ts';
import {
  acquireTransientDeviceClaim,
  clearDeviceClaim,
  type DeviceClaimReconciler,
  type DeviceClaimSessionOwnership,
} from './device-claims.ts';

/**
 * The #1320 claim gate a request passes on its way from a device binding to
 * device operations. The device-claim rule of the admitted owner decides what
 * happens here, under every policy: an ordinary owner takes a transient claim
 * only when the executing command's declared {@link DeviceClaimPolicy} is
 * `transient-exclusive`; a managed local owner is verified against its
 * allocator-held claim; a provider owner takes nothing. There is no other way
 * to obtain device operations, so none of it can be forgotten by a handler.
 *
 * `admit` is called once per device binding by the request runtime bindings,
 * which is where per-device deduplication already lives, with the binding
 * intent the gateway bound.
 */
export type DeviceClaimAdmission = AsyncDisposable &
  Readonly<{
    /**
     * Throws `DEVICE_IN_USE` when a foreign live claim owns the device and
     * `COMMAND_FAILED` when a managed local owner has no allocator-held claim.
     */
    admit(device: DeviceInfo, owner: RuntimeOwnerRef, intent: DeviceBindingIntent): Promise<void>;
  }>;

export function createDeviceClaimAdmission(params: {
  policy: DeviceClaimPolicy;
  command: string;
  workspace: string;
  stateDir: string;
  reconcileOrphanedDeviceClaim: DeviceClaimReconciler;
}): DeviceClaimAdmission {
  // The caller admits once per device binding, so this only has to remember what
  // it took in order to give it back.
  const acquired: DeviceClaimSessionOwnership[] = [];

  /**
   * `none` is the one policy that touches no device state at all. Every other policy reaches the
   * device, and an ordinary owner may not reach an allocator-managed identity through any of them
   * — `observe` boots it through `ensureReady` just as `transient-exclusive` does — so the
   * allocator-held inspection runs first and refuses without acquiring anything.
   *
   * Beyond that, `observe`/`require-owner` never write the claim store, and
   * `acquire-session`/`release-session` own the session claim through the open and close
   * lifecycles instead.
   */
  async function admitOrdinaryOwner(device: DeviceInfo): Promise<void> {
    if (params.policy === 'none') return;
    const allocatorHeld = inspectAllocatorHeldDeviceClaim(device);
    if (allocatorHeld) throw deviceClaimConflictError(device, allocatorHeld);
    if (params.policy !== 'transient-exclusive') return;
    const result = await acquireTransientDeviceClaim({
      device,
      command: params.command,
      workspace: params.workspace,
      stateDir: params.stateDir,
      reconcileOrphanedDeviceClaim: params.reconcileOrphanedDeviceClaim,
    });
    if (result.status === 'conflict') throw deviceClaimConflictError(device, result.conflict);
    if (result.status === 'acquired') acquired.push(result.ownership);
  }

  return {
    admit: async (device, owner, intent) => {
      switch (deviceClaimRuleForOwner(owner)) {
        case 'none':
          return;
        case 'allocator-held': {
          const error = allocatorHeldAdmissionError(
            device,
            owner,
            requireAllocatorHeldDeviceClaim({ device, owner, stateDir: params.stateDir, intent }),
          );
          if (error) throw error;
          return;
        }
        case 'ordinary':
          return await admitOrdinaryOwner(device);
      }
    },
    [Symbol.asyncDispose]: async () => {
      for (const ownership of acquired.splice(0)) {
        try {
          await clearDeviceClaim(ownership);
        } catch (error) {
          emitDiagnostic({
            level: 'error',
            phase: 'transient_device_claim_release_failed',
            data: {
              command: params.command,
              deviceKey: ownership.deviceKey,
              error: error instanceof Error ? error.message : String(error),
            },
          });
        }
      }
    },
  };
}

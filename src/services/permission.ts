/**
 * macOS Screen Capture Permission Management Service
 *
 * Handles permission checking, requesting, and resetting for screen capture.
 * Uses mac-screen-capture-permissions for native macOS TCC integration.
 */

import {
  hasScreenCapturePermission as checkPermission,
  hasPromptedForPermission,
  resetPermissions,
  openSystemPreferences,
} from 'mac-screen-capture-permissions';
import { app } from 'electron';

export interface PermissionStatus {
  hasPermission: boolean;
  hasPrompted: boolean;
  needsReset: boolean;
}

/**
 * Get the actual bundle ID used by this Electron app
 * In dev mode: com.github.Electron
 * In packaged app: from package.json build.appId
 */
function getEffectiveBundleId(): string {
  // In development, Electron uses com.github.Electron
  // In production (packaged), it uses the appId from package.json
  const isPackaged = app.isPackaged;
  if (isPackaged) {
    return 'com.gpters.linear-capture';
  }
  return 'com.github.Electron';
}

/**
 * Check current screen capture permission status
 * First call will trigger the system permission dialog
 */
export function checkScreenCapturePermission(): boolean {
  return checkPermission();
}

/**
 * Check if user has been prompted for permission before
 * Only works in Electron apps
 */
export function hasBeenPrompted(): boolean {
  return hasPromptedForPermission();
}

/**
 * Get comprehensive permission status
 * Detects potential permission inconsistencies (e.g., after reinstall)
 */
export function getPermissionStatus(): PermissionStatus {
  const hasPermission = checkPermission();
  const hasPrompted = hasPromptedForPermission();

  // Detect inconsistency: prompted but no permission might indicate TCC mismatch
  const needsReset = hasPrompted && !hasPermission;

  return {
    hasPermission,
    hasPrompted,
    needsReset,
  };
}

/**
 * Reset screen capture permissions via tccutil
 * This clears the TCC database entry for this app
 * Next permission check will trigger a fresh dialog
 *
 * @param bundleId - Optional specific bundle ID to reset (defaults to current app's effective bundle ID)
 */
export async function resetScreenCapturePermission(bundleId?: string): Promise<void> {
  const effectiveBundleId = bundleId || getEffectiveBundleId();
  console.log(`Resetting screen capture permission for: ${effectiveBundleId}`);
  resetPermissions({ bundleId: effectiveBundleId });
}

/**
 * Open macOS System Preferences at Screen Recording section
 */
export async function openScreenCaptureSettings(): Promise<void> {
  await openSystemPreferences();
}

/**
 * Request permission and handle the result
 * Returns true if permission was granted, false otherwise
 */
export function requestPermission(): boolean {
  // checkPermission() triggers the dialog on first call
  return checkPermission();
}

/**
 * Full permission recovery flow for reinstall scenarios
 * 1. Reset existing (potentially stale) permissions using correct bundle ID
 * 2. Trigger fresh permission request
 * 3. Open system preferences if needed
 */
export async function recoverPermission(): Promise<boolean> {
  const bundleId = getEffectiveBundleId();
  console.log(`Starting permission recovery for: ${bundleId}`);

  // Step 1: Reset to clear any stale TCC entries
  resetPermissions({ bundleId });

  // Small delay to ensure TCC database is updated
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Step 2: Trigger fresh permission request
  const hasPermission = checkPermission();
  console.log(`After reset, hasPermission: ${hasPermission}`);

  // Step 3: If still no permission, open settings
  if (!hasPermission) {
    await openSystemPreferences();
  }

  return hasPermission;
}

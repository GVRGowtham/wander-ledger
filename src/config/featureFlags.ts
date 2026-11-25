/**
 * Feature flags for Wanderer's Ledger.
 *
 * `CLOUD_COLLAB_ENABLED`: Controls live multi-user collaborative trips
 * (Co-Travelers invite modal, Editor/Viewer roles, Personal vs. Shared expense
 * toggles, and the Shared Trips tab).
 *
 * Kept `false` for offline-first v1.0 (which uses personal Google Drive backups),
 * while preserving 100% of collaborative code, schema, and tests for v2.0.
 */
export const FEATURE_FLAGS = {
  CLOUD_COLLAB_ENABLED: false,
} as const;

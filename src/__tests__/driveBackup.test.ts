import {
  computeIncrementalMediaPlan,
  encodeDriveMediaFileName,
  evaluateBackupNetworkPolicy,
  extractPortableSnapshotAndMedia,
  formatBytes,
  formatDriveFirstName,
  fromRelativeMediaPath,
  hasLocalChangesSinceBackup,
  mergeBackupSnapshots,
  remapSnapshotMediaToDevice,
  toRelativeMediaPath,
} from '../services/driveBackupHelpers';
import { LocalBackupSnapshot } from '../services/cloudSyncMappers';
import { Expense, Memory, Stay, Trip } from '../types/models';

const ANDROID_BASE = 'file:///data/user/0/com.wanderledger.app/files/';
const IOS_BASE = 'file:///var/mobile/Containers/Data/Application/UUID-123/Documents/';

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 'trip_1',
    ownerId: 'local_wanderer',
    title: 'Autumn in Japan',
    destinationCity: 'Tokyo',
    destinationCountry: 'Japan',
    countryCode: 'JP',
    flagEmoji: '🇯🇵',
    startDate: '2026-10-01',
    endDate: '2026-10-12',
    homeCurrency: 'USD',
    budget: 3000,
    vibe: 'japan',
    isShared: false,
    coTravelers: [],
    lat: 35.6762,
    lng: 139.6503,
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-05T10:00:00Z',
    ...overrides,
  };
}

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: 'mem_1',
    tripId: 'trip_1',
    title: 'Shibuya Sunset',
    note: 'Golden hour over the crossing',
    capturedAt: '2026-10-02T17:45:00Z',
    moodSticker: '🌅 Core Memory',
    isHighlight: true,
    createdAt: '2026-10-02T18:00:00Z',
    ...overrides,
  };
}

function makeStay(overrides: Partial<Stay> = {}): Stay {
  return {
    id: 'stay_1',
    tripId: 'trip_1',
    name: 'Park Hyatt Tokyo',
    stayType: 'hotel',
    checkIn: '2026-10-01',
    checkOut: '2026-10-05',
    nights: 4,
    costCash: 1200,
    currency: 'USD',
    homeCost: 1200,
    pointsRedeemed: 0,
    createdAt: '2026-09-02T10:00:00Z',
    ...overrides,
  };
}

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'exp_1',
    tripId: 'trip_1',
    merchant: 'Ichiran Ramen',
    category: 'dining',
    localAmount: 1800,
    localCurrency: 'JPY',
    homeAmount: 12,
    homeCurrency: 'USD',
    fxRateUsed: 150,
    expenseDate: '2026-10-02',
    createdAt: '2026-10-02T13:00:00Z',
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<LocalBackupSnapshot> = {}): LocalBackupSnapshot {
  return {
    schemaVersion: 2,
    app: "Wanderer's Ledger",
    exportedAt: '2026-10-12T10:00:00Z',
    trips: [],
    flights: [],
    transports: [],
    stops: [],
    stays: [],
    expenses: [],
    memories: [],
    loyaltyAccounts: [],
    fxSnapshots: {},
    ...overrides,
  };
}

describe('Google Drive Backup & Restore Helpers', () => {
  it('converts Android and iOS sandbox URIs into portable relative paths and remaps across reinstalls', () => {
    const androidPhoto = `${ANDROID_BASE}memories/trip_1/img_100.webp`;
    const androidReceipt = `${ANDROID_BASE}receipts/trip_1/img_200.webp`;

    expect(toRelativeMediaPath(androidPhoto, ANDROID_BASE)).toBe('memories/trip_1/img_100.webp');
    expect(toRelativeMediaPath(androidReceipt, ANDROID_BASE)).toBe('receipts/trip_1/img_200.webp');
    // Still works even if baseDir changed after reinstall or platform switch
    expect(toRelativeMediaPath(androidPhoto, IOS_BASE)).toBe('memories/trip_1/img_100.webp');
    // Ignores non-local or cache URIs outside memories/ and receipts/
    expect(toRelativeMediaPath('content://media/external/images/42', ANDROID_BASE)).toBeUndefined();
    expect(toRelativeMediaPath('', ANDROID_BASE)).toBeUndefined();

    // Rebuilds cleanly on a brand-new iOS/Android sandbox path
    expect(fromRelativeMediaPath('memories/trip_1/img_100.webp', IOS_BASE)).toBe(
      `${IOS_BASE}memories/trip_1/img_100.webp`
    );
    expect(fromRelativeMediaPath('receipts/trip_1/img_200.webp', ANDROID_BASE)).toBe(
      `${ANDROID_BASE}receipts/trip_1/img_200.webp`
    );
  });

  it('extracts deduplicated portable media and only links confirmed restored files on remap', () => {
    const coverUri = `${ANDROID_BASE}memories/trip_1/img_cover.webp`;
    const photoUri = `${ANDROID_BASE}memories/trip_1/img_1.webp`;
    const thumbUri = `${ANDROID_BASE}memories/trip_1/img_1_thumb.webp`;
    const stayReceiptUri = `${ANDROID_BASE}receipts/trip_1/img_stay.webp`;
    const expReceiptUri = `${ANDROID_BASE}receipts/trip_1/img_exp.webp`;

    const snapshot = makeSnapshot({
      trips: [makeTrip({ coverPhotoUri: coverUri })],
      stays: [makeStay({ receiptUri: stayReceiptUri })],
      expenses: [makeExpense({ receiptUri: expReceiptUri })],
      memories: [
        makeMemory({ id: 'm1', photoUri, thumbUri }),
        // Duplicate reference to same cover file should be deduplicated
        makeMemory({ id: 'm2', photoUri: coverUri }),
      ],
    });

    const { portableSnapshot, localMedia } = extractPortableSnapshotAndMedia(snapshot, ANDROID_BASE);

    expect(portableSnapshot.trips[0].coverPhotoUri).toBe('memories/trip_1/img_cover.webp');
    expect(portableSnapshot.stays[0].receiptUri).toBe('receipts/trip_1/img_stay.webp');
    expect(portableSnapshot.expenses[0].receiptUri).toBe('receipts/trip_1/img_exp.webp');
    expect(portableSnapshot.memories[0].photoUri).toBe('memories/trip_1/img_1.webp');
    expect(portableSnapshot.memories[0].thumbUri).toBe('memories/trip_1/img_1_thumb.webp');
    expect(localMedia).toHaveLength(5);

    // Simulate restoring onto iOS where 4 of 5 files downloaded and img_exp.webp failed
    const downloadedSet = new Set([
      'memories/trip_1/img_cover.webp',
      'memories/trip_1/img_1.webp',
      'memories/trip_1/img_1_thumb.webp',
      'receipts/trip_1/img_stay.webp',
    ]);
    const remapped = remapSnapshotMediaToDevice(portableSnapshot, IOS_BASE, downloadedSet);
    expect(remapped.trips[0].coverPhotoUri).toBe(`${IOS_BASE}memories/trip_1/img_cover.webp`);
    expect(remapped.memories[0].photoUri).toBe(`${IOS_BASE}memories/trip_1/img_1.webp`);
    expect(remapped.stays[0].receiptUri).toBe(`${IOS_BASE}receipts/trip_1/img_stay.webp`);
    // Missing file is cleared instead of leaving a broken URI
    expect(remapped.expenses[0].receiptUri).toBeUndefined();
  });

  it('computes incremental media upload diff and prunes orphaned Drive files while sparing manifest', () => {
    const existingPhoto = encodeDriveMediaFileName('memories/trip_1/img_keep.webp');
    const newPhoto = encodeDriveMediaFileName('memories/trip_1/img_new.webp');
    const deletedPhoto = encodeDriveMediaFileName('memories/trip_1/img_deleted.webp');

    const localMedia = [
      {
        relPath: 'memories/trip_1/img_keep.webp',
        driveFileName: existingPhoto,
        kind: 'memory' as const,
        localUri: `${ANDROID_BASE}memories/trip_1/img_keep.webp`,
      },
      {
        relPath: 'memories/trip_1/img_new.webp',
        driveFileName: newPhoto,
        kind: 'memory' as const,
        localUri: `${ANDROID_BASE}memories/trip_1/img_new.webp`,
      },
    ];

    const remoteFiles = [
      { id: 'f_manifest', name: 'wanderers_ledger_manifest.json' },
      { id: 'f_keep', name: existingPhoto },
      { id: 'f_orphan', name: deletedPhoto },
    ];

    const plan = computeIncrementalMediaPlan(localMedia, remoteFiles);

    expect(plan.alreadyUploadedCount).toBe(1);
    expect(plan.toUpload.map((m) => m.driveFileName)).toEqual([newPhoto]);
    expect(plan.toDelete.map((f) => f.id)).toEqual(['f_orphan']);
  });

  it('performs non-destructive Smart Merge between local device trips and restored Drive backup', () => {
    const localSnapshot = makeSnapshot({
      trips: [
        makeTrip({
          id: 'trip_shared',
          title: 'Tokyo Updated Locally',
          updatedAt: '2026-10-15T10:00:00Z',
        }),
        makeTrip({
          id: 'trip_local_only',
          title: 'Weekend in Coorg',
          destinationCity: 'Coorg',
          destinationCountry: 'India',
          countryCode: 'IN',
        }),
      ],
      memories: [
        makeMemory({ id: 'mem_shared', title: 'Local Note', photoUri: undefined }),
        makeMemory({ id: 'mem_local', tripId: 'trip_local_only', title: 'Coffee Estate' }),
      ],
      fxSnapshots: { '2026-10-15': { USD: 1, INR: 84.1 } },
    });

    const remoteSnapshot = makeSnapshot({
      trips: [
        makeTrip({
          id: 'trip_shared',
          title: 'Tokyo Older Cloud Title',
          updatedAt: '2026-10-10T10:00:00Z',
          coverPhotoUri: `${ANDROID_BASE}memories/trip_shared/cover.webp`,
        }),
        makeTrip({
          id: 'trip_cloud_only',
          title: 'Swiss Alps 2025',
          destinationCity: 'Zurich',
          destinationCountry: 'Switzerland',
          countryCode: 'CH',
        }),
      ],
      memories: [
        makeMemory({
          id: 'mem_shared',
          title: 'Cloud Note',
          photoUri: `${ANDROID_BASE}memories/trip_shared/photo.webp`,
        }),
        makeMemory({ id: 'mem_cloud', tripId: 'trip_cloud_only', title: 'Lake Lucerne' }),
      ],
      fxSnapshots: { '2025-11-01': { USD: 1, CHF: 0.88 } },
    });

    const merged = mergeBackupSnapshots(localSnapshot, remoteSnapshot);

    // Zero trips lost: shared + local-only + cloud-only = 3 trips!
    expect(merged.trips.map((t) => t.id).sort()).toEqual([
      'trip_cloud_only',
      'trip_local_only',
      'trip_shared',
    ]);
    // Newer local title wins LWW, while missing coverPhotoUri is recovered from remote
    const sharedTrip = merged.trips.find((t) => t.id === 'trip_shared');
    expect(sharedTrip?.title).toBe('Tokyo Updated Locally');
    expect(sharedTrip?.coverPhotoUri).toBe(`${ANDROID_BASE}memories/trip_shared/cover.webp`);

    // Memories merged cleanly, and missing local photoUri hydrated from remote
    expect(merged.memories).toHaveLength(3);
    const sharedMem = merged.memories.find((m) => m.id === 'mem_shared');
    expect(sharedMem?.title).toBe('Local Note');
    expect(sharedMem?.photoUri).toBe(`${ANDROID_BASE}memories/trip_shared/photo.webp`);

    // FX snapshots merged
    expect(Object.keys(merged.fxSnapshots ?? {}).sort()).toEqual(['2025-11-01', '2026-10-15']);
  });

  it('formats sizes, Google display first names, and change detection accurately', () => {
    expect(formatBytes(0)).toBe('0 KB');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(245 * 1024)).toBe('245 KB');
    expect(formatBytes(3.5 * 1024 * 1024)).toBe('3.5 MB');

    expect(formatDriveFirstName('Gowtham', 'Gowtham Venkat', 'g@gmail.com')).toBe('Gowtham');
    expect(formatDriveFirstName(null, 'Priya Sharma', 'p@gmail.com')).toBe('Priya');
    expect(formatDriveFirstName(null, null, 'alex.traveler@gmail.com')).toBe('Alex');
    expect(formatDriveFirstName(null, null, null)).toBe('Wanderer');

    expect(hasLocalChangesSinceBackup('2026-11-25T12:00:00Z', null)).toBe(true);
    expect(hasLocalChangesSinceBackup('2026-11-25T10:00:00Z', '2026-11-25T12:00:00Z')).toBe(false);
    expect(hasLocalChangesSinceBackup('2026-11-25T14:00:00Z', '2026-11-25T12:00:00Z')).toBe(true);
  });

  it('enforces Wi-Fi-only backup policy, supports explicit mobile data override, and blocks offline uploads', () => {
    // Offline / airplane mode always blocked
    expect(
      evaluateBackupNetworkPolicy({
        isConnected: false,
        isInternetReachable: false,
        type: 'NONE',
        wifiOnly: false,
      })
    ).toEqual({ allowed: false, reason: 'offline' });

    // On cellular with Wi-Fi-only ON -> requires confirmation / waits for Wi-Fi
    expect(
      evaluateBackupNetworkPolicy({
        isConnected: true,
        isInternetReachable: true,
        type: 'CELLULAR',
        wifiOnly: true,
      })
    ).toEqual({ allowed: false, reason: 'wifi_required' });

    // On cellular with Wi-Fi-only ON + explicit user override -> allowed
    expect(
      evaluateBackupNetworkPolicy({
        isConnected: true,
        isInternetReachable: true,
        type: 'CELLULAR',
        wifiOnly: true,
        allowCellularOverride: true,
      })
    ).toEqual({ allowed: true });

    // On Wi-Fi with Wi-Fi-only ON -> allowed automatically
    expect(
      evaluateBackupNetworkPolicy({
        isConnected: true,
        isInternetReachable: true,
        type: 'WIFI',
        wifiOnly: true,
      })
    ).toEqual({ allowed: true });

    // On cellular with Wi-Fi-only OFF -> allowed automatically
    expect(
      evaluateBackupNetworkPolicy({
        isConnected: true,
        isInternetReachable: true,
        type: 'CELLULAR',
        wifiOnly: false,
      })
    ).toEqual({ allowed: true });
  });
});

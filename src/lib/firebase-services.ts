// Firebase Firestore services for GeoTracker
//
// Data model (v3)
// ───────────────
// trackers/{trackerId}                 small summary document (name, owner, last
//                                      location, battery, status, SOS, counters)
// trackers/{trackerId}/points/{auto}   one document per location fix
// trackers/{trackerId}/messages/{auto} chat between the owner and the device
// users/{uid}                          user profile
//
// Keeping the history in a sub-collection instead of an ever growing array
// keeps the tracker document far below Firestore's 1 MiB limit and means
// realtime listeners on the dashboard only receive small deltas.
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as limitTo,
  onSnapshot,
  writeBatch,
  increment,
  deleteField,
  Timestamp,
  serverTimestamp,
  type DocumentData,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { isValidLatLng, sanitizeText } from './geo';
import type {
  BatteryInfo,
  ChatMessage,
  DeviceInfo,
  LocationData,
  MotionState,
  SharingStatus,
  Tracker,
} from './types';

function isAuthenticated(): boolean {
  return auth.currentUser !== null;
}

const TRACKERS_COLLECTION = 'trackers';
const USERS_COLLECTION = 'users';
const POINTS_SUBCOLLECTION = 'points';
const MESSAGES_SUBCOLLECTION = 'messages';

export interface User {
  id: string;
  email: string;
  displayName?: string;
  createdAt: string;
  lastLoginAt?: string;
}

function timestampToString(timestamp: Timestamp | string | undefined | null): string {
  if (!timestamp) return new Date().toISOString();
  if (typeof timestamp === 'string') return timestamp;
  if (typeof (timestamp as Timestamp).toDate === 'function') return timestamp.toDate().toISOString();
  return new Date().toISOString();
}

function createTrackerData(name: string, userId?: string) {
  const data: Record<string, unknown> = {
    name: name || 'Unnamed Tracker',
    created: serverTimestamp(),
    updatedAt: serverTimestamp(),
    locations: [],
    locationCount: 0,
    status: 'active',
  };
  if (userId) data.userId = userId;
  return data;
}

function mapTracker(snapshot: DocumentSnapshot<DocumentData> | QueryDocumentSnapshot<DocumentData>): Tracker {
  const data = snapshot.data() ?? {};
  const locations: LocationData[] = Array.isArray(data.locations) ? data.locations : [];
  const legacyLast = locations.length > 0 ? locations[locations.length - 1] : null;
  return {
    id: snapshot.id,
    name: data.name || 'Unnamed Tracker',
    created: timestampToString(data.created),
    updatedAt: data.updatedAt ? timestampToString(data.updatedAt) : undefined,
    userId: data.userId,
    locations,
    lastLocation: data.lastLocation ?? legacyLast,
    lastSeen: data.lastSeen ?? legacyLast?.timestamp ?? null,
    locationCount: typeof data.locationCount === 'number' ? data.locationCount : locations.length,
    device: data.device ?? legacyLast?.deviceInfo ?? null,
    ip: data.ip ?? legacyLast?.ip ?? null,
    battery: data.battery ?? null,
    status: data.status ?? 'active',
    motion: data.motion,
    sos: data.sos ?? null,
  };
}

function sortNewestFirst(trackers: Tracker[]): Tracker[] {
  return trackers.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
}

/** Strip undefined/invalid values; Firestore rejects `undefined`. */
function toPointDoc(location: LocationData): Record<string, unknown> {
  const point: Record<string, unknown> = {
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: Math.round(location.accuracy * 10) / 10,
    timestamp: location.timestamp,
  };
  if (typeof location.speed === 'number' && Number.isFinite(location.speed)) point.speed = location.speed;
  if (typeof location.heading === 'number' && Number.isFinite(location.heading)) point.heading = location.heading;
  if (typeof location.altitude === 'number' && Number.isFinite(location.altitude)) point.altitude = location.altitude;
  if (typeof location.battery === 'number' && Number.isFinite(location.battery)) point.battery = location.battery;
  return point;
}

// === REALTIME SUBSCRIPTIONS ===

/** Live list of trackers owned by `userId` (replaces the old 10 s polling). */
export function subscribeToUserTrackers(
  userId: string,
  onData: (trackers: Tracker[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(collection(db, TRACKERS_COLLECTION), where('userId', '==', userId));
  return onSnapshot(
    q,
    (snapshot) => onData(sortNewestFirst(snapshot.docs.map(mapTracker))),
    (error) => onError?.(error),
  );
}

export function subscribeToTracker(
  trackingId: string,
  onData: (tracker: Tracker | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, TRACKERS_COLLECTION, trackingId),
    (snapshot) => onData(snapshot.exists() ? mapTracker(snapshot) : null),
    (error) => onError?.(error),
  );
}

/** Live history for one tracker: newest `max` points, returned oldest first. */
export function subscribeToPoints(
  trackingId: string,
  max: number,
  onData: (points: LocationData[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, TRACKERS_COLLECTION, trackingId, POINTS_SUBCOLLECTION),
    orderBy('timestamp', 'desc'),
    limitTo(max),
  );
  return onSnapshot(
    q,
    (snapshot) => onData(snapshot.docs.map((d) => d.data() as LocationData).reverse()),
    (error) => onError?.(error),
  );
}

export function subscribeToMessages(
  trackingId: string,
  onData: (messages: ChatMessage[]) => void,
  onError?: (error: Error) => void,
  max = 100,
): Unsubscribe {
  const q = query(
    collection(db, TRACKERS_COLLECTION, trackingId, MESSAGES_SUBCOLLECTION),
    orderBy('createdAt', 'desc'),
    limitTo(max),
  );
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snapshot) =>
      onData(
        snapshot.docs
          .map((d) => {
            const data = d.data({ serverTimestamps: 'estimate' });
            return {
              id: d.id,
              text: String(data.text ?? ''),
              sender: data.sender === 'owner' ? 'owner' : 'device',
              senderName: String(data.senderName ?? ''),
              createdAt: timestampToString(data.createdAt),
              pending: d.metadata.hasPendingWrites,
            } satisfies ChatMessage;
          })
          .reverse(),
      ),
    (error) => onError?.(error),
  );
}

// === TRACKER OPERATIONS ===

export async function getTrackersFromFirebase(): Promise<Tracker[]> {
  const user = auth.currentUser;
  if (!user) return [];
  const q = query(collection(db, TRACKERS_COLLECTION), where('userId', '==', user.uid));
  const snapshot = await getDocs(q);
  return sortNewestFirst(snapshot.docs.map(mapTracker));
}

export async function getTrackerFromFirebase(trackingId: string): Promise<Tracker | null> {
  const snapshot = await getDoc(doc(db, TRACKERS_COLLECTION, trackingId));
  return snapshot.exists() ? mapTracker(snapshot) : null;
}

export async function createTrackerInFirebase(name: string, customId?: string): Promise<Tracker | null> {
  const user = auth.currentUser;
  if (!user) {
    console.warn('Skipping Firestore write: user must be authenticated');
    return null;
  }
  const trackerData = createTrackerData(name, user.uid);
  let id = customId;
  if (customId) {
    await setDoc(doc(db, TRACKERS_COLLECTION, customId), trackerData);
  } else {
    id = (await addDoc(collection(db, TRACKERS_COLLECTION), trackerData)).id;
  }
  return {
    id: id!,
    name: name || 'Unnamed Tracker',
    created: new Date().toISOString(),
    userId: user.uid,
    locations: [],
    locationCount: 0,
    status: 'active',
  };
}

function isPermissionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /permission|PERMISSION_DENIED/i.test(message);
}

function isNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /No document to update|NOT_FOUND|not-found/i.test(message);
}

export async function getOrCreateTrackerInFirebase(
  trackingId: string,
  name: string = 'Shared Tracker',
): Promise<Tracker | null> {
  try {
    const existing = await getTrackerFromFirebase(trackingId);
    if (existing) return existing;
    await setDoc(doc(db, TRACKERS_COLLECTION, trackingId), createTrackerData(name));
    return { id: trackingId, name, created: new Date().toISOString(), locations: [], status: 'active' };
  } catch (error) {
    // A permission error on read means the tracker exists but is private to
    // its owner; location updates are still allowed via the update rule.
    if (isPermissionError(error)) {
      return { id: trackingId, name, created: new Date().toISOString(), locations: [] };
    }
    throw error;
  }
}

export interface LocationExtras {
  device?: DeviceInfo;
  ip?: string;
  battery?: BatteryInfo | null;
  motion?: MotionState;
}

/**
 * Store one fix: a point document plus a summary update on the tracker, both in
 * a single atomic batch (2 writes per fix).
 */
export async function addLocationToTrackerInFirebase(
  trackingId: string,
  location: LocationData,
  extras: LocationExtras = {},
): Promise<boolean> {
  if (!isValidLatLng(location.latitude, location.longitude)) return false;

  const trackerRef = doc(db, TRACKERS_COLLECTION, trackingId);
  const point = toPointDoc(location);

  const buildSummary = () => {
    const summary: Record<string, unknown> = {
      lastLocation: point,
      lastSeen: location.timestamp,
      locationCount: increment(1),
      updatedAt: serverTimestamp(),
    };
    if (extras.device) summary.device = extras.device;
    if (extras.ip) summary.ip = extras.ip;
    if (extras.battery) summary.battery = extras.battery;
    if (extras.motion) summary.motion = extras.motion;
    return summary;
  };

  const commit = () => {
    const batch = writeBatch(db);
    batch.set(doc(collection(trackerRef, POINTS_SUBCOLLECTION)), point);
    batch.update(trackerRef, buildSummary());
    return batch.commit();
  };

  try {
    await commit();
    return true;
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
    // Tracker was deleted or never created: recreate it and retry once.
    await setDoc(trackerRef, createTrackerData('Shared Tracker'));
    await commit();
    return true;
  }
}

/** Device-side status updates (pause/resume/stop, battery, device info). */
export async function updateTrackerState(
  trackingId: string,
  state: {
    status?: SharingStatus;
    battery?: BatteryInfo | null;
    device?: DeviceInfo;
    ip?: string;
    motion?: MotionState;
  },
): Promise<void> {
  const update: Record<string, unknown> = { updatedAt: serverTimestamp() };
  for (const [key, value] of Object.entries(state)) {
    if (value !== undefined) update[key] = value;
  }
  await updateDoc(doc(db, TRACKERS_COLLECTION, trackingId), update);
}

export async function triggerSos(
  trackingId: string,
  location: Pick<LocationData, 'latitude' | 'longitude' | 'accuracy'> | null,
): Promise<void> {
  await updateDoc(doc(db, TRACKERS_COLLECTION, trackingId), {
    sos: {
      active: true,
      triggeredAt: new Date().toISOString(),
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      accuracy: location?.accuracy ?? null,
      acknowledgedAt: null,
    },
    updatedAt: serverTimestamp(),
  });
}

export async function cancelSos(trackingId: string): Promise<void> {
  await updateDoc(doc(db, TRACKERS_COLLECTION, trackingId), {
    'sos.active': false,
    updatedAt: serverTimestamp(),
  });
}

export async function acknowledgeSos(trackingId: string): Promise<void> {
  await updateDoc(doc(db, TRACKERS_COLLECTION, trackingId), {
    'sos.active': false,
    'sos.acknowledgedAt': new Date().toISOString(),
    updatedAt: serverTimestamp(),
  });
}

/** Attach an existing unowned tracker (e.g. a Quick Track session) to the user. */
export async function claimTrackerInFirebase(trackingId: string, name?: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in to add a tracker.');
  const ref = doc(db, TRACKERS_COLLECTION, trackingId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    await setDoc(ref, createTrackerData(name || 'Linked Tracker', user.uid));
    return;
  }
  const owner = snapshot.data().userId;
  if (owner && owner !== user.uid) throw new Error('This tracker already belongs to another account.');
  if (owner === user.uid) return;
  await updateDoc(ref, { userId: user.uid, updatedAt: serverTimestamp() });
}

async function deleteSubcollection(trackingId: string, sub: string): Promise<void> {
  const ref = collection(db, TRACKERS_COLLECTION, trackingId, sub);
  // Delete in pages to respect the 500 operations per batch limit.
  for (;;) {
    const snapshot = await getDocs(query(ref, limitTo(400)));
    if (snapshot.empty) return;
    const batch = writeBatch(db);
    snapshot.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    if (snapshot.size < 400) return;
  }
}

export async function clearTrackerHistoryInFirebase(trackingId: string): Promise<void> {
  await deleteSubcollection(trackingId, POINTS_SUBCOLLECTION);
  await updateDoc(doc(db, TRACKERS_COLLECTION, trackingId), {
    locations: [],
    locationCount: 0,
    lastLocation: deleteField(),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteTrackerFromFirebase(trackingId: string): Promise<boolean> {
  if (!isAuthenticated()) return false;
  await deleteSubcollection(trackingId, POINTS_SUBCOLLECTION);
  await deleteSubcollection(trackingId, MESSAGES_SUBCOLLECTION);
  await deleteDoc(doc(db, TRACKERS_COLLECTION, trackingId));
  return true;
}

// === CHAT ===

export async function sendMessage(
  trackingId: string,
  message: { text: string; sender: 'owner' | 'device'; senderName: string },
): Promise<void> {
  const text = sanitizeText(message.text, 500);
  if (!text) return;
  await addDoc(collection(db, TRACKERS_COLLECTION, trackingId, MESSAGES_SUBCOLLECTION), {
    text,
    sender: message.sender,
    senderName: sanitizeText(message.senderName, 40) || (message.sender === 'owner' ? 'Owner' : 'Device'),
    createdAt: serverTimestamp(),
  });
}

// === USER OPERATIONS ===

export async function createOrUpdateUser(
  userId: string,
  email: string,
  displayName?: string,
  photoURL?: string,
): Promise<User | null> {
  if (!isAuthenticated()) return null;
  try {
    const userRef = doc(db, USERS_COLLECTION, userId);
    const userDoc = await getDoc(userRef);
    const now = new Date().toISOString();

    if (userDoc.exists()) {
      const updateData: Record<string, unknown> = { lastLoginAt: now, updatedAt: serverTimestamp() };
      if (displayName) updateData.displayName = displayName;
      if (photoURL) updateData.photoURL = photoURL;
      await updateDoc(userRef, updateData);
      const data = userDoc.data();
      return {
        id: userId,
        email: data.email,
        displayName: displayName || data.displayName,
        createdAt: timestampToString(data.createdAt),
        lastLoginAt: now,
      };
    }

    const name = displayName || email.split('@')[0];
    await setDoc(userRef, {
      email,
      displayName: name,
      photoURL: photoURL || '',
      createdAt: serverTimestamp(),
      lastLoginAt: now,
      updatedAt: serverTimestamp(),
    });
    return { id: userId, email, displayName: name, createdAt: now, lastLoginAt: now };
  } catch (error) {
    console.error('Error creating/updating user:', error);
    return null;
  }
}

function mapUser(d: QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>): User {
  const data = d.data() ?? {};
  return {
    id: d.id,
    email: data.email,
    displayName: data.displayName,
    createdAt: timestampToString(data.createdAt),
    lastLoginAt: data.lastLoginAt ? timestampToString(data.lastLoginAt) : undefined,
  };
}

export async function getUsersFromFirebase(): Promise<User[]> {
  if (!isAuthenticated()) return [];
  try {
    const snapshot = await getDocs(collection(db, USERS_COLLECTION));
    return snapshot.docs.map(mapUser);
  } catch (error) {
    console.error('Error getting users:', error);
    return [];
  }
}

export function subscribeToUsers(onData: (users: User[]) => void, onError?: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    collection(db, USERS_COLLECTION),
    (snapshot) =>
      onData(
        snapshot.docs
          .map(mapUser)
          .sort((a, b) => new Date(b.lastLoginAt ?? b.createdAt).getTime() - new Date(a.lastLoginAt ?? a.createdAt).getTime()),
      ),
    (error) => onError?.(error),
  );
}

export async function getUserFromFirebase(userId: string): Promise<User | null> {
  try {
    const snapshot = await getDoc(doc(db, USERS_COLLECTION, userId));
    return snapshot.exists() ? mapUser(snapshot) : null;
  } catch (error) {
    console.error('Error getting user:', error);
    return null;
  }
}

export async function deleteUserFromFirebase(userId: string): Promise<boolean> {
  try {
    await deleteDoc(doc(db, USERS_COLLECTION, userId));
    return true;
  } catch (error) {
    console.error('Error deleting user:', error);
    return false;
  }
}

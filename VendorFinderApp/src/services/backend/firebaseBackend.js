// src/services/backend/firebaseBackend.js
// Firebase backend stub. Implements the same API as localBackend.js so it can
// be dropped in by setting BACKEND='firebase' in src/config.js.
//
// To activate:
//   1. npm install firebase
//   2. Fill in firebaseConfig below.
//   3. Uncomment the imports/initialization block.
//   4. Set BACKEND='firebase' in src/config.js.

// import { initializeApp } from 'firebase/app';
// import {
//   getFirestore, collection, doc, getDoc, getDocs, addDoc, updateDoc,
//   deleteDoc, onSnapshot, query, where,
// } from 'firebase/firestore';

// const firebaseConfig = {
//   apiKey: '...',
//   authDomain: '...',
//   projectId: '...',
//   storageBucket: '...',
//   messagingSenderId: '...',
//   appId: '...',
// };
// const app = initializeApp(firebaseConfig);
// const db = getFirestore(app);

function notConfigured() {
  throw new Error(
    'Firebase backend not configured. See src/services/backend/firebaseBackend.js'
  );
}

export async function listVendors(/* filter */)            { notConfigured(); }
export async function getVendor(/* id */)                  { notConfigured(); }
export async function getVendorByOwner(/* ownerId */)      { notConfigured(); }
export async function registerVendor(/* data */)           { notConfigured(); }
export async function updateVendor(/* id, patch */)        { notConfigured(); }
export async function deleteVendor(/* id */)               { notConfigured(); }
export async function listFavorites(/* userId */)          { notConfigured(); }
export async function addFavorite(/* userId, vid */)       { notConfigured(); }
export async function removeFavorite(/* userId, vid */)    { notConfigured(); }
export async function listFollowers(/* vendorId */)        { notConfigured(); }
export async function blockFollower(/* vendorId, uid */)   { notConfigured(); }
export async function unblockFollower(/* vendorId, uid */) { notConfigured(); }
export async function removeFollower(/* vendorId, uid */)  { notConfigured(); }
export async function createUser(/* data */)               { notConfigured(); }
export async function getUser(/* id */)                    { notConfigured(); }
export async function getUserByUsername(/* username */)    { notConfigured(); }
export async function getUserByProvider(/* p, pid */)      { notConfigured(); }
export async function updateUser(/* id, patch */)          { notConfigured(); }
export async function listUsers()                          { notConfigured(); }
export async function sendBroadcast(/* vendorId, msg */)   { notConfigured(); }
export async function listBroadcasts(/* vendorId? */)      { notConfigured(); }
export function subscribeVendors(/* callback */)           { notConfigured(); }

/*
// Reference implementation (uncomment after install + config):

export async function listVendors(filter = {}) {
  const snap = await getDocs(collection(db, 'vendors'));
  let vendors = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (filter.query) {
    const q = filter.query.toLowerCase();
    vendors = vendors.filter(v =>
      v.name.toLowerCase().includes(q) ||
      v.type.toLowerCase().includes(q));
  }
  if (filter.type)     vendors = vendors.filter(v => v.type === filter.type);
  if (filter.openOnly) vendors = vendors.filter(v => v.isOpen);
  return vendors;
}

export async function getVendor(id) {
  const snap = await getDoc(doc(db, 'vendors', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function registerVendor(data) {
  const ref = await addDoc(collection(db, 'vendors'), {
    ...data, createdAt: Date.now(), rating: 0,
  });
  return { id: ref.id, ...data };
}

export async function updateVendor(id, patch) {
  await updateDoc(doc(db, 'vendors', id), patch);
  return getVendor(id);
}

export async function deleteVendor(id) {
  await deleteDoc(doc(db, 'vendors', id));
}

export async function listFavorites(userId) {
  const snap = await getDoc(doc(db, 'favorites', userId));
  return snap.exists() ? (snap.data().vendorIds || []) : [];
}

export async function addFavorite(userId, vendorId) {
  const cur = await listFavorites(userId);
  if (!cur.includes(vendorId)) {
    await updateDoc(doc(db, 'favorites', userId), { vendorIds: [...cur, vendorId] });
  }
}

export async function removeFavorite(userId, vendorId) {
  const cur = await listFavorites(userId);
  await updateDoc(doc(db, 'favorites', userId), {
    vendorIds: cur.filter(i => i !== vendorId),
  });
}

export function subscribeVendors(callback) {
  return onSnapshot(collection(db, 'vendors'), snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}
*/

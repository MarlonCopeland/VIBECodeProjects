// src/services/backend/index.js
// Backend facade. Imports the configured backend implementation and re-exports
// a uniform API. Swapping backends only requires changing src/config.js.
//
// Every backend MUST implement:
//   Vendors:
//     listVendors(filter?) -> Promise<Vendor[]>
//     getVendor(id) -> Promise<Vendor | null>
//     getVendorByOwner(ownerId) -> Promise<Vendor | null>
//     registerVendor(vendorData) -> Promise<Vendor>
//     updateVendor(id, patch) -> Promise<Vendor>
//     deleteVendor(id) -> Promise<void>
//   Favorites / Followers:
//     listFavorites(userId) -> Promise<string[]>
//     addFavorite(userId, vendorId) -> Promise<void>
//     removeFavorite(userId, vendorId) -> Promise<void>
//     listFollowers(vendorId) -> Promise<User[]>
//     blockFollower(vendorId, userId) -> Promise<void>
//     unblockFollower(vendorId, userId) -> Promise<void>
//     removeFollower(vendorId, userId) -> Promise<void>
//   Users:
//     createUser(data) -> Promise<User>
//     getUser(id) -> Promise<User | null>
//     getUserByUsername(username) -> Promise<User | null>
//     getUserByProvider(provider, providerId) -> Promise<User | null>
//     updateUser(id, patch) -> Promise<User>
//     listUsers() -> Promise<User[]>
//   Broadcasts:
//     sendBroadcast(vendorId, message) -> Promise<Broadcast>
//     listBroadcasts(vendorId?) -> Promise<Broadcast[]>
//   Realtime:
//     subscribeVendors(callback) -> unsubscribe fn

import { BACKEND } from '../../config';
import * as local from './localBackend';
import * as firebase from './firebaseBackend';

const impl = BACKEND === 'firebase' ? firebase : local;

// Vendors
export const listVendors        = (...a) => impl.listVendors(...a);
export const getVendor          = (...a) => impl.getVendor(...a);
export const getVendorByOwner   = (...a) => impl.getVendorByOwner(...a);
export const registerVendor     = (...a) => impl.registerVendor(...a);
export const updateVendor       = (...a) => impl.updateVendor(...a);
export const deleteVendor       = (...a) => impl.deleteVendor(...a);

// Favorites / Followers
export const listFavorites      = (...a) => impl.listFavorites(...a);
export const addFavorite        = (...a) => impl.addFavorite(...a);
export const removeFavorite     = (...a) => impl.removeFavorite(...a);
export const listFollowers      = (...a) => impl.listFollowers(...a);
export const blockFollower      = (...a) => impl.blockFollower(...a);
export const unblockFollower    = (...a) => impl.unblockFollower(...a);
export const removeFollower     = (...a) => impl.removeFollower(...a);

// Users
export const createUser         = (...a) => impl.createUser(...a);
export const getUser            = (...a) => impl.getUser(...a);
export const getUserByUsername  = (...a) => impl.getUserByUsername(...a);
export const getUserByProvider  = (...a) => impl.getUserByProvider(...a);
export const updateUser         = (...a) => impl.updateUser(...a);
export const listUsers          = (...a) => impl.listUsers(...a);

// Broadcasts
export const sendBroadcast      = (...a) => impl.sendBroadcast(...a);
export const listBroadcasts     = (...a) => impl.listBroadcasts(...a);

// Realtime
export const subscribeVendors   = (...a) => impl.subscribeVendors(...a);

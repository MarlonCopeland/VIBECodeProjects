// src/services/backend/index.js
// Backend facade. Imports the configured backend implementation and re-exports
// a uniform API. Swapping backends only requires changing APP_BACKEND (env) /
// src/config/env.js.
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
//   Notifications (typed, quota-limited):
//     sendNotification(vendorId, { type, title, body }) -> Promise<{notification, followers, remaining}>
//     listNotifications(vendorId?) -> Promise<Notification[]>
//     listNotificationsForUser(userId) -> Promise<Notification[]>
//     getWeeklyUsage(vendorId) -> Promise<{ [bucket]: number }>
//     sendBroadcast(vendorId, message) -> Promise<Notification>   (compat shim)
//     listBroadcasts(vendorId?) -> Promise<Notification[]>        (compat shim)
//   Subscriptions:
//     getSubscription(vendorId) -> Promise<{ tier, status } | null>
//     setSubscriptionTier(vendorId, tierId, status?) -> Promise<Vendor>
//   Push tokens:
//     registerPushToken(userId, token) -> Promise<void>
//     getPushTokens(userIds) -> Promise<string[]>
//   Auth (object):
//     auth.signUpWithEmail / signInWithEmail / signInWithProvider /
//     auth.getSession / signOut / onAuthStateChange
//   Realtime:
//     subscribeVendors(callback) -> unsubscribe fn

import { BACKEND } from '../../config/env';
import * as local from './localBackend';
import * as supabase from './supabaseBackend';

const impl = BACKEND === 'supabase' ? supabase : local;

export const mode = BACKEND;

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

// Notifications (typed, quota-limited)
export const sendNotification        = (...a) => impl.sendNotification(...a);
export const listNotifications       = (...a) => impl.listNotifications(...a);
export const listNotificationsForUser= (...a) => impl.listNotificationsForUser(...a);
export const getWeeklyUsage          = (...a) => impl.getWeeklyUsage(...a);
export const sendBroadcast           = (...a) => impl.sendBroadcast(...a);
export const listBroadcasts          = (...a) => impl.listBroadcasts(...a);

// Subscriptions
export const getSubscription      = (...a) => impl.getSubscription(...a);
export const setSubscriptionTier  = (...a) => impl.setSubscriptionTier(...a);

// Push tokens
export const registerPushToken    = (...a) => impl.registerPushToken(...a);
export const getPushTokens        = (...a) => impl.getPushTokens(...a);

// Auth
export const auth = impl.auth;

// Realtime
export const subscribeVendors   = (...a) => impl.subscribeVendors(...a);

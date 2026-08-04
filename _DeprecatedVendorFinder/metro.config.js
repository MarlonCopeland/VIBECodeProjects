// metro.config.js
// Default Expo Metro config + a resolver shim for an OPTIONAL dependency that
// @supabase/supabase-js dynamically imports (@opentelemetry/api). It's only
// used for tracing on servers and is never needed in the app, so we resolve it
// to an empty module to keep the bundler happy.

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const EMPTY_MODULE = path.resolve(__dirname, 'src/shims/empty.js');
const OPTIONAL_STUBS = new Set(['@opentelemetry/api']);

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (OPTIONAL_STUBS.has(moduleName)) {
    return { type: 'sourceFile', filePath: EMPTY_MODULE };
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;

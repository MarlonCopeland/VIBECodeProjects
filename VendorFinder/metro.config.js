// Metro config for the UnjadedDigital Expo template.
// Extends the Expo default. Kept as a seam so downstream apps can add
// asset/source extensions or custom resolvers without re-deriving the base.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// @supabase/supabase-js references the optional '@opentelemetry/api' package
// for tracing. The app never uses it, but Metro still tries to resolve it at
// bundle time — stub it with an empty module so bundling succeeds.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@opentelemetry/api': path.resolve(__dirname, 'src/shims/empty.js'),
};

module.exports = config;

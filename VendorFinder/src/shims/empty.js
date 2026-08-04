// src/shims/empty.js
// An empty module used to stub optional dependencies that Metro tries to
// resolve at bundle time but that the app never actually uses at runtime
// (e.g. @supabase/supabase-js's optional '@opentelemetry/api' tracing hook).
module.exports = {};

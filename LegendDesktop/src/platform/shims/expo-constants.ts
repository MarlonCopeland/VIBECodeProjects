// expo-constants: supplies `expoConfig.extra`, which src/config/env.ts reads.
// vite.config.ts builds __LEGEND_EXTRA__ from the SAME .env the mobile app
// uses (../LegendNetworkingApp/.env, then LegendDesktop/.env overrides), so
// both clients point at the same backend by default.

declare const __LEGEND_EXTRA__: Record<string, unknown>;

const Constants = {
  expoConfig: { name: 'Legend', extra: __LEGEND_EXTRA__ },
};

export default Constants;

// src/features/contacts/paletteStore.ts
// The seam where a premium-palette unlock becomes a real purchase.
//
// HONEST STATUS: this does NOT charge money yet. iOS requires StoreKit
// In-App Purchase for digital goods (Stripe is not allowed), which needs
// App Store Connect products + receipt validation — tracked in TASKS.md.
// Until then, unlocks are FREE DURING BETA so testers can try premium
// palettes; the UI says so explicitly. Swap the body of `purchasePalette`
// for a StoreKit call (e.g. expo-iap / react-native-iap) when products exist.

export interface PurchaseResult {
  ok: boolean;
  /** True while unlocks are free-in-beta (no real charge happened). */
  beta: boolean;
  message: string;
}

export async function purchasePalette(paletteId: string): Promise<PurchaseResult> {
  // Placeholder for StoreKit. Grants the entitlement locally, no charge.
  return {
    ok: true,
    beta: true,
    message: `“${paletteId}” unlocked free during beta. Real purchases arrive with App Store billing.`,
  };
}

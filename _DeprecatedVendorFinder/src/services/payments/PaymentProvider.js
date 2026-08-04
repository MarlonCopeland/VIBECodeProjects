// src/services/payments/PaymentProvider.js
// Abstract payment-provider interface. Implementations (Stripe today; Apple
// IAP / RevenueCat / Paddle tomorrow) conform to this contract so the rest of
// the app never needs to know which processor is in use.
//
// Swapping providers = change ONE line in paymentService.js.

export class PaymentProvider {
  /** Stable identifier, e.g. 'stripe'. */
  get id() { throw new Error('not implemented'); }

  /**
   * Start a subscription purchase/upgrade for a vendor to a given tier.
   * @param {object} args { vendorId, tier, currentUser }
   * @returns {Promise<{ url?: string, status: 'redirect'|'completed'|'pending' }>}
   *   - 'redirect': caller should open `url` (web Checkout / portal).
   *   - 'completed': handled in-app (e.g. native IAP) — refresh subscription.
   */
  async startCheckout(/* args */) { throw new Error('not implemented'); }

  /**
   * Open the provider's customer portal so a vendor can manage/cancel.
   * @returns {Promise<{ url?: string, status: 'redirect'|'unsupported' }>}
   */
  async openBillingPortal(/* args */) { throw new Error('not implemented'); }

  /** True when the provider is configured and usable in this environment. */
  isAvailable() { return false; }
}

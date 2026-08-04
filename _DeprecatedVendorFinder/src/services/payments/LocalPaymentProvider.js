// src/services/payments/LocalPaymentProvider.js
// No-op/demo provider used when APP_BACKEND=local. It "completes" instantly by
// setting the vendor's tier directly via the backend, so the whole
// subscription UX is testable offline without Stripe.

import { PaymentProvider } from './PaymentProvider';
import * as backend from '../backend';

export class LocalPaymentProvider extends PaymentProvider {
  get id() { return 'local'; }
  isAvailable() { return true; }

  async startCheckout({ vendorId, tier }) {
    await backend.setSubscriptionTier(vendorId, tier.id, 'active');
    return { status: 'completed' };
  }

  async openBillingPortal({ vendorId }) {
    // Simulate "manage" by downgrading to free.
    await backend.setSubscriptionTier(vendorId, 'free', 'active');
    return { status: 'completed' };
  }
}

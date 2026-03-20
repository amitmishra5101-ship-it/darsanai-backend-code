// ─────────────────────────────────────────────────────────────
// darsanai.AI — /webhooks Routes
// POST /webhooks/stripe   → handle Stripe payment events
// ─────────────────────────────────────────────────────────────
const express = require('express');
const router  = express.Router();

// Stripe webhook (we'll build this fully in the payments phase)
router.post('/stripe', express.raw({ type: 'application/json' }), (req, res) => {
  console.log('📦 Stripe webhook received');
  // TODO: verify Stripe signature, handle events (payment_succeeded, subscription_updated, etc.)
  res.json({ received: true });
});

module.exports = router;

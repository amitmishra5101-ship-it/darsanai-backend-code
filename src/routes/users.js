// ─────────────────────────────────────────────────────────────
// darsanai.AI — /api/users Routes
// GET /api/users/me           → get current user profile + credits
// GET /api/users/me/stats     → get generation stats
// ─────────────────────────────────────────────────────────────
const express  = require('express');
const { requireAuth, getCredits } = require('../middleware/auth');
const jobStore = require('../models/jobStore');

const router = express.Router();

// ── GET current user profile ──────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
  const credits = getCredits(req.userId);
  const stats   = jobStore.getUserStats(req.userId);

  return res.json({
    userId:  req.userId,
    plan:    req.userPlan || 'free',
    credits: {
      available: credits,
      total:     req.userPlan === 'creator' ? 300 : req.userPlan === 'studio' ? 9999 : 20,
      used:      stats.creditsUsed,
    },
    stats,
  });
});

// ── GET stats ─────────────────────────────────────────────────
router.get('/me/stats', requireAuth, (req, res) => {
  const stats = jobStore.getUserStats(req.userId);
  return res.json(stats);
});

module.exports = router;

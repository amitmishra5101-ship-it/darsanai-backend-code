// ─────────────────────────────────────────────────────────────
// darsanai.AI — Auth Middleware
// Verifies Clerk JWT tokens on protected routes
// ─────────────────────────────────────────────────────────────

// ── REQUIRE AUTH ──────────────────────────────────────────────
// Add this to any route that requires a logged-in user:
//   router.post('/generate', requireAuth, handler)
function requireAuth(req, res, next) {
  // In development without Clerk set up, allow all requests
  if (process.env.NODE_ENV === 'development' && !process.env.CLERK_SECRET_KEY) {
    req.userId = req.headers['x-user-id'] || 'dev-user-123';
    req.userPlan = 'creator';
    return next();
  }

  // Production: verify Clerk token
  // Install @clerk/backend: npm install @clerk/backend
  // Then replace below with real verification:
  //
  // const { createClerkClient } = require('@clerk/backend');
  // const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  //
  // const token = req.headers.authorization?.split(' ')[1];
  // if (!token) return res.status(401).json({ error: 'No token provided' });
  //
  // try {
  //   const payload = await clerk.verifyToken(token);
  //   req.userId = payload.sub;
  //   return next();
  // } catch (err) {
  //   return res.status(401).json({ error: 'Invalid or expired token' });
  // }

  // For now — accept any request with a user ID header
  const userId = req.headers['x-user-id'] || req.headers['authorization']?.replace('Bearer ', '');
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }
  req.userId   = userId;
  req.userPlan = req.headers['x-user-plan'] || 'free';
  next();
}

// ── CHECK CREDITS ─────────────────────────────────────────────
// Simple in-memory credit check (replace with DB in production)
const userCredits = new Map();

function getCredits(userId) {
  if (!userCredits.has(userId)) {
    // Give new users their free tier credits
    userCredits.set(userId, parseInt(process.env.FREE_TIER_CREDITS) || 20);
  }
  return userCredits.get(userId);
}

function deductCredits(userId, amount) {
  const current = getCredits(userId);
  userCredits.set(userId, Math.max(0, current - amount));
  return userCredits.get(userId);
}

function requireCredits(estimatedCredits) {
  return (req, res, next) => {
    const credits = getCredits(req.userId);
    if (credits < estimatedCredits) {
      return res.status(402).json({
        error: 'Insufficient credits',
        creditsNeeded: estimatedCredits,
        creditsAvailable: credits,
        upgradeUrl: '/pricing',
      });
    }
    req.availableCredits = credits;
    next();
  };
}

module.exports = { requireAuth, requireCredits, getCredits, deductCredits };

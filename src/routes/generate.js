// ─────────────────────────────────────────────────────────────
// darsanai.AI — /api/generate Routes
// POST /api/generate/text     → submit text-to-video job
// POST /api/generate/image    → submit image-to-video job
// GET  /api/generate/estimate → get credit cost estimate
// GET  /api/generate/health   → check if AI APIs are reachable
// ─────────────────────────────────────────────────────────────
const express  = require('express');
const multer   = require('multer');
const { v4: uuidv4 } = require('uuid');

const { requireAuth, requireCredits } = require('../middleware/auth');
const { addVideoJob }   = require('../config/queue');
const jobStore          = require('../models/jobStore');
const storage           = require('../services/storageService');
const runway            = require('../services/runwayService');

const router = express.Router();

// ── MULTER: handle image uploads (stored in memory) ──────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },   // 20MB max
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WEBP images are accepted'), false);
    }
  },
});

// ── VALIDATION ────────────────────────────────────────────────
const VALID_DURATIONS   = [3, 5, 8, 10, 15];
const VALID_MODELS      = ['runway', 'kling', 'luma', 'pika'];
const VALID_RESOLUTIONS = ['720p', '1080p', '4K'];

function validateGenerateBody(req, res) {
  const { duration, model, resolution } = req.body;

  if (duration && !VALID_DURATIONS.includes(parseInt(duration))) {
    res.status(400).json({ error: `Duration must be one of: ${VALID_DURATIONS.join(', ')}` });
    return false;
  }
  if (model && !VALID_MODELS.includes(model)) {
    res.status(400).json({ error: `Model must be one of: ${VALID_MODELS.join(', ')}` });
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────
// POST /api/generate/text
// Body: { prompt, style, duration, resolution, model, cameraMotion }
// ─────────────────────────────────────────────────────────────
router.post('/text', requireAuth, async (req, res) => {
  try {
    const {
      prompt,
      style        = 'Cinematic',
      duration     = 5,
      resolution   = '1080p',
      model        = 'runway',
      cameraMotion = 'Static',
    } = req.body;

    // Validate
    if (!prompt || prompt.trim().length < 5) {
      return res.status(400).json({ error: 'Prompt must be at least 5 characters.' });
    }
    if (prompt.length > 500) {
      return res.status(400).json({ error: 'Prompt must be under 500 characters.' });
    }
    if (!validateGenerateBody(req, res)) return;

    const estimatedCredits = runway.estimateCredits(parseInt(duration));

    // Check credits
    const { getCredits } = require('../middleware/auth');
    const available = getCredits(req.userId);
    if (available < estimatedCredits) {
      return res.status(402).json({
        error: 'Insufficient credits',
        creditsNeeded: estimatedCredits,
        creditsAvailable: available,
      });
    }

    // Build job
    const jobId = uuidv4();
    const enhancedPrompt = cameraMotion !== 'Static'
      ? `${prompt}. Camera: ${cameraMotion.toLowerCase()}.`
      : prompt;

    const jobData = {
      jobId,
      userId:   req.userId,
      type:     't2v',
      prompt:   enhancedPrompt,
      style,
      duration: parseInt(duration),
      resolution,
      model,
    };

    // Save job record + add to queue
    const job = jobStore.createJob(jobData);
    await addVideoJob(jobData);

    console.log(`✅ Text-to-video job queued: ${jobId} by user ${req.userId}`);

    return res.status(202).json({
      success: true,
      jobId,
      message: 'Video generation started. Poll /api/jobs/:jobId for status.',
      estimatedSeconds: parseInt(duration) * 8,  // rough estimate
      creditsWillBeUsed: estimatedCredits,
    });

  } catch (err) {
    console.error('Generate/text error:', err);
    return res.status(500).json({ error: 'Failed to queue generation job.' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/generate/image
// Form data: image (file), prompt, style, duration, resolution, model
// ─────────────────────────────────────────────────────────────
router.post('/image', requireAuth, upload.single('image'), async (req, res) => {
  try {
    const {
      prompt     = '',
      style      = 'Cinematic',
      duration   = 5,
      resolution = '1080p',
      model      = 'runway',
    } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'An image file is required for image-to-video.' });
    }
    if (!validateGenerateBody(req, res)) return;

    // Upload image to S3 so Runway can access it via URL
    const imageUrl = await storage.uploadImage(
      req.file.buffer,
      req.file.originalname,
      req.userId
    );

    const jobId  = uuidv4();
    const jobData = {
      jobId,
      userId:   req.userId,
      type:     'i2v',
      prompt,
      imageUrl,
      style,
      duration: parseInt(duration),
      resolution,
      model,
    };

    jobStore.createJob(jobData);
    await addVideoJob(jobData);

    return res.status(202).json({
      success: true,
      jobId,
      imageUrl,
      message: 'Image-to-video generation started.',
      estimatedSeconds: parseInt(duration) * 10,
    });

  } catch (err) {
    console.error('Generate/image error:', err);
    return res.status(500).json({ error: 'Failed to queue image-to-video job.' });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/generate/estimate
// Query: ?duration=5&model=runway
// ─────────────────────────────────────────────────────────────
router.get('/estimate', requireAuth, (req, res) => {
  const duration = parseInt(req.query.duration) || 5;
  const credits  = runway.estimateCredits(duration);

  return res.json({
    duration,
    creditsRequired: credits,
    estimatedSeconds: duration * 8,
  });
});

// ─────────────────────────────────────────────────────────────
// GET /api/generate/health
// Check if Runway API is reachable
// ─────────────────────────────────────────────────────────────
router.get('/health', async (req, res) => {
  const health = await runway.checkRunwayHealth();
  return res.json(health);
});

module.exports = router;

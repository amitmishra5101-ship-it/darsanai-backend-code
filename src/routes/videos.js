// ─────────────────────────────────────────────────────────────
// darsanai.AI — /api/videos Routes
// GET    /api/videos          → list user's completed videos
// GET    /api/videos/:jobId   → get a single video
// DELETE /api/videos/:jobId   → delete a video
// ─────────────────────────────────────────────────────────────
const express  = require('express');
const { requireAuth } = require('../middleware/auth');
const jobStore        = require('../models/jobStore');

const router = express.Router();

// ── GET all completed videos for user ────────────────────────
router.get('/', requireAuth, (req, res) => {
  const allJobs = jobStore.getJobsByUser(req.userId);
  const videos  = allJobs.filter(j => j.status === 'completed' && j.videoUrl);

  return res.json({
    total:  videos.length,
    videos: videos.map(formatVideo),
  });
});

// ── GET a single video ────────────────────────────────────────
router.get('/:jobId', requireAuth, (req, res) => {
  const job = jobStore.getJob(req.params.jobId);

  if (!job)                      return res.status(404).json({ error: 'Video not found' });
  if (job.userId !== req.userId) return res.status(403).json({ error: 'Access denied' });
  if (!job.videoUrl)             return res.status(404).json({ error: 'Video not yet available' });

  return res.json(formatVideo(job));
});

// ── DELETE a video ────────────────────────────────────────────
router.delete('/:jobId', requireAuth, async (req, res) => {
  const job = jobStore.getJob(req.params.jobId);

  if (!job)                      return res.status(404).json({ error: 'Video not found' });
  if (job.userId !== req.userId) return res.status(403).json({ error: 'Access denied' });

  // In production: delete from S3 too
  // await storage.deleteFile(`videos/${req.userId}/${req.params.jobId}.mp4`);

  jobStore.updateJob(req.params.jobId, { videoUrl: null, status: 'deleted' });

  return res.json({ success: true, message: 'Video deleted' });
});

// ── FORMAT helper ─────────────────────────────────────────────
function formatVideo(job) {
  return {
    id:          job.id,
    videoUrl:    job.videoUrl,
    thumbnailUrl: job.thumbnailUrl,
    type:        job.type,
    prompt:      job.prompt,
    style:       job.style,
    duration:    job.duration,
    resolution:  job.resolution,
    creditsUsed: job.creditsUsed,
    createdAt:   job.createdAt,
    completedAt: job.completedAt,
  };
}

module.exports = router;

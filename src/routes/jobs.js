// ─────────────────────────────────────────────────────────────
// darsanai.AI — /api/jobs Routes
// GET /api/jobs/:jobId     → poll a single job's status
// GET /api/jobs            → list all jobs for the current user
// DELETE /api/jobs/:jobId  → cancel a queued job
// ─────────────────────────────────────────────────────────────
const express  = require('express');
const { requireAuth } = require('../middleware/auth');
const jobStore        = require('../models/jobStore');
const { getJobStatus, videoQueue } = require('../config/queue');

const router = express.Router();

// ─────────────────────────────────────────────────────────────
// GET /api/jobs/:jobId
// Used by the frontend to poll for progress (every 3 seconds)
// ─────────────────────────────────────────────────────────────
router.get('/:jobId', requireAuth, async (req, res) => {
  const { jobId } = req.params;

  // Get our stored job record
  const job = jobStore.getJob(jobId);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  // Security: make sure this job belongs to the requesting user
  if (job.userId !== req.userId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Also get the BullMQ queue status for extra detail
  let queueStatus = null;
  try {
    queueStatus = await getJobStatus(jobId);
  } catch (e) {
    // Queue status is optional — job record is the source of truth
  }

  return res.json({
    jobId:       job.id,
    status:      job.status,            // queued | processing | completed | failed
    progress:    job.progress,          // 0-100
    videoUrl:    job.videoUrl,          // null until completed
    error:       job.error,             // null unless failed
    type:        job.type,              // t2v | i2v
    prompt:      job.prompt,
    style:       job.style,
    duration:    job.duration,
    resolution:  job.resolution,
    creditsUsed: job.creditsUsed,
    createdAt:   job.createdAt,
    completedAt: job.completedAt,
    queuePosition: queueStatus?.state === 'waiting' ? 'In queue' : null,
  });
});

// ─────────────────────────────────────────────────────────────
// GET /api/jobs
// Returns all jobs for the logged-in user (video history)
// ─────────────────────────────────────────────────────────────
router.get('/', requireAuth, (req, res) => {
  const jobs = jobStore.getJobsByUser(req.userId);

  return res.json({
    total: jobs.length,
    jobs:  jobs.map(j => ({
      jobId:      j.id,
      status:     j.status,
      progress:   j.progress,
      videoUrl:   j.videoUrl,
      type:       j.type,
      prompt:     j.prompt.slice(0, 100),   // truncate for list view
      style:      j.style,
      duration:   j.duration,
      resolution: j.resolution,
      createdAt:  j.createdAt,
      completedAt: j.completedAt,
    })),
  });
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/jobs/:jobId
// Cancel a queued job before it starts processing
// ─────────────────────────────────────────────────────────────
router.delete('/:jobId', requireAuth, async (req, res) => {
  const { jobId } = req.params;
  const job = jobStore.getJob(jobId);

  if (!job)                        return res.status(404).json({ error: 'Job not found' });
  if (job.userId !== req.userId)   return res.status(403).json({ error: 'Access denied' });
  if (job.status === 'completed')  return res.status(400).json({ error: 'Cannot cancel a completed job' });
  if (job.status === 'processing') return res.status(400).json({ error: 'Cannot cancel a job that is already processing' });

  // Remove from BullMQ queue
  try {
    const qJob = await videoQueue.getJob(jobId);
    if (qJob) await qJob.remove();
  } catch (e) {
    console.warn('Could not remove from queue:', e.message);
  }

  jobStore.setJobFailed(jobId, 'Cancelled by user');

  return res.json({ success: true, message: 'Job cancelled' });
});

module.exports = router;

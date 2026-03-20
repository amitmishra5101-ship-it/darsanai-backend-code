// ─────────────────────────────────────────────────────────────
// darsanai.AI — In-Memory Job Store
// Stores job metadata (status, result URL, user info)
// In production: replace with PostgreSQL
// ─────────────────────────────────────────────────────────────

const jobs = new Map();  // jobId → jobRecord

// ── JOB STATUS CONSTANTS ──────────────────────────────────────
const STATUS = {
  QUEUED:     'queued',
  PROCESSING: 'processing',
  COMPLETED:  'completed',
  FAILED:     'failed',
};

// ── CREATE ────────────────────────────────────────────────────
function createJob(data) {
  const job = {
    id:           data.jobId,
    userId:       data.userId,
    type:         data.type,           // 't2v' | 'i2v'
    prompt:       data.prompt,
    imageUrl:     data.imageUrl || null,
    style:        data.style || 'Cinematic',
    duration:     data.duration || 5,
    resolution:   data.resolution || '1080p',
    model:        data.model || 'runway',
    status:       STATUS.QUEUED,
    progress:     0,
    videoUrl:     null,
    thumbnailUrl: null,
    error:        null,
    creditsUsed:  0,
    createdAt:    new Date().toISOString(),
    updatedAt:    new Date().toISOString(),
    completedAt:  null,
  };
  jobs.set(data.jobId, job);
  console.log(`📝 Job created: ${data.jobId}`);
  return job;
}

// ── READ ──────────────────────────────────────────────────────
function getJob(jobId) {
  return jobs.get(jobId) || null;
}

function getJobsByUser(userId) {
  return [...jobs.values()]
    .filter(j => j.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// ── UPDATE ────────────────────────────────────────────────────
function updateJob(jobId, updates) {
  const job = jobs.get(jobId);
  if (!job) return null;
  const updated = { ...job, ...updates, updatedAt: new Date().toISOString() };
  jobs.set(jobId, updated);
  return updated;
}

function setJobProcessing(jobId) {
  return updateJob(jobId, { status: STATUS.PROCESSING, progress: 5 });
}

function setJobProgress(jobId, progress) {
  return updateJob(jobId, { progress: Math.min(Math.round(progress), 99) });
}

function setJobCompleted(jobId, videoUrl, creditsUsed) {
  return updateJob(jobId, {
    status:      STATUS.COMPLETED,
    progress:    100,
    videoUrl,
    creditsUsed,
    completedAt: new Date().toISOString(),
  });
}

function setJobFailed(jobId, error) {
  return updateJob(jobId, {
    status: STATUS.FAILED,
    error:  error.toString(),
  });
}

// ── STATS (dashboard data) ────────────────────────────────────
function getUserStats(userId) {
  const userJobs = getJobsByUser(userId);
  return {
    total:      userJobs.length,
    completed:  userJobs.filter(j => j.status === STATUS.COMPLETED).length,
    failed:     userJobs.filter(j => j.status === STATUS.FAILED).length,
    processing: userJobs.filter(j => j.status === STATUS.PROCESSING).length,
    creditsUsed: userJobs.reduce((sum, j) => sum + (j.creditsUsed || 0), 0),
  };
}

module.exports = {
  STATUS,
  createJob,
  getJob,
  getJobsByUser,
  updateJob,
  setJobProcessing,
  setJobProgress,
  setJobCompleted,
  setJobFailed,
  getUserStats,
};

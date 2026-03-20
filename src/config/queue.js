// ─────────────────────────────────────────────────────────────
// darsanai.AI — Redis Connection & Job Queue Setup
// ─────────────────────────────────────────────────────────────
const { Queue, Worker, QueueEvents } = require('bullmq');
const IORedis = require('ioredis');

// ── REDIS CONNECTION ──────────────────────────────────────────
const redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,   // required by BullMQ
  retryStrategy: (times) => {
    if (times > 10) return null; // stop retrying after 10 attempts
    return Math.min(times * 200, 2000);
  },
});

redis.on('connect',  () => console.log('✅ Redis connected'));
redis.on('error',    (err) => console.error('❌ Redis error:', err.message));
redis.on('close',    () => console.warn('⚠️  Redis connection closed'));

// ── VIDEO GENERATION QUEUE ────────────────────────────────────
const videoQueue = new Queue('video-generation', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,                        // retry failed jobs 3 times
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 100 },   // keep last 100 completed jobs
    removeOnFail: { count: 50 },
  },
});

// ── QUEUE EVENTS (for real-time status updates) ───────────────
const queueEvents = new QueueEvents('video-generation', { connection: redis });

queueEvents.on('completed', ({ jobId }) => {
  console.log(`✅ Job ${jobId} completed`);
});
queueEvents.on('failed', ({ jobId, failedReason }) => {
  console.error(`❌ Job ${jobId} failed: ${failedReason}`);
});
queueEvents.on('progress', ({ jobId, data }) => {
  console.log(`⏳ Job ${jobId} progress: ${data}%`);
});

// ── HELPER: Add a video generation job ───────────────────────
async function addVideoJob(jobData) {
  const job = await videoQueue.add('generate', jobData, {
    jobId: jobData.jobId,   // use our own UUID as the job ID
    priority: jobData.priority || 2,
  });
  console.log(`📥 Job queued: ${job.id}`);
  return job;
}

// ── HELPER: Get job status ────────────────────────────────────
async function getJobStatus(jobId) {
  const job = await videoQueue.getJob(jobId);
  if (!job) return null;

  const state = await job.getState();     // waiting | active | completed | failed
  const progress = job.progress;

  return {
    jobId,
    state,
    progress,
    data: job.data,
    result: job.returnvalue,
    failReason: job.failedReason,
    createdAt: new Date(job.timestamp).toISOString(),
    processedAt: job.processedOn ? new Date(job.processedOn).toISOString() : null,
    finishedAt: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
  };
}

module.exports = { redis, videoQueue, queueEvents, addVideoJob, getJobStatus };

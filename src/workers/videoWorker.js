// ─────────────────────────────────────────────────────────────
// darsanai.AI — Video Generation Worker
// This runs as a separate process alongside the main server.
// It picks jobs from the Redis queue and calls the AI APIs.
//
// Run with:  node src/workers/videoWorker.js
//       or:  npm run worker
// ─────────────────────────────────────────────────────────────
require('dotenv').config();

const { Worker } = require('bullmq');
const { redis }  = require('../config/queue');

const runway   = require('../services/runwayService');
const kling    = require('../services/klingService');
const storage  = require('../services/storageService');
const jobStore = require('../models/jobStore');

console.log('🔧 darsanai Video Worker starting…');

// ── THE WORKER ────────────────────────────────────────────────
const worker = new Worker('video-generation', async (job) => {
  const { jobId, userId, type, prompt, imageUrl, style, duration, resolution, model } = job.data;

  console.log(`\n🎬 Processing job ${jobId}`);
  console.log(`   Type: ${type} | Model: ${model} | Duration: ${duration}s`);

  // Mark job as processing in our store
  jobStore.setJobProcessing(jobId);
  await job.updateProgress(10);

  try {
    // ── STEP 1: Submit to AI API ───────────────────────────
    let runwayTaskId;

    const ratio = resolutionToRatio(resolution);

    if (model === 'kling') {
      // Use Kling API
      if (type === 't2v') {
        runwayTaskId = await kling.textToVideo({ prompt, duration: parseInt(duration), style });
      } else {
        runwayTaskId = await kling.imageToVideo({ imageUrl, prompt, duration: parseInt(duration) });
      }
    } else {
      // Default: use Runway API
      if (type === 't2v') {
        runwayTaskId = await runway.textToVideo({ prompt, duration: parseInt(duration), ratio, style });
      } else {
        runwayTaskId = await runway.imageToVideo({ imageUrl, prompt, duration: parseInt(duration), ratio });
      }
    }

    console.log(`   AI Task ID: ${runwayTaskId}`);
    await job.updateProgress(20);
    jobStore.setJobProgress(jobId, 20);

    // ── STEP 2: Poll until video is ready ──────────────────
    // onProgress is called as Runway renders the video
    const onProgress = async (apiProgress) => {
      // Map API progress (0-100) to our overall progress (20-85)
      const overallProgress = 20 + (apiProgress * 0.65);
      await job.updateProgress(overallProgress);
      jobStore.setJobProgress(jobId, overallProgress);
    };

    let rawVideoUrl;
    if (model === 'kling') {
      rawVideoUrl = await kling.pollTaskUntilDone(runwayTaskId, onProgress);
    } else {
      rawVideoUrl = await runway.pollTaskUntilDone(runwayTaskId, onProgress);
    }

    await job.updateProgress(85);
    jobStore.setJobProgress(jobId, 85);
    console.log(`   Raw video URL: ${rawVideoUrl}`);

    // ── STEP 3: Save video to our S3 storage ───────────────
    // This ensures the video doesn't disappear when Runway's URL expires
    const permanentUrl = await storage.downloadAndUpload(rawVideoUrl, userId, jobId);

    await job.updateProgress(95);
    jobStore.setJobProgress(jobId, 95);

    // ── STEP 4: Calculate credits used ────────────────────
    const creditsUsed = runway.estimateCredits(parseInt(duration));

    // ── STEP 5: Mark as complete ───────────────────────────
    jobStore.setJobCompleted(jobId, permanentUrl, creditsUsed);
    await job.updateProgress(100);

    console.log(`✅ Job ${jobId} complete! Credits used: ${creditsUsed}`);

    // Return the result — stored in job.returnvalue
    return {
      videoUrl:    permanentUrl,
      creditsUsed,
      duration,
      completedAt: new Date().toISOString(),
    };

  } catch (err) {
    // ── FAILURE HANDLING ───────────────────────────────────
    console.error(`❌ Job ${jobId} failed:`, err.message);
    jobStore.setJobFailed(jobId, err.message);
    throw err;   // BullMQ will retry based on the job's retry config
  }

}, {
  connection: redis,
  concurrency: 3,   // process up to 3 videos simultaneously
  limiter: {
    max: 10,        // max 10 jobs per 60 seconds (respect Runway rate limits)
    duration: 60000,
  },
});

// ── WORKER EVENT LISTENERS ────────────────────────────────────
worker.on('completed', (job, result) => {
  console.log(`🏁 Worker: job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`💥 Worker: job ${job?.id} failed — ${err.message}`);
});

worker.on('error', (err) => {
  console.error('Worker error:', err);
});

// ── GRACEFUL SHUTDOWN ─────────────────────────────────────────
process.on('SIGTERM', async () => {
  console.log('⏹️  Worker shutting down gracefully…');
  await worker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await worker.close();
  process.exit(0);
});

// ── HELPERS ───────────────────────────────────────────────────
function resolutionToRatio(resolution) {
  const map = { '720p': '1280:720', '1080p': '1280:720', '4K': '1280:720' };
  return map[resolution] || '1280:720';
}

console.log('✅ Worker ready — waiting for jobs…\n');

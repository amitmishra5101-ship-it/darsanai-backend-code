// ─────────────────────────────────────────────────────────────
// darsanai.AI — Runway ML API Service
// Docs: https://docs.runwayml.com
// ─────────────────────────────────────────────────────────────
const axios = require('axios');

const RUNWAY_BASE = process.env.RUNWAY_API_BASE || 'https://api.runwayml.com/v1';
const RUNWAY_KEY  = process.env.RUNWAY_API_KEY;

// Max time to wait for a video to finish rendering (3 minutes)
const MAX_POLL_DURATION_MS = 3 * 60 * 1000;
const POLL_INTERVAL_MS     = 5000;  // check every 5 seconds

// ── RUNWAY HTTP CLIENT ────────────────────────────────────────
const runwayClient = axios.create({
  baseURL: RUNWAY_BASE,
  headers: {
    'Authorization': `Bearer ${RUNWAY_KEY}`,
    'Content-Type': 'application/json',
    'X-Runway-Version': '2024-11-06',
  },
  timeout: 30000,
});

// ── TEXT → VIDEO ──────────────────────────────────────────────
// Submits a text-to-video task to Runway Gen-4
// Returns a taskId that you poll until completion
async function textToVideo({ prompt, duration = 5, ratio = '1280:720', style = '' }) {
  if (!RUNWAY_KEY) throw new Error('RUNWAY_API_KEY is not set in .env');

  // Enhance prompt with cinematic style if provided
  const enhancedPrompt = style
    ? `${prompt}. Style: ${style}. Cinematic quality, professional camera work.`
    : prompt;

  console.log(`🎬 Runway T2V → prompt: "${enhancedPrompt.slice(0, 80)}..."`);

  const response = await runwayClient.post('/text_to_video', {
    promptText: enhancedPrompt,
    model: 'gen4_turbo',        // Runway Gen-4 Turbo
    ratio,                       // "1280:720" | "720:1280" | "1104:832" | "832:1104"
    duration,                    // 5 or 10 seconds
  });

  const taskId = response.data.id;
  console.log(`📋 Runway task created: ${taskId}`);
  return taskId;
}

// ── IMAGE → VIDEO ─────────────────────────────────────────────
// Animates a still image into a video using Runway Gen-4
async function imageToVideo({ imageUrl, prompt = '', duration = 5, ratio = '1280:720' }) {
  if (!RUNWAY_KEY) throw new Error('RUNWAY_API_KEY is not set in .env');

  console.log(`🖼️  Runway I2V → image: "${imageUrl.slice(0, 60)}..."`);

  const response = await runwayClient.post('/image_to_video', {
    model: 'gen4_turbo',
    promptImage: imageUrl,       // public URL of the uploaded image
    promptText: prompt || 'Cinematic camera movement, natural motion',
    ratio,
    duration,
  });

  const taskId = response.data.id;
  console.log(`📋 Runway task created: ${taskId}`);
  return taskId;
}

// ── POLL FOR COMPLETION ───────────────────────────────────────
// Keeps checking the task until it's done or failed
// Calls onProgress(pct) as the video renders
async function pollTaskUntilDone(taskId, onProgress) {
  const startTime = Date.now();

  while (true) {
    // Timeout guard
    if (Date.now() - startTime > MAX_POLL_DURATION_MS) {
      throw new Error(`Runway task ${taskId} timed out after ${MAX_POLL_DURATION_MS / 1000}s`);
    }

    const status = await getTaskStatus(taskId);
    console.log(`🔄 Task ${taskId} — status: ${status.status}, progress: ${status.progress}%`);

    // Report progress back to the job worker
    if (onProgress) await onProgress(status.progress || 0);

    if (status.status === 'SUCCEEDED') {
      const videoUrl = status.output?.[0];
      if (!videoUrl) throw new Error('Runway returned success but no output URL');
      console.log(`✅ Runway task complete → ${videoUrl}`);
      return videoUrl;
    }

    if (status.status === 'FAILED') {
      const reason = status.failure || 'Unknown error from Runway';
      throw new Error(`Runway generation failed: ${reason}`);
    }

    // Still running — wait and poll again
    await sleep(POLL_INTERVAL_MS);
  }
}

// ── GET TASK STATUS ───────────────────────────────────────────
async function getTaskStatus(taskId) {
  const response = await runwayClient.get(`/tasks/${taskId}`);
  return response.data;
  // Returns: { id, status: "PENDING"|"RUNNING"|"SUCCEEDED"|"FAILED", progress, output: [url], failure }
}

// ── CANCEL A TASK ─────────────────────────────────────────────
async function cancelTask(taskId) {
  try {
    await runwayClient.delete(`/tasks/${taskId}`);
    console.log(`🚫 Runway task ${taskId} cancelled`);
  } catch (err) {
    console.warn(`Could not cancel task ${taskId}:`, err.message);
  }
}

// ── CHECK API CONNECTIVITY ────────────────────────────────────
async function checkRunwayHealth() {
  try {
    await runwayClient.get('/organization');
    return { ok: true, message: 'Runway API reachable' };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

// ── HELPERS ───────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── CREDIT ESTIMATION ─────────────────────────────────────────
// Runway charges per second of generated video
// This helps us show users the cost before they generate
function estimateCredits(durationSeconds) {
  const creditsPerSecond = parseInt(process.env.CREDITS_PER_SECOND) || 2;
  return durationSeconds * creditsPerSecond;
}

module.exports = {
  textToVideo,
  imageToVideo,
  pollTaskUntilDone,
  getTaskStatus,
  cancelTask,
  checkRunwayHealth,
  estimateCredits,
};

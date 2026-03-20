// ─────────────────────────────────────────────────────────────
// darsanai.AI — Kling AI Service (Fallback / Budget Model)
// Docs: https://klingai.com/developers
// ─────────────────────────────────────────────────────────────
const axios = require('axios');

const KLING_BASE = process.env.KLING_API_BASE || 'https://api.klingai.com/v1';
const KLING_KEY  = process.env.KLING_API_KEY;

const POLL_INTERVAL_MS     = 5000;
const MAX_POLL_DURATION_MS = 3 * 60 * 1000;

const klingClient = axios.create({
  baseURL: KLING_BASE,
  headers: {
    'Authorization': `Bearer ${KLING_KEY}`,
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// ── TEXT → VIDEO ──────────────────────────────────────────────
async function textToVideo({ prompt, duration = 5, aspectRatio = '16:9', style = '' }) {
  if (!KLING_KEY) throw new Error('KLING_API_KEY is not set in .env');

  const enhancedPrompt = style ? `${prompt}. Cinematic ${style} style.` : prompt;

  const response = await klingClient.post('/videos/text2video', {
    model: 'kling-v1-6',
    prompt: enhancedPrompt,
    negative_prompt: 'blurry, low quality, distorted, amateur',
    duration: String(duration),
    aspect_ratio: aspectRatio,
    mode: 'std',              // 'std' = standard, 'pro' = higher quality
  });

  const taskId = response.data.data?.task_id;
  console.log(`📋 Kling task created: ${taskId}`);
  return taskId;
}

// ── IMAGE → VIDEO ─────────────────────────────────────────────
async function imageToVideo({ imageUrl, prompt = '', duration = 5 }) {
  if (!KLING_KEY) throw new Error('KLING_API_KEY is not set in .env');

  const response = await klingClient.post('/videos/image2video', {
    model: 'kling-v1-6',
    image_url: imageUrl,
    prompt: prompt || 'Smooth cinematic camera motion',
    duration: String(duration),
    mode: 'std',
  });

  return response.data.data?.task_id;
}

// ── POLL FOR COMPLETION ───────────────────────────────────────
async function pollTaskUntilDone(taskId, onProgress) {
  const startTime = Date.now();

  while (true) {
    if (Date.now() - startTime > MAX_POLL_DURATION_MS) {
      throw new Error(`Kling task timed out after ${MAX_POLL_DURATION_MS / 1000}s`);
    }

    const status = await getTaskStatus(taskId);
    if (onProgress) await onProgress(status.progress || 0);

    if (status.task_status === 'succeed') {
      const videoUrl = status.task_result?.videos?.[0]?.url;
      if (!videoUrl) throw new Error('Kling returned success but no output URL');
      return videoUrl;
    }

    if (status.task_status === 'failed') {
      throw new Error(`Kling generation failed: ${status.task_status_msg}`);
    }

    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
}

async function getTaskStatus(taskId) {
  const response = await klingClient.get(`/videos/text2video/${taskId}`);
  return response.data.data;
}

module.exports = { textToVideo, imageToVideo, pollTaskUntilDone };

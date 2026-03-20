# 🎬 darsanai — Backend Server

Node.js + Express backend for cinematic AI video generation.
Connects your React frontend to Runway ML, Kling AI, and stores videos on S3.

---

## 📁 Folder Structure

```
darsanai-backend/
├── src/
│   ├── server.js              ← Express app entry point
│   ├── config/
│   │   └── queue.js           ← Redis + BullMQ queue setup
│   ├── routes/
│   │   ├── generate.js        ← POST /api/generate/text & /image
│   │   ├── jobs.js            ← GET  /api/jobs/:id  (polling)
│   │   ├── videos.js          ← GET  /api/videos    (gallery)
│   │   ├── users.js           ← GET  /api/users/me  (credits)
│   │   └── webhooks.js        ← POST /webhooks/stripe
│   ├── services/
│   │   ├── runwayService.js   ← Runway ML API wrapper
│   │   ├── klingService.js    ← Kling AI API wrapper
│   │   └── storageService.js  ← AWS S3 / Cloudflare R2
│   ├── workers/
│   │   └── videoWorker.js     ← BullMQ worker (runs separately)
│   ├── middleware/
│   │   └── auth.js            ← Clerk JWT verification
│   └── models/
│       └── jobStore.js        ← In-memory job storage (→ PostgreSQL later)
├── .env.example               ← Copy to .env and fill in your keys
└── package.json
```

---

## ⚡ Quick Start (5 steps)

### Step 1 — Install dependencies
```bash
cd darsanai-backend
npm install
```

### Step 2 — Set up environment variables
```bash
cp .env.example .env
# Now open .env and fill in your API keys
```

### Step 3 — Install and start Redis
Redis is needed for the job queue.

**Mac:**
```bash
brew install redis
brew services start redis
```

**Windows:**
Download from https://github.com/tporadowski/redis/releases

**Cloud (free):**
Sign up at https://upstash.com → create a Redis DB → copy the URL to .env

### Step 4 — Start the backend server
```bash
npm run dev
# Server starts on http://localhost:3001
```

### Step 5 — Start the video worker (separate terminal)
```bash
npm run dev:worker
# Worker starts and waits for jobs
```

---

## 🔑 Getting Your API Keys

### Runway ML (primary model)
1. Go to https://app.runwayml.com
2. Create account → Settings → API Keys
3. Create new key → copy to `RUNWAY_API_KEY` in .env
4. Free tier gives you some credits to test with

### Kling AI (optional fallback)
1. Go to https://klingai.com/developers
2. Register → API Keys → copy to `KLING_API_KEY`

### Redis (job queue)
- Local: Install Redis, use `redis://localhost:6379`
- Cloud (free): https://upstash.com

### AWS S3 (video storage)
1. Create AWS account → S3 → Create bucket named `darsanai-videos`
2. IAM → Create user with S3 permissions → copy Access Key + Secret

**Cheaper alternative — Cloudflare R2:**
- Same S3 API, cheaper pricing, free egress
- https://developers.cloudflare.com/r2

---

## 🔌 API Reference

### Generate a video from text
```
POST /api/generate/text
Headers: x-user-id: your-user-id
Body: {
  "prompt": "A lone astronaut on Mars at sunset",
  "style": "Cinematic",
  "duration": 5,
  "resolution": "1080p",
  "model": "runway",
  "cameraMotion": "Dolly In"
}
Response: { "jobId": "uuid", "message": "..." }
```

### Generate a video from image
```
POST /api/generate/image
Headers: x-user-id: your-user-id
Body (multipart/form-data): {
  image: <file>,
  prompt: "Wind blowing through the trees",
  duration: 5
}
Response: { "jobId": "uuid", "imageUrl": "..." }
```

### Poll job status (call every 3 seconds)
```
GET /api/jobs/:jobId
Headers: x-user-id: your-user-id
Response: {
  "status": "processing",   // queued | processing | completed | failed
  "progress": 45,           // 0-100
  "videoUrl": null,         // populated when status = completed
  "error": null
}
```

### Get all videos (user gallery)
```
GET /api/videos
Headers: x-user-id: your-user-id
Response: { "total": 8, "videos": [...] }
```

### Get user credits
```
GET /api/users/me
Headers: x-user-id: your-user-id
Response: { "credits": { "available": 172, "total": 300 }, "stats": {...} }
```

---

## 🔗 Connecting to Your React Frontend

In your React app, call the backend like this:

```javascript
// Generate a video
async function generateVideo(prompt) {
  const response = await fetch('http://localhost:3001/api/generate/text', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': 'user-123',   // replace with real auth token
    },
    body: JSON.stringify({ prompt, style: 'Cinematic', duration: 5 }),
  });
  const data = await response.json();
  return data.jobId;  // use this to poll for status
}

// Poll for status
async function pollJob(jobId) {
  const response = await fetch(`http://localhost:3001/api/jobs/${jobId}`, {
    headers: { 'x-user-id': 'user-123' },
  });
  return response.json();
}

// Usage
const jobId = await generateVideo("Neon Tokyo street in the rain");
const interval = setInterval(async () => {
  const status = await pollJob(jobId);
  console.log(`Progress: ${status.progress}%`);
  if (status.status === 'completed') {
    clearInterval(interval);
    console.log('Video URL:', status.videoUrl);
  }
  if (status.status === 'failed') {
    clearInterval(interval);
    console.error('Failed:', status.error);
  }
}, 3000);
```

---

## 🚀 Deploying to Production

### Backend → Railway.app (easiest)
```bash
npm install -g @railway/cli
railway login
railway init
railway up
railway variables set RUNWAY_API_KEY=xxx REDIS_URL=xxx ...
```

### Backend → Render.com (free tier available)
1. Push code to GitHub
2. New Web Service → connect repo
3. Build command: `npm install`
4. Start command: `npm start`
5. Add environment variables in dashboard

### Worker → Also deploy separately on Railway
Set start command to: `node src/workers/videoWorker.js`

---

## 📈 Next Steps After Backend

1. ✅ Backend + Runway API  ← YOU ARE HERE
2. 🔐 Add Clerk auth (replace x-user-id header with real JWT)
3. 💳 Add Stripe payments + credit system
4. 🗄️ Replace in-memory jobStore with PostgreSQL
5. 🚀 Deploy everything to production

---

*Built for darsanai — Cinematic AI Video Generation*

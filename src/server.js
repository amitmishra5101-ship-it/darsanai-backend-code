// ─────────────────────────────────────────────────────────────
// darsanai.AI — Main Server
// ─────────────────────────────────────────────────────────────
require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');

const generateRoutes = require('./routes/generate');
const jobRoutes      = require('./routes/jobs');
const videoRoutes    = require('./routes/videos');
const userRoutes     = require('./routes/users');
const webhookRoutes  = require('./routes/webhooks');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── SECURITY MIDDLEWARE ───────────────────────────────────────
app.use(helmet());

app.use(cors({
 origin: function(origin, callback) {
  const allowed = [
    'https://darsanai.com',
    'https://www.darsanai.com',
    'http://localhost:5173'
  ];
  if (!origin || allowed.includes(origin)) callback(null, true);
  else callback(new Error('Not allowed by CORS'));
},
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── RATE LIMITING ─────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 100,                    // 100 requests per window
  message: { error: 'Too many requests. Please slow down.' },
});

const generateLimiter = rateLimit({
  windowMs: 60 * 1000,         // 1 minute
  max: 5,                      // max 5 generate requests per minute
  message: { error: 'Generation rate limit exceeded. Wait a moment.' },
});

app.use(globalLimiter);
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── HEALTH CHECK ──────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'darsanai-backend',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// ── ROUTES ────────────────────────────────────────────────────
app.use('/api/generate', generateLimiter, generateRoutes);
app.use('/api/jobs',     jobRoutes);
app.use('/api/videos',   videoRoutes);
app.use('/api/users',    userRoutes);
app.use('/webhooks',     webhookRoutes);

// ── 404 HANDLER ───────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── GLOBAL ERROR HANDLER ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ── START ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🎬 darsanai Backend running on http://localhost:${PORT}`);
  console.log(`📋 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL}\n`);
});

module.exports = app;

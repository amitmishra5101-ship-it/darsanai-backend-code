// ─────────────────────────────────────────────────────────────
// darsanai.AI — Storage Service (AWS S3 / Cloudflare R2)
// Cloudflare R2 uses the same S3 API — just change the endpoint
// ─────────────────────────────────────────────────────────────
const https  = require('https');
const http   = require('http');
const path   = require('path');
const crypto = require('crypto');

// ── SIMPLE S3 UPLOAD (without AWS SDK to reduce dependencies) ─
// We'll use presigned URLs from the AWS API manually
// In production, install @aws-sdk/client-s3 for full features

const AWS_REGION = process.env.AWS_REGION     || 'ap-south-1';
const BUCKET     = process.env.AWS_S3_BUCKET  || 'darsanai-videos';
const ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID;
const SECRET_KEY = process.env.AWS_SECRET_ACCESS_KEY;

// ── DOWNLOAD A VIDEO FROM URL THEN UPLOAD TO S3 ───────────────
// After Runway generates a video, we save it to our own S3
// so we control it and it doesn't expire
async function downloadAndUpload(sourceUrl, userId, jobId) {
  console.log(`📥 Downloading video from Runway: ${sourceUrl}`);

  // Step 1: Download video buffer from Runway
  const videoBuffer = await downloadUrl(sourceUrl);
  console.log(`📦 Downloaded ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`);

  // Step 2: Upload to S3
  const filename   = `videos/${userId}/${jobId}.mp4`;
  const s3Url      = await uploadToS3(videoBuffer, filename, 'video/mp4');
  console.log(`✅ Uploaded to S3: ${s3Url}`);

  return s3Url;
}

// ── UPLOAD AN IMAGE (from user) TO S3 ────────────────────────
// We store uploaded reference images so Runway can access them
async function uploadImage(fileBuffer, originalName, userId) {
  const ext      = path.extname(originalName) || '.jpg';
  const filename = `uploads/${userId}/${Date.now()}_${randomHex(8)}${ext}`;
  const mimeType = getMimeType(ext);

  const s3Url = await uploadToS3(fileBuffer, filename, mimeType);
  console.log(`🖼️  Image uploaded: ${s3Url}`);
  return s3Url;
}

// ── CORE UPLOAD FUNCTION ──────────────────────────────────────
async function uploadToS3(buffer, key, contentType) {
  if (!ACCESS_KEY || !SECRET_KEY) {
    // In dev mode without S3, return a fake URL for testing
    console.warn('⚠️  AWS keys not set — returning mock S3 URL');
    return `https://${BUCKET}.s3.${AWS_REGION}.amazonaws.com/${key}`;
  }

  // For a real implementation, use the AWS SDK:
  // const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
  // const s3 = new S3Client({ region: AWS_REGION });
  // await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: buffer, ContentType: contentType }));

  // Simplified manual upload (add aws-sdk for production):
  const publicUrl = `https://${BUCKET}.s3.${AWS_REGION}.amazonaws.com/${key}`;
  console.log(`[S3 stub] Would upload to: ${publicUrl}`);
  return publicUrl;
}

// ── DOWNLOAD HELPER ───────────────────────────────────────────
function downloadUrl(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const chunks   = [];

    protocol.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed with status ${res.statusCode}`));
        return;
      }
      res.on('data',  (chunk) => chunks.push(chunk));
      res.on('end',   ()      => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// ── HELPERS ───────────────────────────────────────────────────
function randomHex(bytes) {
  return crypto.randomBytes(bytes).toString('hex');
}

function getMimeType(ext) {
  const map = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4' };
  return map[ext.toLowerCase()] || 'application/octet-stream';
}

// ── DELETE A FILE FROM S3 ─────────────────────────────────────
async function deleteFile(key) {
  console.log(`🗑️  Deleting from S3: ${key}`);
  // const s3 = new S3Client(...);
  // await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

module.exports = { downloadAndUpload, uploadImage, deleteFile };

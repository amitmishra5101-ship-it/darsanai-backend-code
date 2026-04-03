const express = require('express');
const router = express.Router();
const FormData = require('form-data');
const fetch = require('node-fetch');

// POST /api/voice/clone
router.post('/clone', async (req, res) => {
  try {
    const { name, audioBase64, mimeType } = req.body;
    if (!name || !audioBase64) {
      return res.status(400).json({ error: 'name and audioBase64 are required' });
    }
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const form = new FormData();
    form.append('name', name);
    form.append('files', audioBuffer, { filename: 'voice.wav', contentType: mimeType || 'audio/wav' });
    const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, ...form.getHeaders() },
      body: form
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data });
    res.json({ voice_id: data.voice_id, name: data.name });
  } catch (err) {
    console.error('Voice clone error:', err);
    res.status(500).json({ error: 'Voice clone failed' });
  }
});

// GET /api/voice/list
router.get('/list', async (req, res) => {
  try {
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }
    });
    const data = await response.json();
    res.json(data.voices || []);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch voices' });
  }
});

module.exports = router;
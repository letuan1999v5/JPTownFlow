// Cloud Run service for downloading YouTube audio using yt-dlp
const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const admin = require('firebase-admin');

const execPromise = promisify(exec);

// Initialize Firebase Admin with Storage bucket
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  storageBucket: 'jp-town-flow-app.appspot.com',
});

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const PORT = process.env.PORT || 8080;
const TEMP_DIR = '/tmp/ytdl';

// Ensure temp directory exists
async function ensureTempDir() {
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating temp directory:', error);
  }
}

/**
 * Download YouTube audio using yt-dlp
 * POST /download
 * Body: { videoId: string, userId: string }
 */
app.post('/download', async (req, res) => {
  const { videoId, userId } = req.body;

  if (!videoId || !userId) {
    return res.status(400).json({
      success: false,
      error: 'Missing videoId or userId',
    });
  }

  console.log(`Downloading audio for video: ${videoId}, user: ${userId}`);

  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const outputPath = path.join(TEMP_DIR, `${videoId}.mp3`);

  try {
    // Ensure temp directory exists
    await ensureTempDir();

    // Download audio using yt-dlp
    // Options:
    // -x: Extract audio
    // --audio-format mp3: Convert to MP3
    // --audio-quality 9: Lowest quality (smallest file)
    // -o: Output template
    // --no-playlist: Don't download playlist
    const ytdlCommand = `yt-dlp -x --audio-format mp3 --audio-quality 9 -o "${outputPath}" --no-playlist "${videoUrl}"`;

    console.log('Executing yt-dlp command...');
    const { stdout, stderr } = await execPromise(ytdlCommand, {
      timeout: 300000, // 5 minutes timeout
    });

    console.log('yt-dlp stdout:', stdout);
    if (stderr) {
      console.log('yt-dlp stderr:', stderr);
    }

    // Check if file was downloaded
    const stats = await fs.stat(outputPath);
    if (!stats || stats.size === 0) {
      throw new Error('Downloaded file is empty or does not exist');
    }

    console.log(`Audio downloaded: ${stats.size} bytes`);

    // Upload to Firebase Storage
    const bucket = admin.storage().bucket();
    const storagePath = `temp-audio/${userId}/${videoId}.mp3`;
    const destination = bucket.file(storagePath);

    await bucket.upload(outputPath, {
      destination: storagePath,
      metadata: {
        contentType: 'audio/mpeg',
        metadata: {
          videoId,
          userId,
        },
      },
    });

    console.log(`✅ Uploaded to Storage: ${storagePath}`);

    // Get duration from yt-dlp info
    let durationSeconds = 0;
    try {
      const infoCommand = `yt-dlp --print duration "${videoUrl}"`;
      const { stdout: durationOutput } = await execPromise(infoCommand);
      durationSeconds = parseInt(durationOutput.trim()) || 0;
      console.log(`Video duration: ${durationSeconds}s`);
    } catch (error) {
      console.warn('Failed to get duration, will calculate from audio:', error.message);
    }

    // Clean up local file
    try {
      await fs.unlink(outputPath);
      console.log('✅ Cleaned up local file');
    } catch (error) {
      console.warn('Failed to clean up local file:', error);
    }

    // Return success
    res.json({
      success: true,
      storagePath,
      durationSeconds,
      fileSize: stats.size,
    });

  } catch (error) {
    console.error('Error downloading audio:', error);

    // Clean up on error
    try {
      await fs.unlink(outputPath);
    } catch (cleanupError) {
      // Ignore cleanup errors
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to download audio',
    });
  }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'ytdl-service' });
});

// Start server
app.listen(PORT, () => {
  console.log(`yt-dlp service listening on port ${PORT}`);
  ensureTempDir();
});

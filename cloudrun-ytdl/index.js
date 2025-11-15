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
 * Download YouTube subtitles (text only) using yt-dlp
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

  console.log(`Downloading subtitles for video: ${videoId}, user: ${userId}`);

  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const outputPath = path.join(TEMP_DIR, `${videoId}.srt`);

  try {
    // Ensure temp directory exists
    await ensureTempDir();

    // Download ONLY subtitles using yt-dlp (no audio/video download)
    // Multiple fallback strategies for subtitle extraction
    const strategies = [
      {
        name: 'Auto-generated subtitles (en)',
        args: '--write-auto-sub --sub-lang en --skip-download --sub-format srt',
      },
      {
        name: 'Manual subtitles (en)',
        args: '--write-sub --sub-lang en --skip-download --sub-format srt',
      },
      {
        name: 'Auto-generated subtitles (any language)',
        args: '--write-auto-sub --skip-download --sub-format srt',
      },
      {
        name: 'Manual subtitles (any language)',
        args: '--write-sub --skip-download --sub-format srt',
      },
    ];

    let lastError = null;
    let downloadSuccess = false;
    let actualSubtitlePath = null;

    for (const strategy of strategies) {
      try {
        console.log(`Trying strategy: ${strategy.name}`);

        // Build yt-dlp command for subtitle download only
        // --write-auto-sub: Download auto-generated subtitles
        // --write-sub: Download manual subtitles
        // --skip-download: Skip video/audio download
        // --sub-format srt: Subtitle format
        // -o: Output template
        const ytdlCommand = `yt-dlp ${strategy.args} -o "${TEMP_DIR}/${videoId}" "${videoUrl}"`;

        console.log(`Executing: ${ytdlCommand}`);
        const { stdout, stderr } = await execPromise(ytdlCommand, {
          timeout: 60000, // 1 minute timeout (subtitles are fast)
        });

        console.log('yt-dlp stdout:', stdout);
        if (stderr) {
          console.log('yt-dlp stderr:', stderr);
        }

        // yt-dlp creates files like: {videoId}.en.srt or {videoId}.en.vtt
        // Find the subtitle file
        const files = await fs.readdir(TEMP_DIR);
        const subtitleFile = files.find(f =>
          f.startsWith(videoId) &&
          (f.endsWith('.srt') || f.endsWith('.vtt'))
        );

        if (subtitleFile) {
          actualSubtitlePath = path.join(TEMP_DIR, subtitleFile);
          const stats = await fs.stat(actualSubtitlePath);

          if (stats && stats.size > 0) {
            console.log(`✅ Success with ${strategy.name}: ${subtitleFile} (${stats.size} bytes)`);
            downloadSuccess = true;
            break;
          }
        }

        console.log(`No subtitle file found with ${strategy.name}, trying next...`);
      } catch (error) {
        console.log(`❌ Failed with ${strategy.name}: ${error.message}`);
        lastError = error;
        continue;
      }
    }

    if (!downloadSuccess || !actualSubtitlePath) {
      throw new Error(`All subtitle download strategies failed. Video may not have subtitles. Last error: ${lastError?.message || 'Unknown error'}`);
    }

    // Read subtitle content
    const subtitleContent = await fs.readFile(actualSubtitlePath, 'utf-8');

    if (!subtitleContent || subtitleContent.trim().length === 0) {
      throw new Error('Downloaded subtitle file is empty');
    }

    console.log(`Subtitle content length: ${subtitleContent.length} characters`);

    // Upload to Firebase Storage
    const bucket = admin.storage().bucket();
    const storagePath = `temp-subtitles/${userId}/${videoId}.srt`;
    const destination = bucket.file(storagePath);

    await destination.save(subtitleContent, {
      contentType: 'text/plain',
      metadata: {
        metadata: {
          videoId,
          userId,
        },
      },
    });

    console.log(`✅ Uploaded to Storage: ${storagePath}`);

    // Get video duration from yt-dlp info
    let durationSeconds = 0;
    try {
      const infoCommand = `yt-dlp --print duration "${videoUrl}"`;
      const { stdout: durationOutput } = await execPromise(infoCommand, {
        timeout: 30000,
      });
      durationSeconds = parseInt(durationOutput.trim()) || 0;
      console.log(`Video duration: ${durationSeconds}s`);
    } catch (error) {
      console.warn('Failed to get duration:', error.message);
    }

    // Clean up local file
    try {
      await fs.unlink(actualSubtitlePath);
      console.log('✅ Cleaned up local file');
    } catch (error) {
      console.warn('Failed to clean up local file:', error);
    }

    // Return success
    res.json({
      success: true,
      storagePath,
      durationSeconds,
      fileSize: subtitleContent.length,
    });

  } catch (error) {
    console.error('Error downloading subtitles:', error);

    // Clean up on error
    try {
      const files = await fs.readdir(TEMP_DIR);
      for (const file of files) {
        if (file.startsWith(videoId)) {
          await fs.unlink(path.join(TEMP_DIR, file));
        }
      }
    } catch (cleanupError) {
      // Ignore cleanup errors
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to download subtitles',
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

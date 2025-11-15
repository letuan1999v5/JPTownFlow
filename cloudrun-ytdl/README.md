# YouTube Subtitle Download Service (Cloud Run + yt-dlp)

Production-ready Cloud Run service for downloading YouTube subtitles (text only) using yt-dlp.

## Features

- ✅ Uses yt-dlp (well-maintained by large team)
- ✅ Downloads ONLY subtitles (no audio/video) - minimal ToS concerns
- ✅ Multiple fallback strategies:
  - Auto-generated subtitles (English)
  - Manual subtitles (English)
  - Auto-generated subtitles (any language)
  - Manual subtitles (any language)
- ✅ Uploads directly to Firebase Storage
- ✅ Auto-cleanup of temporary files
- ✅ Scalable with Cloud Run
- ✅ Fast (subtitles are small text files)

## Prerequisites

- Docker Desktop for Windows
- Google Cloud SDK
- Firebase project with Storage enabled

## Deployment (Windows 11)

### 1. Login to Google Cloud

```powershell
gcloud auth login
gcloud config set project jp-town-flow-app
```

### 2. Enable Required APIs

```powershell
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com
gcloud services enable artifactregistry.googleapis.com
```

### 3. Build and Push Docker Image

```powershell
# Build image
gcloud builds submit --tag gcr.io/jp-town-flow-app/ytdl-service

# Or build locally and push
docker build -t gcr.io/jp-town-flow-app/ytdl-service .
docker push gcr.io/jp-town-flow-app/ytdl-service
```

### 4. Deploy to Cloud Run

```powershell
gcloud run deploy ytdl-service `
  --image gcr.io/jp-town-flow-app/ytdl-service `
  --platform managed `
  --region us-central1 `
  --memory 2Gi `
  --timeout 540 `
  --max-instances 10 `
  --allow-unauthenticated
```

### 5. Get Service URL

```powershell
gcloud run services describe ytdl-service --region us-central1 --format 'value(status.url)'
```

Save this URL - you'll need it for Cloud Function configuration.

## API Endpoints

### POST /download

Download YouTube subtitles (text only) and upload to Firebase Storage.

**Request:**
```json
{
  "videoId": "VIDEO_ID",
  "userId": "USER_ID"
}
```

**Response:**
```json
{
  "success": true,
  "storagePath": "temp-subtitles/userId/videoId.srt",
  "durationSeconds": 600,
  "fileSize": 45678
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "service": "ytdl-service"
}
```

## Cost Estimation

Cloud Run pricing (us-central1):
- CPU: $0.00002400 / vCPU-second
- Memory: $0.00000250 / GiB-second
- Requests: $0.40 / million

Example: 10-minute video download (~30 seconds processing)
- Cost: ~$0.001 per video

## Monitoring

View logs:
```powershell
gcloud run services logs read ytdl-service --region us-central1
```

## Troubleshooting

**Error: Permission denied**
```powershell
gcloud auth application-default login
```

**Error: Docker not running**
- Start Docker Desktop

**Error: Timeout**
- Increase `--timeout` to 600 (10 minutes)

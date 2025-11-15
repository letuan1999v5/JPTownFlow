// components/video/YouTubeSubtitlePlayer.tsx
// YouTube player with custom subtitle overlay using WebView
import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { SubtitleCue } from '../../types/subtitle';

interface YouTubeSubtitlePlayerProps {
  videoUrl: string; // YouTube URL (e.g., https://www.youtube.com/watch?v=VIDEO_ID)
  subtitles: SubtitleCue[];
  onError?: (error: any) => void;
  onEnd?: () => void;
}

export default function YouTubeSubtitlePlayer({
  videoUrl,
  subtitles,
  onError,
  onEnd,
}: YouTubeSubtitlePlayerProps) {
  const [currentSubtitle, setCurrentSubtitle] = useState<string>('');
  const webViewRef = useRef<WebView>(null);
  const [playerReady, setPlayerReady] = useState(false);

  // Extract video ID from YouTube URL
  const getVideoId = (url: string): string | null => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
      /youtube\.com\/embed\/([^&\n?#]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  };

  const videoId = getVideoId(videoUrl);

  if (!videoId) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Invalid YouTube URL</Text>
      </View>
    );
  }

  // Convert SRT time format (HH:MM:SS,mmm) to seconds
  const srtTimeToSeconds = (srtTime: string): number => {
    const parts = srtTime.replace(',', '.').split(':');
    const hours = parseInt(parts[0]);
    const minutes = parseInt(parts[1]);
    const seconds = parseFloat(parts[2]);
    return hours * 3600 + minutes * 60 + seconds;
  };

  // Convert subtitles to WebVTT format for YouTube player
  const subtitlesToWebVTT = (subs: SubtitleCue[]): string => {
    let vtt = 'WEBVTT\n\n';

    subs.forEach((sub) => {
      const start = srtTimeToSeconds(sub.startTime).toFixed(3);
      const end = srtTimeToSeconds(sub.endTime).toFixed(3);

      vtt += `${sub.index}\n`;
      vtt += `${start} --> ${end}\n`;
      vtt += `${sub.text}\n\n`;
    });

    return vtt;
  };

  // Generate WebVTT blob URL
  const vttContent = subtitlesToWebVTT(subtitles);
  const vttBlob = `data:text/vtt;base64,${btoa(unescape(encodeURIComponent(vttContent)))}`;

  // HTML template with YouTube iframe and custom subtitle overlay
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      background: #000;
      overflow: hidden;
      font-family: Arial, sans-serif;
    }

    #player-container {
      position: relative;
      width: 100vw;
      height: 100vh;
      background: #000;
    }

    #player {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
    }

    #subtitle-overlay {
      position: absolute;
      bottom: 80px;
      left: 0;
      right: 0;
      text-align: center;
      pointer-events: none;
      z-index: 1000;
      padding: 0 20px;
    }

    #subtitle-text {
      display: inline-block;
      background: rgba(0, 0, 0, 0.8);
      color: #fff;
      font-size: 18px;
      line-height: 1.4;
      padding: 8px 16px;
      border-radius: 4px;
      max-width: 90%;
      word-wrap: break-word;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.8);
    }

    .hidden {
      display: none;
    }
  </style>
</head>
<body>
  <div id="player-container">
    <div id="player"></div>
    <div id="subtitle-overlay">
      <div id="subtitle-text" class="hidden"></div>
    </div>
  </div>

  <script>
    // Subtitles data
    const subtitles = ${JSON.stringify(subtitles)};

    // Convert SRT time to seconds
    function srtTimeToSeconds(srtTime) {
      const parts = srtTime.replace(',', '.').split(':');
      const hours = parseInt(parts[0]);
      const minutes = parseInt(parts[1]);
      const seconds = parseFloat(parts[2]);
      return hours * 3600 + minutes * 60 + seconds;
    }

    // Convert subtitles to timeline
    const timeline = subtitles.map(sub => ({
      start: srtTimeToSeconds(sub.startTime),
      end: srtTimeToSeconds(sub.endTime),
      text: sub.text
    }));

    // Current subtitle index
    let currentSubIndex = -1;

    // YouTube Player API
    let player;
    let updateInterval;

    // Load YouTube iframe API
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

    // Initialize player when API is ready
    function onYouTubeIframeAPIReady() {
      player = new YT.Player('player', {
        videoId: '${videoId}',
        playerVars: {
          autoplay: 1,
          controls: 1,
          modestbranding: 1,
          rel: 0,
          showinfo: 0,
          fs: 1,
          playsinline: 1
        },
        events: {
          onReady: onPlayerReady,
          onStateChange: onPlayerStateChange,
          onError: onPlayerError
        }
      });
    }

    function onPlayerReady(event) {
      console.log('YouTube player ready');
      window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'ready' }));
      startSubtitleSync();
    }

    function onPlayerStateChange(event) {
      // YT.PlayerState.ENDED = 0
      if (event.data === 0) {
        window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'ended' }));
      }

      // Start/stop subtitle sync based on play state
      if (event.data === 1) { // Playing
        startSubtitleSync();
      } else {
        stopSubtitleSync();
      }
    }

    function onPlayerError(event) {
      console.error('YouTube player error:', event.data);
      window.ReactNativeWebView?.postMessage(JSON.stringify({
        type: 'error',
        error: 'Player error: ' + event.data
      }));
    }

    // Subtitle synchronization
    function startSubtitleSync() {
      if (updateInterval) return;

      updateInterval = setInterval(() => {
        if (!player || !player.getCurrentTime) return;

        const currentTime = player.getCurrentTime();
        updateSubtitle(currentTime);
      }, 100); // Update every 100ms for smooth subtitle transitions
    }

    function stopSubtitleSync() {
      if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
      }
    }

    function updateSubtitle(currentTime) {
      const subtitleElement = document.getElementById('subtitle-text');

      // Find current subtitle
      let foundIndex = -1;
      for (let i = 0; i < timeline.length; i++) {
        if (currentTime >= timeline[i].start && currentTime <= timeline[i].end) {
          foundIndex = i;
          break;
        }
      }

      // Update subtitle if changed
      if (foundIndex !== currentSubIndex) {
        currentSubIndex = foundIndex;

        if (foundIndex >= 0) {
          subtitleElement.textContent = timeline[foundIndex].text;
          subtitleElement.classList.remove('hidden');
        } else {
          subtitleElement.classList.add('hidden');
        }
      }
    }

    // Cleanup on unload
    window.addEventListener('beforeunload', () => {
      stopSubtitleSync();
      if (player && player.destroy) {
        player.destroy();
      }
    });
  </script>
</body>
</html>
  `;

  // Handle messages from WebView
  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      switch (data.type) {
        case 'ready':
          setPlayerReady(true);
          break;
        case 'ended':
          onEnd?.();
          break;
        case 'error':
          onError?.(new Error(data.error));
          break;
      }
    } catch (error) {
      console.error('Error parsing WebView message:', error);
    }
  };

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html: htmlContent }}
        style={styles.webview}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        onMessage={handleMessage}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('WebView error:', nativeEvent);
          onError?.(new Error('WebView error'));
        }}
        scrollEnabled={false}
        bounces={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: Dimensions.get('window').width * (9 / 16), // 16:9 aspect ratio
    backgroundColor: '#000',
  },
  webview: {
    flex: 1,
    backgroundColor: '#000',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
  },
});

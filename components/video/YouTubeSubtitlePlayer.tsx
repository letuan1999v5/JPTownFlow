// components/video/YouTubeSubtitlePlayer.tsx
// YouTube player with custom subtitle overlay using direct iframe embed
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, Dimensions, Text, Platform } from 'react-native';
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
  const webViewRef = useRef<WebView>(null);
  const [dimensions, setDimensions] = useState(Dimensions.get('window'));
  const [currentSubtitle, setCurrentSubtitle] = useState<string>('');

  // Listen to orientation/dimension changes
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setDimensions(window);
    });

    return () => subscription?.remove();
  }, []);

  // Detect if landscape mode
  const isLandscape = dimensions.width > dimensions.height;

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

  // Convert SRT time to seconds
  const srtTimeToSeconds = (srtTime: string): number => {
    try {
      const parts = srtTime.replace(',', '.').split(':');
      const hours = parseInt(parts[0]) || 0;
      const minutes = parseInt(parts[1]) || 0;
      const seconds = parseFloat(parts[2]) || 0;
      return hours * 3600 + minutes * 60 + seconds;
    } catch (e) {
      return 0;
    }
  };

  // Memoize HTML content to prevent WebView reload on orientation change
  const htmlContent = useMemo(() => {
    // Convert subtitles to timeline
    const timeline = subtitles.map(sub => ({
      start: srtTimeToSeconds(sub.startTime),
      end: srtTimeToSeconds(sub.endTime),
      text: sub.text
    }));

    // HTML with YouTube iframe API and custom subtitle overlay
    return `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval'; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src *; img-src * data: blob:; frame-src *; style-src * 'unsafe-inline';">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    html, body {
      width: 100%;
      height: 100%;
      background: #000;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    }

    #container {
      position: relative;
      width: 100%;
      height: 100%;
      background: #000;
    }

    #youtube-player {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
    }

    #youtube-player iframe {
      width: 100%;
      height: 100%;
      border: 0;
    }

    /* Subtitle overlay - use absolute positioning to stay within container */
    #subtitle-overlay {
      position: absolute;
      bottom: 12px; /* Close to bottom, aligned with fullscreen button */
      left: 0;
      right: 0;
      text-align: center;
      pointer-events: none;
      z-index: 999998 !important; /* Below fullscreen button */
      padding: 0 16px 0 16px; /* Extra padding on right to avoid button */
      padding-right: 60px; /* Space for fullscreen button */
      transform: translateZ(999px) !important; /* Create new stacking context on top */
      isolation: isolate; /* Create isolated stacking context */
      will-change: transform; /* GPU acceleration */
    }

    #subtitle-text {
      display: inline-block;
      background: rgba(0, 0, 0, 0.7); /* Semi-transparent background */
      color: #fff;
      font-size: 14px;
      font-weight: 600; /* Bolder for better readability */
      line-height: 1.4;
      padding: 8px 14px;
      border-radius: 4px;
      max-width: 90%;
      word-wrap: break-word;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 1);
      box-shadow: 0 3px 10px rgba(0, 0, 0, 0.8);
    }

    /* Landscape mode - responsive via CSS media query */
    @media (orientation: landscape) {
      #subtitle-overlay {
        bottom: 15px; /* Close to bottom in landscape */
        padding: 0 30px;
        padding-right: 70px; /* More space for button in landscape */
      }

      #subtitle-text {
        font-size: 16px;
        padding: 10px 18px;
        max-width: 85%;
      }
    }

    .hidden {
      display: none !important;
    }

    /* Custom fullscreen button - positioned like YouTube's native button */
    #custom-fullscreen-btn {
      position: absolute;
      bottom: 12px;
      right: 12px;
      width: 36px;
      height: 36px;
      background: rgba(28, 28, 28, 0.85);
      border: none;
      border-radius: 2px;
      cursor: pointer;
      z-index: 9999999 !important; /* Highest z-index - always on top */
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: auto;
      transition: background 0.15s;
      opacity: 0.9;
    }

    #custom-fullscreen-btn:hover {
      background: rgba(28, 28, 28, 0.95);
      opacity: 1;
    }

    #custom-fullscreen-btn:active {
      background: rgba(50, 50, 50, 1);
    }

    #custom-fullscreen-btn svg {
      fill: white;
      width: 20px;
      height: 20px;
    }

    /* In fullscreen mode, move button to bottom-right */
    #container:fullscreen #custom-fullscreen-btn,
    #container:-webkit-full-screen #custom-fullscreen-btn,
    #container:-moz-full-screen #custom-fullscreen-btn,
    #container:-ms-fullscreen #custom-fullscreen-btn {
      bottom: 20px;
      right: 20px;
    }

    /* When container is in fullscreen */
    #container:fullscreen #subtitle-overlay,
    #container:-webkit-full-screen #subtitle-overlay,
    #container:-moz-full-screen #subtitle-overlay,
    #container:-ms-fullscreen #subtitle-overlay {
      position: fixed !important;
      bottom: 25px !important; /* Close to bottom in fullscreen */
      left: 0 !important;
      right: 0 !important;
      padding: 0 20px !important;
      padding-right: 80px !important; /* Space for button in fullscreen */
      z-index: 999998 !important; /* Below fullscreen button */
      transform: translateZ(9999px) !important;
    }

    #container:fullscreen,
    #container:-webkit-full-screen,
    #container:-moz-full-screen,
    #container:-ms-fullscreen {
      width: 100vw !important;
      height: 100vh !important;
    }
  </style>
</head>
<body>
  <div id="container">
    <!-- YouTube player will be inserted here -->
    <div id="youtube-player"></div>

    <!-- Custom fullscreen button -->
    <button id="custom-fullscreen-btn" onclick="toggleFullscreen()" aria-label="Fullscreen">
      <!-- Fullscreen expand icon -->
      <svg id="expand-icon" viewBox="0 0 24 24">
        <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
      </svg>
      <!-- Fullscreen exit icon (hidden by default) -->
      <svg id="compress-icon" viewBox="0 0 24 24" style="display: none;">
        <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
      </svg>
    </button>

    <!-- Subtitle overlay inside container for fullscreen support -->
    <div id="subtitle-overlay">
      <div id="subtitle-text" class="hidden"></div>
    </div>
  </div>

  <script>
    const timeline = ${JSON.stringify(timeline)};
    let currentSubIndex = -1;
    let player = null;
    let updateInterval = null;

    // Load YouTube iframe API
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

    // Initialize player when API is ready
    window.onYouTubeIframeAPIReady = function() {
      player = new YT.Player('youtube-player', {
        videoId: '${videoId}',
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 1,
          controls: 1,
          modestbranding: 1,
          rel: 0,
          cc_load_policy: 0,
          iv_load_policy: 3,
          playsinline: 1,
          fs: 0 // Disable YouTube's fullscreen button
        },
        events: {
          'onReady': onPlayerReady,
          'onStateChange': onPlayerStateChange,
          'onError': onPlayerError
        }
      });
    };

    function onPlayerReady(event) {
      console.log('YouTube player ready');
      window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'ready' }));
      startSubtitleSync();
    }

    function onPlayerStateChange(event) {
      // YT.PlayerState: UNSTARTED=-1, ENDED=0, PLAYING=1, PAUSED=2, BUFFERING=3, CUED=5
      if (event.data === YT.PlayerState.PLAYING) {
        console.log('Video playing - start subtitle sync');
        startSubtitleSync();
      } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.BUFFERING) {
        console.log('Video paused/buffering - stop subtitle sync');
        stopSubtitleSync();
      } else if (event.data === YT.PlayerState.ENDED) {
        console.log('Video ended');
        stopSubtitleSync();
        window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'ended' }));
      }
    }

    function onPlayerError(event) {
      console.error('YouTube player error:', event.data);
      const errorMessages = {
        2: 'Invalid video ID',
        5: 'HTML5 player error',
        100: 'Video not found or private',
        101: 'Embedding disabled by owner',
        150: 'Embedding disabled by owner',
        153: 'Embedding disabled by owner'
      };
      const errorMsg = errorMessages[event.data] || 'Unknown error: ' + event.data;
      window.ReactNativeWebView?.postMessage(JSON.stringify({
        type: 'error',
        error: errorMsg
      }));
    }

    // Start subtitle sync using actual video time
    function startSubtitleSync() {
      if (updateInterval) return; // Already running

      updateInterval = setInterval(() => {
        if (!player || typeof player.getCurrentTime !== 'function') {
          return;
        }

        try {
          // Get actual video playback time (handles ads, pause, buffering automatically)
          const currentTime = player.getCurrentTime();
          updateSubtitle(currentTime);
        } catch (error) {
          console.error('Error getting current time:', error);
        }
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
      if (!subtitleElement) return;

      // Find current subtitle based on actual video time
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

    // Toggle fullscreen for the entire container (video + subtitles)
    function toggleFullscreen() {
      const container = document.getElementById('container');
      const expandIcon = document.getElementById('expand-icon');
      const compressIcon = document.getElementById('compress-icon');

      const isFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );

      if (!isFullscreen) {
        // Enter fullscreen
        if (container.requestFullscreen) {
          container.requestFullscreen();
        } else if (container.webkitRequestFullscreen) {
          container.webkitRequestFullscreen();
        } else if (container.mozRequestFullScreen) {
          container.mozRequestFullScreen();
        } else if (container.msRequestFullscreen) {
          container.msRequestFullscreen();
        }

        console.log('✅ Entered fullscreen with container (includes subtitle)');
      } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
          document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
          document.msExitFullscreen();
        }

        console.log('✅ Exited fullscreen');
      }
    }

    // Handle fullscreen changes (toggle button icon)
    function handleFullscreenChange() {
      const expandIcon = document.getElementById('expand-icon');
      const compressIcon = document.getElementById('compress-icon');

      const isFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );

      if (isFullscreen) {
        expandIcon.style.display = 'none';
        compressIcon.style.display = 'block';
        console.log('📺 Fullscreen mode - subtitle overlay is inside container');
      } else {
        expandIcon.style.display = 'block';
        compressIcon.style.display = 'none';
        console.log('📺 Normal mode');
      }
    }

    // Listen for fullscreen changes
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    // Cleanup on unload
    window.addEventListener('beforeunload', () => {
      stopSubtitleSync();
      if (player && typeof player.destroy === 'function') {
        player.destroy();
      }

      // Remove fullscreen listeners
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    });

    // Handle errors
    window.addEventListener('error', (e) => {
      console.error('Error:', e);
      window.ReactNativeWebView?.postMessage(JSON.stringify({
        type: 'error',
        error: 'Player error: ' + e.message
      }));
    });
  </script>
</body>
</html>
    `;
  }, [videoId, subtitles]); // Only recreate if video or subtitles change

  // Handle messages from WebView
  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      switch (data.type) {
        case 'ready':
          console.log('Player ready');
          break;
        case 'error':
          console.error('Player error:', data.error);
          onError?.(new Error(data.error));
          break;
      }
    } catch (error) {
      console.error('Error parsing WebView message:', error);
    }
  };

  // Calculate container height based on orientation
  const containerHeight = isLandscape
    ? dimensions.height // Fullscreen in landscape
    : dimensions.width * (9 / 16); // 16:9 aspect ratio in portrait

  return (
    <View style={[styles.container, { height: containerHeight }]}>
      <WebView
        ref={webViewRef}
        source={{
          html: htmlContent,
          baseUrl: 'https://jptownflow.app' // Set proper origin for YouTube
        }}
        userAgent={Platform.OS === 'ios'
          ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
          : 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
        }
        style={styles.webview}
        allowsInlineMediaPlayback={true}
        allowsFullscreenVideo={true}
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        onMessage={handleMessage}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('WebView error:', nativeEvent);
        }}
        scrollEnabled={false}
        bounces={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        mixedContentMode="always"
        androidLayerType="hardware"
        originWhitelist={['*']}
        allowUniversalAccessFromFileURLs={true}
        allowFileAccess={true}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
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
    padding: 20,
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
});

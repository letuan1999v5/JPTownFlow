// components/video/YouTubeSubtitlePlayer.tsx
// YouTube player with custom subtitle overlay using WebView
import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Text, Platform, TouchableOpacity, Linking } from 'react-native';
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
  const [playerReady, setPlayerReady] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

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

    html, body {
      width: 100%;
      height: 100%;
      background: #000;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    }

    #player-container {
      position: relative;
      width: 100%;
      height: 100%;
      background: #000;
    }

    #player {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
    }

    /* Subtitle overlay - positioned at bottom with responsive sizing */
    #subtitle-overlay {
      position: fixed;
      bottom: ${isLandscape ? '60px' : '80px'};
      left: 0;
      right: 0;
      text-align: center;
      pointer-events: none;
      z-index: 9999;
      padding: 0 ${isLandscape ? '60px' : '20px'};
    }

    #subtitle-text {
      display: inline-block;
      background: rgba(0, 0, 0, 0.85);
      color: #fff;
      font-size: ${isLandscape ? '20px' : '18px'};
      font-weight: 500;
      line-height: 1.5;
      padding: ${isLandscape ? '10px 20px' : '8px 16px'};
      border-radius: 6px;
      max-width: ${isLandscape ? '85%' : '90%'};
      word-wrap: break-word;
      text-shadow: 2px 2px 6px rgba(0, 0, 0, 0.9);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    }

    .hidden {
      display: none !important;
    }

    /* Ensure fullscreen works properly */
    #player iframe {
      border: 0;
      width: 100%;
      height: 100%;
    }
  </style>
</head>
<body>
  <div id="player-container">
    <div id="player"></div>
  </div>

  <!-- Subtitle overlay outside player container to ensure it stays on top -->
  <div id="subtitle-overlay">
    <div id="subtitle-text" class="hidden"></div>
  </div>

  <script>
    // Subtitles data
    const subtitles = ${JSON.stringify(subtitles)};

    // Convert SRT time to seconds
    function srtTimeToSeconds(srtTime) {
      try {
        const parts = srtTime.replace(',', '.').split(':');
        const hours = parseInt(parts[0]) || 0;
        const minutes = parseInt(parts[1]) || 0;
        const seconds = parseFloat(parts[2]) || 0;
        return hours * 3600 + minutes * 60 + seconds;
      } catch (e) {
        console.error('Error parsing SRT time:', srtTime, e);
        return 0;
      }
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
      try {
        player = new YT.Player('player', {
          host: 'https://www.youtube-nocookie.com',
          videoId: '${videoId}',
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: 1,
            controls: 1,
            modestbranding: 1,
            rel: 0,
            showinfo: 0,
            fs: 1, // Enable fullscreen button
            playsinline: 1,
            cc_load_policy: 0, // Disable YouTube's default captions
            iv_load_policy: 3, // Disable annotations
            origin: window.location.origin || 'https://jp-town-flow-app.web.app',
            enablejsapi: 1
          },
          events: {
            onReady: onPlayerReady,
            onStateChange: onPlayerStateChange,
            onError: onPlayerError
          }
        });
      } catch (error) {
        console.error('Error creating YouTube player:', error);
        window.ReactNativeWebView?.postMessage(JSON.stringify({
          type: 'error',
          error: 'Failed to create player: ' + error.message
        }));
      }
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
      // YT.PlayerState.PLAYING = 1
      if (event.data === 1) {
        startSubtitleSync();
      } else {
        stopSubtitleSync();
      }
    }

    function onPlayerError(event) {
      console.error('YouTube player error:', event.data);
      const errorMessages = {
        2: 'Invalid video ID',
        5: 'HTML5 player error',
        100: 'Video not found or private',
        101: 'Video not allowed to be played in embedded players',
        150: 'Video not allowed to be played in embedded players',
        153: 'Video playback is restricted - this video may not support embedded playback'
      };

      const errorMsg = errorMessages[event.data] || 'Unknown error: ' + event.data;

      window.ReactNativeWebView?.postMessage(JSON.stringify({
        type: 'error',
        error: errorMsg
      }));
    }

    // Subtitle synchronization
    function startSubtitleSync() {
      if (updateInterval) return;

      updateInterval = setInterval(() => {
        try {
          if (!player || typeof player.getCurrentTime !== 'function') {
            return;
          }

          const currentTime = player.getCurrentTime();
          updateSubtitle(currentTime);
        } catch (error) {
          console.error('Error in subtitle sync:', error);
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
      if (player && typeof player.destroy === 'function') {
        player.destroy();
      }
    });

    // Log ready state
    console.log('YouTube player script loaded, waiting for API...');
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
          console.log('YouTube player ready');
          setPlayerReady(true);
          setHasError(false);
          break;
        case 'ended':
          console.log('Video ended');
          onEnd?.();
          break;
        case 'error':
          console.error('Player error:', data.error);
          setHasError(true);
          setErrorMessage(data.error);
          onError?.(new Error(data.error));
          break;
      }
    } catch (error) {
      console.error('Error parsing WebView message:', error);
    }
  };

  // Handle open in YouTube app
  const handleOpenInYouTube = () => {
    Linking.openURL(videoUrl).catch(err => {
      console.error('Failed to open YouTube:', err);
    });
  };

  // Calculate container height based on orientation
  const containerHeight = isLandscape
    ? dimensions.height // Fullscreen in landscape
    : dimensions.width * (9 / 16); // 16:9 aspect ratio in portrait

  return (
    <View style={[styles.container, { height: containerHeight }]}>
      {hasError ? (
        /* Fallback UI when player has error */
        <View style={styles.errorFallback}>
          <Text style={styles.errorTitle}>⚠️ Playback Restricted</Text>
          <Text style={styles.errorDescription}>{errorMessage}</Text>
          <Text style={styles.errorHint}>
            This video may not support embedded playback. Watch it on YouTube instead with your translated subtitles below.
          </Text>
          <TouchableOpacity style={styles.youtubeButton} onPress={handleOpenInYouTube}>
            <Text style={styles.youtubeButtonText}>▶ Open in YouTube</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <WebView
          ref={webViewRef}
          source={{ html: htmlContent }}
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
            setHasError(true);
            setErrorMessage('WebView failed to load');
            onError?.(new Error('WebView failed to load'));
          }}
          scrollEnabled={false}
          bounces={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          // Android specific settings
          mixedContentMode="always"
          androidLayerType="hardware"
        />
      )}
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
  errorFallback: {
    flex: 1,
    backgroundColor: '#1F2937',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    borderRadius: 12,
    margin: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FBBF24',
    marginBottom: 12,
    textAlign: 'center',
  },
  errorDescription: {
    fontSize: 14,
    color: '#F87171',
    marginBottom: 16,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorHint: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 20,
  },
  youtubeButton: {
    backgroundColor: '#EF4444',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  youtubeButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

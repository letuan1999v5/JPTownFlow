// components/video/YouTubeSubtitlePlayer.tsx
// YouTube player with custom subtitle overlay using direct iframe embed
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

  // Convert subtitles to timeline
  const timeline = subtitles.map(sub => ({
    start: srtTimeToSeconds(sub.startTime),
    end: srtTimeToSeconds(sub.endTime),
    text: sub.text
  }));

  // Build YouTube embed URL with parameters
  const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&controls=1&modestbranding=1&rel=0&fs=1&playsinline=1&cc_load_policy=0&iv_load_policy=3&enablejsapi=1&origin=https://jptownflow.app`;

  // HTML with direct iframe embed and custom subtitle overlay
  const htmlContent = `
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

    #youtube-iframe {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border: 0;
    }

    /* Subtitle overlay */
    #subtitle-overlay {
      position: fixed;
      bottom: ${isLandscape ? '70px' : '90px'};
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
      font-size: ${isLandscape ? '22px' : '20px'};
      font-weight: 500;
      line-height: 1.5;
      padding: ${isLandscape ? '12px 24px' : '10px 20px'};
      border-radius: 6px;
      max-width: ${isLandscape ? '85%' : '90%'};
      word-wrap: break-word;
      text-shadow: 2px 2px 6px rgba(0, 0, 0, 0.9);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
    }

    .hidden {
      display: none !important;
    }
  </style>
</head>
<body>
  <div id="container">
    <iframe
      id="youtube-iframe"
      src="${embedUrl}"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen
      referrerpolicy="strict-origin-when-cross-origin"
    ></iframe>
  </div>

  <div id="subtitle-overlay">
    <div id="subtitle-text" class="hidden"></div>
  </div>

  <script>
    const timeline = ${JSON.stringify(timeline)};
    let currentSubIndex = -1;
    let startTime = null;

    // Start subtitle sync
    function startSubtitleSync() {
      if (!startTime) {
        startTime = Date.now();
      }

      requestAnimationFrame(updateSubtitle);
    }

    function updateSubtitle() {
      if (!startTime) {
        requestAnimationFrame(updateSubtitle);
        return;
      }

      // Calculate current time (rough estimation based on elapsed time)
      const currentTime = (Date.now() - startTime) / 1000;

      const subtitleElement = document.getElementById('subtitle-text');
      if (!subtitleElement) {
        requestAnimationFrame(updateSubtitle);
        return;
      }

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

      requestAnimationFrame(updateSubtitle);
    }

    // Start when page loads
    window.addEventListener('load', () => {
      console.log('Page loaded, starting subtitle sync');
      setTimeout(startSubtitleSync, 1000); // Start after 1 second delay
      window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'ready' }));
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

      {/* Fallback button overlay */}
      <View style={styles.fallbackOverlay}>
        <TouchableOpacity style={styles.openYoutubeBtn} onPress={handleOpenInYouTube}>
          <Text style={styles.openYoutubeBtnText}>If video doesn't play, tap to open in YouTube ▶</Text>
        </TouchableOpacity>
      </View>
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
  fallbackOverlay: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 10,
    zIndex: 1,
  },
  openYoutubeBtn: {
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    alignSelf: 'center',
  },
  openYoutubeBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
});

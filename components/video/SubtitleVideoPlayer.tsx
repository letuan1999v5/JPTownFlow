// components/video/SubtitleVideoPlayer.tsx - Video player with subtitle overlay
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import Video, { VideoRef, OnProgressData, OnLoadData } from 'react-native-video';
import { Play, Pause, SkipBack, SkipForward, Maximize, Volume2, VolumeX } from 'lucide-react-native';
import { SubtitleCue } from '../../types/subtitle';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface SubtitleVideoPlayerProps {
  videoUrl: string; // YouTube video URL or uploaded video URI
  subtitles: SubtitleCue[];
  onError?: (error: any) => void;
  onEnd?: () => void;
}

export default function SubtitleVideoPlayer({
  videoUrl,
  subtitles,
  onError,
  onEnd,
}: SubtitleVideoPlayerProps) {
  const videoRef = useRef<VideoRef>(null);

  // Player state
  const [paused, setPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [buffering, setBuffering] = useState(false);
  const [muted, setMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [currentSubtitle, setCurrentSubtitle] = useState<SubtitleCue | null>(null);

  // Hide controls after 3 seconds
  useEffect(() => {
    if (showControls && !paused) {
      const timeout = setTimeout(() => {
        setShowControls(false);
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [showControls, paused]);

  // Convert SRT time format to seconds
  const srtTimeToSeconds = (time: string): number => {
    // Format: "00:00:10,000" or "00:00:10.000"
    const [hours, minutes, secondsWithMs] = time.split(':');
    const [seconds, milliseconds] = secondsWithMs.split(/[,\.]/);

    return (
      parseInt(hours, 10) * 3600 +
      parseInt(minutes, 10) * 60 +
      parseInt(seconds, 10) +
      parseInt(milliseconds, 10) / 1000
    );
  };

  // Find current subtitle based on time
  useEffect(() => {
    if (subtitles.length === 0) return;

    const current = subtitles.find((subtitle) => {
      const start = srtTimeToSeconds(subtitle.startTime);
      const end = srtTimeToSeconds(subtitle.endTime);
      return currentTime >= start && currentTime <= end;
    });

    setCurrentSubtitle(current || null);
  }, [currentTime, subtitles]);

  // Format time for display (MM:SS)
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle progress update
  const handleProgress = (data: OnProgressData) => {
    setCurrentTime(data.currentTime);
  };

  // Handle video load
  const handleLoad = (data: OnLoadData) => {
    setDuration(data.duration);
    setLoading(false);
  };

  // Handle buffer
  const handleBuffer = (data: { isBuffering: boolean }) => {
    setBuffering(data.isBuffering);
  };

  // Handle playback
  const togglePlayPause = () => {
    setPaused(!paused);
    setShowControls(true);
  };

  const handleSeekBack = () => {
    const newTime = Math.max(0, currentTime - 10);
    videoRef.current?.seek(newTime);
    setShowControls(true);
  };

  const handleSeekForward = () => {
    const newTime = Math.min(duration, currentTime + 10);
    videoRef.current?.seek(newTime);
    setShowControls(true);
  };

  const toggleMute = () => {
    setMuted(!muted);
    setShowControls(true);
  };

  const handleScreenTouch = () => {
    setShowControls(!showControls);
  };

  // Get YouTube video ID for direct streaming
  const getYouTubeStreamUrl = (url: string): string => {
    // For YouTube videos, we'll use YouTube iframe API or direct stream
    // This is a simplified version - in production, you may need a backend to get stream URLs
    const videoIdMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
    if (videoIdMatch) {
      const videoId = videoIdMatch[1];
      // Note: Direct YouTube streaming requires proper API setup
      // For MVP, we'll handle this in backend or use YouTube iframe embed
      return `https://www.youtube.com/watch?v=${videoId}`;
    }
    return url;
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.videoContainer}
        activeOpacity={1}
        onPress={handleScreenTouch}
      >
        {/* Video Player */}
        <Video
          ref={videoRef}
          source={{ uri: getYouTubeStreamUrl(videoUrl) }}
          style={styles.video}
          paused={paused}
          muted={muted}
          resizeMode="contain"
          onProgress={handleProgress}
          onLoad={handleLoad}
          onBuffer={handleBuffer}
          onError={onError}
          onEnd={onEnd}
          progressUpdateInterval={100}
        />

        {/* Loading Indicator */}
        {(loading || buffering) && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FFFFFF" />
          </View>
        )}

        {/* Subtitle Overlay */}
        {currentSubtitle && (
          <View style={styles.subtitleContainer}>
            <View style={styles.subtitleBackground}>
              <Text style={styles.subtitleText}>{currentSubtitle.text}</Text>
            </View>
          </View>
        )}

        {/* Controls Overlay */}
        {showControls && (
          <View style={styles.controlsOverlay}>
            {/* Top Bar */}
            <View style={styles.topBar}>
              <Text style={styles.timeText}>
                {formatTime(currentTime)} / {formatTime(duration)}
              </Text>
            </View>

            {/* Center Controls */}
            <View style={styles.centerControls}>
              <TouchableOpacity style={styles.controlButton} onPress={handleSeekBack}>
                <SkipBack size={32} color="#FFFFFF" fill="#FFFFFF" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.playButton} onPress={togglePlayPause}>
                {paused ? (
                  <Play size={48} color="#FFFFFF" fill="#FFFFFF" />
                ) : (
                  <Pause size={48} color="#FFFFFF" fill="#FFFFFF" />
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.controlButton} onPress={handleSeekForward}>
                <SkipForward size={32} color="#FFFFFF" fill="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Bottom Bar */}
            <View style={styles.bottomBar}>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${(currentTime / duration) * 100}%` },
                  ]}
                />
              </View>

              <View style={styles.bottomControls}>
                <TouchableOpacity style={styles.smallButton} onPress={toggleMute}>
                  {muted ? (
                    <VolumeX size={20} color="#FFFFFF" />
                  ) : (
                    <Volume2 size={20} color="#FFFFFF" />
                  )}
                </TouchableOpacity>

                <TouchableOpacity style={styles.smallButton}>
                  <Maximize size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  videoContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  subtitleContainer: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  subtitleBackground: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    maxWidth: SCREEN_WIDTH - 40,
  },
  subtitleText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 22,
  },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'space-between',
  },
  topBar: {
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
  },
  timeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  centerControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 40,
  },
  controlButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#EF4444',
    borderRadius: 2,
  },
  bottomControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  smallButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

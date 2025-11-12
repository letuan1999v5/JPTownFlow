// app/ai-map.tsx - AI-powered location recommendation with Google Maps (ULTRA only)
import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
  Dimensions,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Send, MapPin, Star, Navigation, ChevronUp, ChevronDown } from 'lucide-react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { chatWithAI, ChatMessage } from '../services/geminiService';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { CreditDisplay, CreditInfoModal } from '../components/credits';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const CHAT_MIN_HEIGHT = 180; // Minimum chat panel height
const CHAT_MAX_HEIGHT = SCREEN_HEIGHT * 0.6; // Maximum 60% of screen

export default function AIMapScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { user, subscription, role } = useAuth();
  const mapRef = useRef<MapView>(null);
  const chatScrollRef = useRef<ScrollView>(null);

  const isSuperAdmin = role === 'superadmin';
  const isUltraOrAbove = subscription === 'ULTRA' || isSuperAdmin;

  // Map states
  const [region, setRegion] = useState({
    latitude: 35.6762, // Tokyo default
    longitude: 139.6503,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  });
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null);
  const [locationPermission, setLocationPermission] = useState(false);

  // Chat states
  const [chatExpanded, setChatExpanded] = useState(false);
  const chatHeight = useRef(new Animated.Value(CHAT_MIN_HEIGHT)).current;
  const [showCreditInfo, setShowCreditInfo] = useState(false);
  const { creditBalance, refreshCreditBalance } = useSubscription();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: t('aiMapWelcome', 'こんにちは！日本の地図案内アシスタントです。近くのスーパー、レストラン、娯楽施設などをお探しですか？'),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);

  // Cache management
  const [cacheId, setCacheId] = useState<string | null>(null);
  const [cacheCreatedAt, setCacheCreatedAt] = useState<Date | null>(null);

  // System prompt for AI Map
  const systemPrompt = `You are a helpful location recommendation assistant for people living in Japan. Your role is to:

1. Help users find nearby places like:
   - Supermarkets (スーパー)
   - Convenience stores (コンビニ)
   - Restaurants (レストラン)
   - Entertainment venues (娯楽施設)
   - Parks and recreational areas (公園・レクリエーション)
   - Shopping malls (ショッピングモール)
   - Hospitals and clinics (病院・クリニック)
   - Post offices and banks (郵便局・銀行)

2. Provide detailed information about:
   - Location descriptions
   - Operating hours
   - Popular items/services
   - Price ranges
   - Tips for visiting

3. Ask for the user's current location or area of interest
4. Provide recommendations based on:
   - Distance from user
   - Popularity
   - User preferences (budget, cuisine type, etc.)
   - Special features

5. Respond in the user's preferred language
6. Use respectful and helpful tone
7. Include Japanese names with furigana when helpful

Remember to be specific and practical with your recommendations. If you don't have exact information, suggest how the user can verify details (e.g., checking Google Maps, calling ahead).`;

  // Request location permission and get current location
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationPermission(false);
        return;
      }
      setLocationPermission(true);

      const location = await Location.getCurrentPositionAsync({});
      setCurrentLocation(location);

      // Center map on current location
      setRegion({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
      });
    })();
  }, []);

  // Check subscription access
  useEffect(() => {
    if (!user) return;

    if (!isUltraOrAbove) {
      Alert.alert(
        t('ultraRequired', 'ULTRA Subscription Required'),
        t('ultraRequiredDesc', 'AI Map is only available for ULTRA subscribers. Please upgrade to access this feature.'),
        [
          { text: t('cancel', 'Cancel'), style: 'cancel', onPress: () => router.back() },
          { text: t('upgrade', 'Upgrade'), onPress: () => router.push('/(tabs)/premium') },
        ]
      );
    }
  }, [user, isUltraOrAbove]);

  // Auto scroll chat to bottom when new message
  useEffect(() => {
    setTimeout(() => {
      chatScrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

  const toggleChatExpand = () => {
    const toValue = chatExpanded ? CHAT_MIN_HEIGHT : CHAT_MAX_HEIGHT;
    Animated.spring(chatHeight, {
      toValue,
      useNativeDriver: false,
      tension: 80,
      friction: 12,
    }).start();
    setChatExpanded(!chatExpanded);
  };

  const handleGoToCurrentLocation = async () => {
    if (!locationPermission) {
      Alert.alert(
        t('locationPermission', 'Location Permission'),
        t('locationPermissionDesc', 'Please enable location permission to use this feature.')
      );
      return;
    }

    if (currentLocation) {
      mapRef.current?.animateToRegion({
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
      });
    }
  };

  const handleSend = async () => {
    if (!inputText.trim()) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: inputText.trim(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInputText('');
    setLoading(true);

    // Expand chat if not expanded
    if (!chatExpanded) {
      toggleChatExpand();
    }

    try {
      const response = await chatWithAI(
        updatedMessages,
        'flash', // AI Map uses Flash 2.5 model
        {
          systemPrompt,
          cacheId: cacheId || undefined,
          cacheCreatedAt: cacheCreatedAt || undefined,
          featureType: 'ai_map',
        }
      );

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.text,
      };

      setMessages([...updatedMessages, assistantMessage]);

      // Update cache info
      if (response.cache?.cacheId) {
        setCacheId(response.cache.cacheId);
        setCacheCreatedAt(new Date(response.cache.createdAt));
      }

      // Refresh credit balance
      await refreshCreditBalance();
    } catch (error: any) {
      console.error('Error sending message:', error);
      Alert.alert(t('error'), error.message || t('failedToSendMessage'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Map View */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        region={region}
        onRegionChangeComplete={setRegion}
        showsUserLocation={locationPermission}
        showsMyLocationButton={false}
        showsCompass={true}
      >
        {currentLocation && (
          <Marker
            coordinate={{
              latitude: currentLocation.coords.latitude,
              longitude: currentLocation.coords.longitude,
            }}
            title={t('currentLocation', 'Current Location')}
          />
        )}
      </MapView>

      {/* Floating Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <ArrowLeft size={24} color="#1F2937" />
        </TouchableOpacity>

        <View style={styles.titleContainer}>
          <MapPin size={20} color="#8B5CF6" />
          <Text style={styles.title}>{t('aiMap', 'AI Map')}</Text>
          <View style={styles.ultraBadge}>
            <Star size={10} color="#FFFFFF" fill="#FFFFFF" />
            <Text style={styles.ultraText}>ULTRA</Text>
          </View>
        </View>

        <View style={styles.headerRight} />
      </View>

      {/* Floating Credit Display */}
      <View style={styles.creditContainer}>
        <CreditDisplay
          onInfoPress={() => setShowCreditInfo(true)}
          showInfoIcon={true}
        />
      </View>

      {/* Current Location Button */}
      <TouchableOpacity
        style={styles.locationButton}
        onPress={handleGoToCurrentLocation}
      >
        <Navigation size={24} color="#8B5CF6" />
      </TouchableOpacity>

      {/* Floating Chat Panel */}
      <Animated.View style={[styles.chatPanel, { height: chatHeight }]}>
        {/* Chat Header */}
        <TouchableOpacity
          style={styles.chatHeader}
          onPress={toggleChatExpand}
          activeOpacity={0.7}
        >
          <View style={styles.chatHeaderLeft}>
            <MapPin size={18} color="#8B5CF6" />
            <Text style={styles.chatHeaderTitle}>
              {t('askAboutLocations', 'Ask about nearby places')}
            </Text>
          </View>
          {chatExpanded ? (
            <ChevronDown size={20} color="#6B7280" />
          ) : (
            <ChevronUp size={20} color="#6B7280" />
          )}
        </TouchableOpacity>

        {/* Messages - Only visible when expanded */}
        {chatExpanded && (
          <ScrollView
            ref={chatScrollRef}
            style={styles.messagesContainer}
            contentContainerStyle={styles.messagesContent}
            showsVerticalScrollIndicator={false}
          >
            {messages.map((message, index) => (
              <View
                key={index}
                style={[
                  styles.messageBubble,
                  message.role === 'user' ? styles.userBubble : styles.assistantBubble,
                ]}
              >
                {message.role === 'assistant' && (
                  <View style={styles.assistantIcon}>
                    <MapPin size={14} color="#8B5CF6" />
                  </View>
                )}
                <Text
                  style={[
                    styles.messageText,
                    message.role === 'user' ? styles.userText : styles.assistantText,
                  ]}
                >
                  {message.content}
                </Text>
              </View>
            ))}
            {loading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#8B5CF6" />
                <Text style={styles.loadingText}>{t('thinking', 'Thinking...')}</Text>
              </View>
            )}
          </ScrollView>
        )}

        {/* Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder={t('askAboutLocations', 'Ask about nearby places...')}
            placeholderTextColor="#9CA3AF"
            multiline
            maxLength={500}
            editable={!loading}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() || loading) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || loading}
          >
            <Send size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Credit Info Modal */}
      <CreditInfoModal
        visible={showCreditInfo}
        onClose={() => setShowCreditInfo(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 60 : 48,
    paddingBottom: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(229, 231, 235, 0.8)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  backButton: {
    padding: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
  },
  titleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  ultraBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 3,
  },
  ultraText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  headerRight: {
    width: 40,
  },
  creditContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 120 : 108,
    right: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 5,
  },
  locationButton: {
    position: 'absolute',
    bottom: CHAT_MIN_HEIGHT + 16,
    right: 16,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 5,
  },
  chatPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 10,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  chatHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chatHeaderTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 12,
    gap: 8,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 10,
    borderRadius: 12,
    marginBottom: 6,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#8B5CF6',
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#F3F4F6',
    flexDirection: 'row',
    gap: 6,
  },
  assistantIcon: {
    marginTop: 2,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  userText: {
    color: '#FFFFFF',
  },
  assistantText: {
    color: '#1F2937',
    flex: 1,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
  },
  loadingText: {
    fontSize: 13,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    gap: 8,
    backgroundColor: '#FFFFFF',
  },
  input: {
    flex: 1,
    maxHeight: 80,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#F9FAFB',
    borderRadius: 20,
    fontSize: 14,
    color: '#1F2937',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
});

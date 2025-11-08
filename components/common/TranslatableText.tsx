// components/common/TranslatableText.tsx
import React, { useState } from 'react';
import { Text, TouchableOpacity, StyleSheet, View, Modal } from 'react-native';
import { BookmarkPlus } from 'lucide-react-native';

export interface TranslatableWord {
  kanji: string;
  hiragana: string;
  translation: string;
}

interface TranslatableTextProps {
  text: string;
  textStyle?: any;
  onSaveWord?: (word: TranslatableWord) => void;
  jlptLevel?: 'N1' | 'N2' | 'N3' | 'N4' | 'N5';
}

export default function TranslatableText({ text, textStyle, onSaveWord, jlptLevel }: TranslatableTextProps) {
  const [selectedWord, setSelectedWord] = useState<TranslatableWord | null>(null);

  const handleSaveWord = () => {
    if (selectedWord && onSaveWord) {
      onSaveWord(selectedWord);
      setSelectedWord(null);
    }
  };

  // Parse text to find {{kanji|hiragana|translation}} patterns
  const parseText = (inputText: string) => {
    const parts: (string | TranslatableWord)[] = [];
    const regex = /\{\{([^|]+)\|([^|]+)\|([^}]+)\}\}/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(inputText)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push(inputText.substring(lastIndex, match.index));
      }

      // Add the translatable word
      parts.push({
        kanji: match[1],
        hiragana: match[2],
        translation: match[3],
      });

      lastIndex = regex.lastIndex;
    }

    // Add remaining text
    if (lastIndex < inputText.length) {
      parts.push(inputText.substring(lastIndex));
    }

    return parts;
  };

  const parts = parseText(text);

  return (
    <>
      <Text style={textStyle}>
        {parts.map((part, index) => {
          if (typeof part === 'string') {
            return <Text key={index}>{part}</Text>;
          } else {
            return (
              <TouchableOpacity
                key={index}
                onPress={() => setSelectedWord(part)}
                style={styles.inlineButton}
              >
                <Text style={[textStyle, styles.highlightedWord]}>{part.kanji}</Text>
              </TouchableOpacity>
            );
          }
        })}
      </Text>

      {/* Translation Modal */}
      <Modal
        visible={selectedWord !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedWord(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedWord(null)}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <View style={styles.translationCard}>
              <Text style={styles.kanjiText}>{selectedWord?.kanji}</Text>
              <Text style={styles.hiraganaText}>{selectedWord?.hiragana}</Text>
              <View style={styles.divider} />
              <Text style={styles.translationText}>{selectedWord?.translation}</Text>

              {onSaveWord && (
                <>
                  <View style={styles.divider} />
                  <TouchableOpacity
                    style={styles.saveButton}
                    onPress={handleSaveWord}
                  >
                    <BookmarkPlus size={20} color="#10B981" />
                    <Text style={styles.saveButtonText}>Save to Notebook</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  inlineButton: {
    display: 'inline-flex',
  },
  highlightedWord: {
    color: '#10B981',
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  translationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    minWidth: 280,
    maxWidth: '85%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  kanjiText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  hiraganaText: {
    fontSize: 18,
    color: '#6B7280',
    marginBottom: 16,
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginBottom: 16,
  },
  translationText: {
    fontSize: 16,
    color: '#374151',
    textAlign: 'center',
    lineHeight: 22,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0FDF4',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#10B981',
  },
});

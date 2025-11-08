// components/common/TranslatableText.tsx
import React, { useState } from 'react';
import { Text, TouchableOpacity, StyleSheet, View, Modal } from 'react-native';

interface TranslatableWord {
  word: string;
  translation: string;
}

interface TranslatableTextProps {
  text: string;
  textStyle?: any;
}

export default function TranslatableText({ text, textStyle }: TranslatableTextProps) {
  const [selectedWord, setSelectedWord] = useState<TranslatableWord | null>(null);

  // Parse text to find {{word|translation}} patterns
  const parseText = (inputText: string) => {
    const parts: (string | TranslatableWord)[] = [];
    const regex = /\{\{([^|]+)\|([^}]+)\}\}/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(inputText)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        parts.push(inputText.substring(lastIndex, match.index));
      }

      // Add the translatable word
      parts.push({
        word: match[1],
        translation: match[2],
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
                <Text style={[textStyle, styles.highlightedWord]}>{part.word}</Text>
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
          <View style={styles.translationCard}>
            <Text style={styles.wordText}>{selectedWord?.word}</Text>
            <Text style={styles.translationText}>{selectedWord?.translation}</Text>
          </View>
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
    minWidth: 250,
    maxWidth: '80%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  wordText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 12,
    textAlign: 'center',
  },
  translationText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
});

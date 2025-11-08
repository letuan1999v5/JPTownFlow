// types/vocabulary.ts

export type JLPTLevel = 'N1' | 'N2' | 'N3' | 'N4' | 'N5';

export interface VocabularyNotebook {
  id: string;
  userId: string;
  title: string;
  createdAt: Date;
  lastUpdatedAt: Date;
  vocabularyCount: number;
}

export interface VocabularyWord {
  id: string;
  notebookId: string;
  userId: string;
  kanji: string;
  hiragana: string;
  translation: string;
  jlptLevel: JLPTLevel;
  createdAt: Date;
}

export const NOTEBOOK_LIMITS = {
  FREE: 5,
  PRO: 50,
  ULTRA: 250,
} as const;

export const WORDS_PER_NOTEBOOK_LIMIT = 100;

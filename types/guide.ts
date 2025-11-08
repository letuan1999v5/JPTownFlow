export type GuideType = 'FREE' | 'PREMIUM';

export interface Guide {
  id: string;
  title: {
    vi: string;
    en: string;
    ja: string;
  };
  description: {
    vi: string;
    en: string;
    ja: string;
  };
  content: {
    vi: string;
    en: string;
    ja: string;
  };
  type: GuideType;
  category: string; // 'visa', 'mynumber', 'shopping', 'lifestyle', etc.
  imageUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const GUIDE_CATEGORIES = [
  { id: 'visa', nameKey: 'guideCategoryVisa', icon: '📋' },
  { id: 'mynumber', nameKey: 'guideCategoryMyNumber', icon: '🆔' },
  { id: 'shopping', nameKey: 'guideCategoryShopping', icon: '🛒' },
  { id: 'lifestyle', nameKey: 'guideCategoryLifestyle', icon: '🏡' },
  { id: 'transportation', nameKey: 'guideCategoryTransportation', icon: '🚇' },
  { id: 'tips', nameKey: 'guideCategoryTips', icon: '💡' },
] as const;

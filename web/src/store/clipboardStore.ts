import { create } from 'zustand';
import { ClipboardItem } from '../types';

interface ClipboardState {
  items: ClipboardItem[];
  syncEnabled: boolean;
  addItem: (item: ClipboardItem) => void;
  removeItem: (id: string) => void;
  setItems: (items: ClipboardItem[]) => void;
  setSyncEnabled: (enabled: boolean) => void;
}

export const useClipboardStore = create<ClipboardState>((set) => ({
  items: [],
  syncEnabled: true,

  addItem: (item) =>
    set((state) => ({
      // Prepend and avoid duplicates
      items: state.items.some((i) => i.id === item.id)
        ? state.items
        : [item, ...state.items],
    })),

  removeItem: (id) =>
    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
    })),

  setItems: (items) => set({ items }),

  setSyncEnabled: (syncEnabled) => set({ syncEnabled }),
}));

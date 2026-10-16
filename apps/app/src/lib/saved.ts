import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ListingListItem } from '@zuuchmap/core';

const KEY = 'zm_saved';

/** A guest's saves live on the device as whole list items, so the Saved tab renders offline. Newest first. */
let items: ListingListItem[] = [];
const listeners = new Set<() => void>();
const set = (next: ListingListItem[]) => {
  items = next;
  listeners.forEach((l) => l());
  AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export async function loadGuestSaved(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      items = JSON.parse(raw) as ListingListItem[];
      listeners.forEach((l) => l());
    }
  } catch {
    /* unreadable list reads as empty */
  }
}

export const guestSaved = {
  list: () => items,
  has: (id: number) => items.some((i) => i.id === id),
  add: (item: ListingListItem) => {
    if (!items.some((i) => i.id === item.id)) set([item, ...items]);
  },
  remove: (id: number) => set(items.filter((i) => i.id !== id)),
  clear: () => set([]),
};

export const useGuestSaved = (): ListingListItem[] => useSyncExternalStore(subscribe, () => items, () => items);

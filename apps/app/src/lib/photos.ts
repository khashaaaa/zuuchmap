import * as ImagePicker from 'expo-image-picker';
import type { PhotoUploadResponse } from '@zuuchmap/core';
import { api } from './api';

export const MAX_PHOTOS = 10;

export interface PhotoItem {
  id: string;
  /** Local file while uploading, the stored URL for a photo the listing already had. */
  uri: string;
  key: string | null;
  state: 'done' | 'uploading' | 'failed';
  mime: string;
  name: string;
}

let seq = 0;
export const newPhotoId = (): string => `ph${Date.now().toString(36)}${seq++}`;

/** Library (several at once) or camera. Empty when cancelled or the permission is refused. */
export async function pickPhotos(source: 'library' | 'camera', remaining: number): Promise<ImagePicker.ImagePickerAsset[]> {
  if (remaining <= 0) return [];
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return [];
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 });
    return r.canceled ? [] : r.assets;
  }
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: remaining, quality: 0.85 });
  return r.canceled ? [] : r.assets.slice(0, remaining);
}

export const itemFromAsset = (a: ImagePicker.ImagePickerAsset): PhotoItem => ({
  id: newPhotoId(),
  uri: a.uri,
  key: null,
  state: 'uploading',
  mime: a.mimeType ?? 'image/jpeg',
  name: a.fileName ?? `photo.${(a.mimeType ?? 'image/jpeg').split('/')[1] ?? 'jpg'}`,
});

/** One file per request, so a single failure is retried alone. Returns the stored key. */
export async function uploadPhoto(p: PhotoItem): Promise<string> {
  const form = new FormData();
  // React Native's FormData takes a { uri, name, type } descriptor in place of a Blob.
  form.append('files', { uri: p.uri, name: p.name, type: p.mime } as unknown as Blob);
  const res = await api<PhotoUploadResponse>('/posts/photos', { method: 'POST', form });
  return res.photos[0].key;
}

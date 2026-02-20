import { supabase } from './supabase';

const PHOTO_BUCKET = 'gear-item-photos';
const TARGET_MAX_EDGE = 768;   // unified for both item photos and AI — plenty for mobile display
const WEBP_QUALITY = 0.72;

interface CompressedImage {
  blob: Blob;
  extension: 'webp' | 'jpg';
  mimeType: 'image/webp' | 'image/jpeg';
}

export async function uploadCompressedGearPhoto(params: {
  file: File;
  userId: string;
  itemId: string;
}) {
  const { file, userId, itemId } = params;
  const compressed = await compressImage(file);
  const path = `${userId}/${itemId}-${Date.now()}.${compressed.extension}`;

  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, compressed.blob, {
      contentType: compressed.mimeType,
      upsert: false,
    });

  if (error) throw error;

  const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

export async function removeGearPhotoByUrl(photoUrl?: string) {
  if (!photoUrl) return;
  const path = extractStoragePathFromPhotoUrl(photoUrl);
  if (!path) return;

  const { error } = await supabase.storage.from(PHOTO_BUCKET).remove([path]);
  if (error) throw error;
}

export async function compressedImageToDataUrl(file: File) {
  const compressed = await compressImage(file);
  return blobToDataUrl(compressed.blob);
}

function extractStoragePathFromPhotoUrl(photoUrl: string) {
  if (!photoUrl || photoUrl.startsWith('data:')) return null;
  const marker = `/storage/v1/object/public/${PHOTO_BUCKET}/`;
  const markerIndex = photoUrl.indexOf(marker);
  if (markerIndex === -1) return null;

  const encodedPath = photoUrl.slice(markerIndex + marker.length);
  if (!encodedPath) return null;
  return decodeURIComponent(encodedPath);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not load selected image.'));
    };
    image.src = objectUrl;
  });
}

async function compressImage(file: File): Promise<CompressedImage> {
  const image = await loadImage(file);
  const scale = Math.min(1, TARGET_MAX_EDGE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process selected image.');
  ctx.drawImage(image, 0, 0, width, height);

  const webpBlob = await canvasToBlob(canvas, 'image/webp', WEBP_QUALITY);
  if (webpBlob) {
    return {
      blob: webpBlob,
      extension: 'webp',
      mimeType: 'image/webp',
    };
  }

  const jpgBlob = await canvasToBlob(canvas, 'image/jpeg', WEBP_QUALITY);
  if (!jpgBlob) throw new Error('Could not encode selected image.');

  return {
    blob: jpgBlob,
    extension: 'jpg',
    mimeType: 'image/jpeg',
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Could not read processed image.'));
    reader.readAsDataURL(blob);
  });
}

// ---------------------------------------------------------------------------
// AI Vision — smaller compression for recognition requests (in-memory only)
// ---------------------------------------------------------------------------

/**
 * Compress a File to a small base64 data URL for AI vision requests.
 * Target: 768px max edge, lower quality — never stored, only sent to AI API.
 */
export async function compressImageForAI(file: File): Promise<string> {
  const image = await loadImage(file);
  return compressImageElementForAI(image);
}

/**
 * Compress an existing image URL (Supabase public URL or data URI) for AI vision.
 * Used when re-scanning a photo that's already on the item.
 */
export async function compressImageUrlForAI(imageUrl: string): Promise<string> {
  const image = await loadImageFromUrl(imageUrl);
  return compressImageElementForAI(image);
}

/**
 * Generate a small thumbnail data URL for chat message display.
 * Target: 200px max edge — stored in IndexedDB with chat messages.
 */
export async function generateChatThumbnail(file: File): Promise<string> {
  const image = await loadImage(file);
  const maxEdge = 200;
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process image for thumbnail.');
  ctx.drawImage(image, 0, 0, width, height);

  const blob = await canvasToBlob(canvas, 'image/webp', 0.6)
    ?? await canvasToBlob(canvas, 'image/jpeg', 0.6);
  if (!blob) throw new Error('Could not encode thumbnail.');
  return blobToDataUrl(blob);
}

function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load image from URL.'));
    image.src = url;
  });
}

function compressImageElementForAI(image: HTMLImageElement): Promise<string> {
  const scale = Math.min(1, TARGET_MAX_EDGE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process image for AI.');
  ctx.drawImage(image, 0, 0, width, height);

  return (async () => {
    const webpBlob = await canvasToBlob(canvas, 'image/webp', WEBP_QUALITY);
    if (webpBlob) return blobToDataUrl(webpBlob);

    const jpgBlob = await canvasToBlob(canvas, 'image/jpeg', WEBP_QUALITY);
    if (!jpgBlob) throw new Error('Could not encode image for AI.');
    return blobToDataUrl(jpgBlob);
  })();
}

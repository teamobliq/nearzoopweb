/**
 * Image hosting on Firebase Storage — the replacement for imgbb.
 *
 * Files live under `shops/{uid}/...` so the Storage rules can authorise the
 * shop owner (or an admin) by uid, while the public download URLs are what
 * get written into Firestore and rendered in `<img src>`. Every upload gets
 * a unique path; callers delete the previous file once a replacement has
 * been saved, and deleting an offer removes its photos.
 */

import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { storage } from '../firebase'

const MAX_BYTES = 5 * 1024 * 1024
const IMAGE_TYPE = /^image\/(jpeg|png|webp|gif)$/
export const IMAGE_FOLDER = ['shop', 'documents', 'offers'] as const
export type ImageFolder = (typeof IMAGE_FOLDER)[number]

/** A fresh path for one image, e.g. `shops/abc/shop/<uuid>.jpg`. */
export function nextImagePath(shopUid: string, folder: ImageFolder): string {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `shops/${shopUid}/${folder}/${id}.jpg`
}

/** The crop dialog returns a JPEG data URL; convert it back to a Blob. */
function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',')
  if (comma === -1 || !dataUrl.startsWith('data:')) {
    throw new Error("Couldn't read that image. Try choosing it again.")
  }
  const head = dataUrl.slice(0, comma)
  const mime = /:(.*?);/.exec(head)?.[1] ?? 'image/jpeg'
  const base64 = dataUrl.slice(comma + 1)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

/** Uploads a File (or a data URL from the crop dialog) and returns a stable
 *  public download URL, ready to store in Firestore. */
export async function uploadImage(source: File | string, path: string): Promise<string> {
  const blob = typeof source === 'string' ? dataUrlToBlob(source) : source
  if (!IMAGE_TYPE.test(blob.type)) {
    throw new Error('Please choose a JPEG, PNG, WebP or GIF image.')
  }
  if (blob.size > MAX_BYTES) {
    throw new Error('That image is too large — pick one under 5 MB.')
  }

  const snapshot = await uploadBytes(ref(storage, path), blob, { contentType: blob.type })
  return getDownloadURL(snapshot.ref)
}

/** Deletes the file behind a Firebase Storage download URL. Legacy imgbb
 *  URLs (and anything else external) are ignored rather than throwing. */
export async function deleteImage(url?: string | null): Promise<void> {
  if (!url) return
  const isOurs =
    url.startsWith('gs://') ||
    url.includes('firebasestorage.googleapis.com') ||
    url.includes('firebasestorage.app')
  if (!isOurs) return
  try {
    await deleteObject(ref(storage, url))
  } catch (err) {
    // A missing file is fine; log anything else without blocking the caller.
    console.warn('Could not delete image', err)
  }
}

/** Fire-and-forget cleanup for a list of URLs (offer photos on delete). */
export function deleteImages(urls: (string | null | undefined)[]): void {
  for (const url of urls) void deleteImage(url)
}

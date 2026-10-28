/** imgbb hosting — chosen images upload immediately so shop photos live at
    stable i.ibb.co URLs instead of local object/data URLs. */

const ENDPOINT = 'https://api.imgbb.com/1/upload'

function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',')
  const head = dataUrl.slice(0, comma)
  const base64 = dataUrl.slice(comma + 1)
  const mime = /:(.*?);/.exec(head)?.[1] ?? 'image/jpeg'
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mime })
}

type ImgbbPayload = {
  success?: boolean
  data?: { url?: string }
  error?: { message?: string; code?: number }
}

/** Uploads a File or data URL to imgbb and resolves with the direct image URL. */
export async function uploadToImgbb(source: File | string): Promise<string> {
  const key = import.meta.env.VITE_IMGBB_KEY as string | undefined
  if (!key) {
    throw new Error('Image upload is not configured — VITE_IMGBB_KEY is missing.')
  }

  const form = new FormData()
  if (typeof source === 'string') {
    form.append('image', dataUrlToBlob(source), 'photo.jpg')
  } else {
    form.append('image', source, source.name || 'photo')
  }

  let response: Response
  try {
    response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      body: form,
    })
  } catch {
    throw new Error('Network trouble. Check your connection and try again.')
  }

  let payload: ImgbbPayload = {}
  try {
    payload = (await response.json()) as ImgbbPayload
  } catch {
    // non-JSON body — fall through to the generic error
  }

  const url = payload?.data?.url
  if (payload?.success && url) {
    return url
  }
  if (payload?.error?.message) {
    throw new Error(`Upload failed: ${payload.error.message}`)
  }
  throw new Error("Couldn't upload the image. Try again.")
}

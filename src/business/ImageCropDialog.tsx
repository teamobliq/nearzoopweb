import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

type Props = {
  /** Image chosen by the user; its object URL is revoked on close. */
  file: File
  /** Forced width / height ratio, e.g. 4 / 3. */
  aspect: number
  onCancel: () => void
  /** Fires with the cropped image as a JPEG data URL. */
  onDone: (dataUrl: string) => void
}

const MIN_ZOOM = 1
const MAX_ZOOM = 3
/** Longest output edge — keeps data URLs sane on 12 MP phone shots. */
const MAX_OUTPUT = 1600

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Modal crop dialog. The image cover-fits a fixed-ratio frame: drag to pan,
 * slider to zoom, and "Use photo" bakes exactly the visible region to JPEG.
 */
export default function ImageCropDialog({ file, aspect, onCancel, onDone }: Props) {
  const [src, setSrc] = useState<string | null>(null)
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [frame, setFrame] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const frameRef = useRef<HTMLDivElement | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null)
  const cancelRef = useRef(onCancel)

  useEffect(() => {
    cancelRef.current = onCancel
  }, [onCancel])

  // Decode the file once; the object URL lives until the dialog unmounts.
  useEffect(() => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      setSrc(url)
      setNatural({ w: image.naturalWidth, h: image.naturalHeight })
    }
    image.onerror = () => cancelRef.current()
    image.src = url
    return () => {
      image.onload = null
      image.onerror = null
      URL.revokeObjectURL(url)
    }
  }, [file])

  // Track the frame's content box so the crop math stays correct on resize.
  useEffect(() => {
    const el = frameRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      setFrame({ w: el.clientWidth, h: el.clientHeight })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [src])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  if (!src || !natural) {
    return (
      <div className="biz-cropback" role="dialog" aria-modal="true">
        <div className="biz-crop">
          <h2 className="biz-croptitle">Position your photo</h2>
          <p className="biz-cropsub">Loading photo…</p>
        </div>
      </div>
    )
  }

  const baseScale = frame ? Math.max(frame.w / natural.w, frame.h / natural.h) : 1
  const scale = baseScale * zoom
  const maxX = frame ? (natural.w * scale - frame.w) / 2 : 0
  const maxY = frame ? (natural.h * scale - frame.h) / 2 : 0
  const cx = clamp(offset.x, -maxX, maxX)
  const cy = clamp(offset.y, -maxY, maxY)

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    drag.current = { px: event.clientX, py: event.clientY, ox: cx, oy: cy }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const state = drag.current
    if (!state) return
    setOffset({
      x: clamp(state.ox + (event.clientX - state.px), -maxX, maxX),
      y: clamp(state.oy + (event.clientY - state.py), -maxY, maxY),
    })
  }

  function onPointerUp() {
    drag.current = null
  }

  /** Bakes the visible frame region to a JPEG data URL and closes. */
  function applyCrop() {
    const img = imgRef.current
    if (!img || !natural || !frame) return
    const cropW = frame.w / scale
    const cropH = frame.h / scale
    const sx = clamp(natural.w / 2 + (-frame.w / 2 - cx) / scale, 0, natural.w - cropW)
    const sy = clamp(natural.h / 2 + (-frame.h / 2 - cy) / scale, 0, natural.h - cropH)
    const outW = Math.min(MAX_OUTPUT, Math.round(cropW))
    const outH = Math.round(outW / aspect)
    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, outW, outH)
    ctx.drawImage(img, sx, sy, cropW, cropH, 0, 0, outW, outH)
    onDone(canvas.toDataURL('image/jpeg', 0.86))
  }

  return (
    <div
      className="biz-cropback"
      role="dialog"
      aria-modal="true"
      aria-labelledby="biz-crop-title"
    >
      <div className="biz-crop">
        <h2 className="biz-croptitle" id="biz-crop-title">
          Position your photo
        </h2>
        <p className="biz-cropsub">Drag to adjust · slide to zoom</p>

        <div className="biz-cropview">
          <div
            className="biz-cropframe"
            ref={frameRef}
            style={{ aspectRatio: aspect }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <img
              ref={imgRef}
              src={src}
              alt=""
              draggable={false}
              style={{
                width: `${natural.w * scale}px`,
                height: `${natural.h * scale}px`,
                transform: `translate(-50%, -50%) translate(${cx}px, ${cy}px)`,
              }}
            />
          </div>
        </div>

        <div className="biz-cropzoom">
          <label className="biz-cropzoom-label" htmlFor="biz-crop-zoom">
            Zoom
          </label>
          <input
            id="biz-crop-zoom"
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
        </div>

        <div className="biz-cropactions">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={applyCrop} autoFocus>
            Use photo
          </button>
        </div>
      </div>
    </div>
  )
}

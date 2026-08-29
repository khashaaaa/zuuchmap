import { useEffect, useState } from 'react'
import Cropper from 'react-easy-crop'
import { RotateCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Modal from './Modal'
import Button from './Button'

// Output edge for avatars and logos. The server keeps 800/1000px at most
// (uploader.ts IMAGE_CONFIG), so anything larger is upload bytes for nothing.
const OUTPUT_PX = 1000

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('undecodable image'))
    img.src = url
  })
}

// Draw the chosen square onto a canvas, honouring rotation, and hand back a
// File so callers append it to FormData exactly as they did the raw pick.
async function renderCrop(url, area, rotation, fileName) {
  const img = await loadImage(url)
  const rad = (rotation * Math.PI) / 180
  // Bounding box of the rotated source, so nothing is clipped before cropping.
  const sin = Math.abs(Math.sin(rad)), cos = Math.abs(Math.cos(rad))
  const bw = img.width * cos + img.height * sin
  const bh = img.width * sin + img.height * cos

  const rotated = document.createElement('canvas')
  rotated.width = bw; rotated.height = bh
  const rctx = rotated.getContext('2d')
  rctx.translate(bw / 2, bh / 2)
  rctx.rotate(rad)
  rctx.drawImage(img, -img.width / 2, -img.height / 2)

  const out = document.createElement('canvas')
  const size = Math.min(OUTPUT_PX, Math.round(area.width))
  out.width = size; out.height = size
  out.getContext('2d').drawImage(rotated, area.x, area.y, area.width, area.height, 0, 0, size, size)

  return new Promise((resolve, reject) => {
    out.toBlob((blob) => {
      if (!blob) return reject(new Error('canvas export failed'))
      const base = (fileName || 'image').replace(/\.[^.]+$/, '')
      resolve(new File([blob], `${base}.jpg`, { type: 'image/jpeg' }))
    }, 'image/jpeg', 0.85)
  })
}

/**
 * Square crop for avatars and logos — both render in a circle or a rounded
 * square, where an uncropped landscape photo reads as broken. Post photos are
 * deliberately not routed here: the cards use `object-cover` and providers
 * upload several at once.
 *
 * `file` opens the dialog; `onDone(File)` receives the cropped JPEG;
 * `onCancel()` drops the pick. `shape` only affects the preview mask.
 */
export default function ImageCropModal({ file, shape = 'rect', onDone, onCancel }) {
  const { t } = useTranslation()
  const [url, setUrl] = useState(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [area, setArea] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!file) return setUrl(null)
    const u = URL.createObjectURL(file)
    setUrl(u)
    setCrop({ x: 0, y: 0 }); setZoom(1); setRotation(0); setArea(null)
    return () => URL.revokeObjectURL(u)
  }, [file])

  async function apply() {
    if (!url || !area) return
    setBusy(true)
    try {
      onDone(await renderCrop(url, area, rotation, file?.name))
    } catch {
      // HEIC on a non-Safari browser lands here: the <img> never decodes.
      // Hand the original through so the server-side Sharp pass still runs.
      onDone(file)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={!!file}
      onClose={onCancel}
      title={t('crop.title')}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>{t('common.cancel')}</Button>
          <Button type="button" onClick={apply} disabled={busy || !area}>{busy ? t('common.saving') : t('common.apply')}</Button>
        </>
      }
    >
      <div className="relative w-full aspect-square bg-surface2 rounded-card overflow-hidden">
        {url && (
          <Cropper
            image={url}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={1}
            cropShape={shape === 'round' ? 'round' : 'rect'}
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, px) => setArea(px)}
          />
        )}
      </div>
      <div className="flex items-center gap-3 mt-4">
        <label className="text-xs text-muted shrink-0" htmlFor="crop-zoom">{t('crop.zoom')}</label>
        <input
          id="crop-zoom"
          type="range" min={1} max={3} step={0.05} value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="flex-1 accent-primary"
        />
        <button
          type="button"
          onClick={() => setRotation((r) => (r + 90) % 360)}
          aria-label={t('crop.rotate')}
          title={t('crop.rotate')}
          className="min-w-touch min-h-touch flex items-center justify-center rounded-btn text-muted hover:text-text hover:bg-surface2 transition-colors"
        >
          <RotateCw size={16} />
        </button>
      </div>
      <p className="text-xs text-muted mt-2">{t('crop.hint')}</p>
    </Modal>
  )
}

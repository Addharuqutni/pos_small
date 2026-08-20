import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'
import { Button } from '@/components/ui'

interface BarcodeScannerProps {
  onDetect: (code: string) => void
  onClose: () => void
}

interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>
}

// Feature-detect the native BarcodeDetector API (Chrome 83+, Android).
function getDetector(): BarcodeDetectorLike | null {
  const Ctor = (globalThis as { BarcodeDetector?: new (o?: { formats?: string[] }) => BarcodeDetectorLike }).BarcodeDetector
  if (!Ctor) return null
  try {
    return new Ctor({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'] })
  } catch {
    return null
  }
}

export function BarcodeScanner({ onDetect, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState('')
  const [scanned, setScanned] = useState('')
  const detectorRef = useRef<BarcodeDetectorLike | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)
  const onDetectRef = useRef(onDetect)
  onDetectRef.current = onDetect

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  const scan = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    const detector = detectorRef.current
    if (!video || !canvas || !detector || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(scan)
      return
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    const width = Math.min(video.videoWidth, 480)
    const height = Math.round((video.videoHeight / video.videoWidth) * width)
    canvas.width = width
    canvas.height = height
    ctx.drawImage(video, 0, 0, width, height)

    detector
      .detect(canvas)
      .then((codes) => {
        const code = codes[0]?.rawValue
        if (code) {
          setScanned(code)
          stop()
          onDetectRef.current(code)
          return
        }
        rafRef.current = requestAnimationFrame(scan)
      })
      .catch(() => {
        rafRef.current = requestAnimationFrame(scan)
      })
  }, [stop])

  useEffect(() => {
    const detector = getDetector()
    detectorRef.current = detector
    if (!detector) {
      setError('Browser tidak mendukung pemindaian kamera. Gunakan Chrome terbaru atau ketik barcode manual.')
      return
    }

    let cancelled = false
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          videoRef.current.play()
        }
        rafRef.current = requestAnimationFrame(scan)
      })
      .catch(() => {
        if (!cancelled) setError('Tidak bisa mengakses kamera. Periksa izin kamera.')
      })

    return () => {
      cancelled = true
      stop()
    }
  }, [scan, stop])

  return (
    <div className="relative overflow-hidden rounded-xl bg-black">
      <video ref={videoRef} className="aspect-square w-full object-cover" muted playsInline />
      <canvas ref={canvasRef} className="hidden" />

      {scanned && (
        <div className="absolute inset-x-0 top-0 bg-green-600 py-1 text-center text-xs font-bold text-white">
          Terbaca: {scanned}
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900 p-6 text-center">
          <Camera className="h-8 w-8 text-slate-400" />
          <p className="text-sm text-slate-200">{error}</p>
          <Button variant="secondary" onClick={onClose}>Tutup</Button>
        </div>
      )}

      <button
        type="button"
        onClick={() => { stop(); onClose() }}
        className="absolute right-2 top-2 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"
        aria-label="Tutup pemindai"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

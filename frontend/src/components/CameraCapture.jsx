import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Camera, X, Images, Loader2 } from "lucide-react";

// Full-screen camera with a central vertical guide for fiscal receipts.
// On capture it crops LOCALLY to the guide region, resizes and compresses,
// then returns a JPEG data URL (only the cropped area is sent to OCR).
export function CameraCapture({ open, title, onCapture, onFile, onClose, captureTestId, fileTestId }) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const guideRef = useRef(null);
  const fileRef = useRef(null);
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setReady(false); setError(false); setStarting(true);
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setReady(true);
      } catch (e) {
        setError(true);
      } finally {
        setStarting(false);
      }
    })();
    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [open]);

  const capture = () => {
    const video = videoRef.current;
    const cont = containerRef.current;
    const guide = guideRef.current;
    if (!video || !cont || !guide || !video.videoWidth) return;
    const vW = video.videoWidth, vH = video.videoHeight;
    const cr = cont.getBoundingClientRect();
    const gr = guide.getBoundingClientRect();
    // object-fit: cover mapping from displayed pixels to intrinsic frame
    const scale = Math.max(cr.width / vW, cr.height / vH);
    const dispW = vW * scale, dispH = vH * scale;
    const offX = (dispW - cr.width) / 2;
    const offY = (dispH - cr.height) / 2;
    const sx = Math.max(0, (gr.left - cr.left + offX) / scale);
    const sy = Math.max(0, (gr.top - cr.top + offY) / scale);
    const sw = Math.min(vW - sx, gr.width / scale);
    const sh = Math.min(vH - sy, gr.height / scale);
    const maxDim = 1500;
    const s2 = Math.min(1, maxDim / Math.max(sw, sh));
    const outW = Math.round(sw * s2), outH = Math.round(sh * s2);
    const canvas = document.createElement("canvas");
    canvas.width = outW; canvas.height = outH;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, outW, outH);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
    onCapture(dataUrl);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black" data-testid="camera-overlay">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="font-heading text-base font-semibold">{title}</span>
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/10"
          onClick={onClose} data-testid="camera-close-btn">
          <X className="h-6 w-6" />
        </Button>
      </div>

      <div ref={containerRef} className="relative flex-1 overflow-hidden">
        {!error && (
          <video ref={videoRef} playsInline muted
            className="absolute inset-0 h-full w-full object-cover" />
        )}
        {/* guide with darkened outside via huge box-shadow */}
        {!error && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div ref={guideRef}
              className="rounded-2xl border-2 border-white/90"
              style={{
                width: "78%", height: "70%", maxWidth: 520,
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
              }} />
            <p className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-4 py-2 text-center text-sm font-medium text-white">
              Posiziona lo scontrino dentro il riquadro
            </p>
          </div>
        )}
        {starting && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-white">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center text-white">
            <Camera className="h-10 w-10 opacity-70" />
            <p className="text-sm text-white/80">
              Fotocamera non disponibile. Scegli una foto dalla galleria.
            </p>
          </div>
        )}
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
        data-testid={fileTestId} />

      <div className="flex items-center justify-center gap-6 bg-black px-6 py-6">
        <Button variant="ghost" className="h-14 flex-col gap-1 text-white hover:bg-white/10"
          onClick={() => fileRef.current?.click()} data-testid="camera-gallery-btn">
          <Images className="h-6 w-6" />
          <span className="text-xs">Galleria</span>
        </Button>
        <button onClick={capture} disabled={!ready}
          className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-white/20 transition-transform active:scale-95 disabled:opacity-40"
          data-testid={captureTestId}>
          <span className="h-14 w-14 rounded-full bg-white" />
        </button>
        <div className="h-14 w-14" />
      </div>
    </div>
  );
}

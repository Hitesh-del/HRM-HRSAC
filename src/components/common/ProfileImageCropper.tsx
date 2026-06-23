/**
 * ProfileImageCropper
 * Canvas-based avatar cropper with zoom, drag, and rotation.
 * No external dependencies — pure React + HTML5 Canvas.
 *
 * Usage:
 *   <ProfileImageCropper
 *     open={open}
 *     onClose={() => setOpen(false)}
 *     onSave={(blob) => uploadBlob(blob)}
 *   />
 */
import { useRef, useState, useCallback, useEffect } from 'react';
import { ZoomIn, ZoomOut, RotateCw, Upload, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';

interface ProfileImageCropperProps {
  open: boolean;
  onClose: () => void;
  /** Called with a WebP Blob of the cropped square image (512×512) */
  onSave: (blob: Blob) => Promise<void>;
  saving?: boolean;
}

const CANVAS_SIZE = 300; // preview canvas px
const OUTPUT_SIZE = 512; // output image px

export function ProfileImageCropper({ open, onClose, onSave, saving = false }: ProfileImageCropperProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, ox: 0, oy: 0 });
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setImgSrc(null);
      setZoom(1);
      setRotation(0);
      setOffset({ x: 0, y: 0 });
    }
  }, [open]);

  // Redraw canvas whenever params change
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Circular clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.translate(CANVAS_SIZE / 2 + offset.x, CANVAS_SIZE / 2 + offset.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(zoom, zoom);

    const drawSize = Math.max(img.naturalWidth, img.naturalHeight);
    const scale = CANVAS_SIZE / drawSize;
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();

    // Overlay ring
    ctx.beginPath();
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'hsl(var(--primary))';
    ctx.lineWidth = 3;
    ctx.stroke();
  }, [zoom, rotation, offset]);

  useEffect(() => {
    draw();
  }, [draw]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file'); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error('File too large (max 10MB)'); return; }

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setImgSrc(url);
      setZoom(1);
      setRotation(0);
      setOffset({ x: 0, y: 0 });
    };
    img.onerror = () => toast.error('Failed to load image');
    img.src = url;
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  // Pointer drag
  const onPointerDown = (e: React.PointerEvent) => {
    if (!imgSrc) return;
    setDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    setOffset({ x: dragStart.ox + dx, y: dragStart.oy + dy });
  };
  const onPointerUp = () => setDragging(false);

  // Wheel zoom
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.min(5, Math.max(0.5, z - e.deltaY * 0.001)));
  };

  const handleSave = async () => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    // Render at full OUTPUT_SIZE
    const out = document.createElement('canvas');
    out.width = OUTPUT_SIZE;
    out.height = OUTPUT_SIZE;
    const ctx = out.getContext('2d');
    if (!ctx) return;

    const ratio = OUTPUT_SIZE / CANVAS_SIZE;
    ctx.save();
    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.translate(OUTPUT_SIZE / 2 + offset.x * ratio, OUTPUT_SIZE / 2 + offset.y * ratio);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(zoom, zoom);

    const drawSize = Math.max(img.naturalWidth, img.naturalHeight);
    const scale = (CANVAS_SIZE / drawSize) * ratio;
    const w = img.naturalWidth * scale;
    const h = img.naturalHeight * scale;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();

    out.toBlob(
      async (blob) => {
        if (!blob) { toast.error('Failed to process image'); return; }
        await onSave(blob);
      },
      'image/webp',
      0.9
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !saving) onClose(); }}>
      <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Profile Photo</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* File pick */}
          {!imgSrc ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-40 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 hover:border-primary hover:bg-primary/5 transition-colors cursor-pointer"
            >
              <Upload className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Click to choose photo</p>
              <p className="text-xs text-muted-foreground">JPG, PNG, WEBP · max 10 MB</p>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/jpg" className="hidden" onChange={handleFile} />
            </button>
          ) : (
            <>
              {/* Canvas preview */}
              <div className="flex flex-col items-center gap-3">
                <canvas
                  ref={canvasRef}
                  width={CANVAS_SIZE}
                  height={CANVAS_SIZE}
                  className="rounded-full cursor-grab active:cursor-grabbing touch-none"
                  style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  onWheel={onWheel}
                />
                <p className="text-xs text-muted-foreground">Drag to reposition · scroll to zoom</p>
              </div>

              {/* Zoom slider */}
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Zoom</span>
                  <span className="text-xs text-muted-foreground">{Math.round(zoom * 100)}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} className="text-muted-foreground hover:text-foreground">
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <Slider
                    min={50} max={500} step={1}
                    value={[Math.round(zoom * 100)]}
                    onValueChange={([v]) => setZoom(v / 100)}
                    className="flex-1 min-w-0"
                  />
                  <button type="button" onClick={() => setZoom(z => Math.min(5, z + 0.1))} className="text-muted-foreground hover:text-foreground">
                    <ZoomIn className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Rotation + change photo */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button variant="outline" size="sm" onClick={() => setRotation(r => (r + 90) % 360)} className="gap-1.5">
                  <RotateCw className="w-3.5 h-3.5" /> Rotate 90°
                </Button>
                <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} className="gap-1.5 text-muted-foreground">
                  <Upload className="w-3.5 h-3.5" /> Change
                </Button>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/jpg" className="hidden" onChange={handleFile} />
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1 min-w-0" onClick={onClose} disabled={saving}>
              <X className="w-4 h-4 mr-1.5" /> Cancel
            </Button>
            <Button className="flex-1 min-w-0" onClick={handleSave} disabled={!imgSrc || saving}>
              <Check className="w-4 h-4 mr-1.5" /> {saving ? 'Saving…' : 'Save Photo'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

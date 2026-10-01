import { useState, useRef, useEffect } from 'react';
import { Trash2Icon, PenToolIcon } from 'lucide-react';

function isCanvasBlank(canvas: HTMLCanvasElement | null) {
  if (!canvas) return true;
  const ctx = canvas.getContext('2d');
  if (!ctx) return true;
  const { width, height } = canvas;
  if (width === 0 || height === 0) return true;
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData?.data;
  if (!data || data.length === 0) return true;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== undefined && data[i]! > 10) return false;
  }
  return true;
}

export function SignaturePad({ label, value, onChange, isRequired = true, error, placeholder = "Draw signature here" }: any) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasStroke, setHasStroke] = useState(Boolean(value));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0F172A';

    if (value && typeof value === 'string' && value.startsWith('data:image')) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setHasStroke(true);
      };
      img.src = value;
    } else if (!value) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasStroke(false);
    }
  }, [value]);

  const getCoordinates = (e: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height)
    };
  };

  const startDraw = (e: any) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: any) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasStroke(true);
  };

  const endDraw = (e: any) => {
    if (!isDrawing) return;
    e.preventDefault();
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (!isCanvasBlank(canvas)) {
      onChange(canvas?.toDataURL('image/png'));
    } else {
      onChange('');
    }
  };

  const handleClear = (e: any) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
    onChange('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label style={{ fontWeight: 600, marginBottom: 0, fontSize: '0.85rem' }}>
          {label} {isRequired && <span style={{ color: '#EF4444' }}>*</span>}
        </label>
        {hasStroke && (
          <button
            type="button"
            onClick={handleClear}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#EF4444',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.2rem'
            }}
          >
            <Trash2Icon size={12} /> Clear
          </button>
        )}
      </div>

      <div 
        style={{
          border: error ? '2px solid #EF4444' : hasStroke ? '1.5px solid #10B981' : '1px solid var(--color-border-strong)',
          borderRadius: 'var(--radius-sm)',
          background: '#FFFFFF',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)',
          touchAction: 'none'
        }}
      >
        <canvas
          ref={canvasRef}
          width={400}
          height={120}
          style={{
            width: '100%',
            height: '120px',
            display: 'block',
            cursor: 'crosshair',
            touchAction: 'none'
          }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        {!hasStroke && (
          <div 
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              color: '#94A3B8',
              fontSize: '0.82rem',
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              userSelect: 'none'
            }}
          >
            <PenToolIcon size={14} /> {placeholder}
          </div>
        )}
      </div>
    </div>
  );
}

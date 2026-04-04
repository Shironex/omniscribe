'use client';

import { useEffect, useRef, useCallback } from 'react';

interface AnimatedGridBgProps {
  className?: string;
}

export function AnimatedGridBg({ className = '' }: AnimatedGridBgProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cellsRef = useRef<{ x: number; y: number; opacity: number; decay: number }[]>([]);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const cellSize = 60;
    const cols = Math.ceil(w / cellSize);
    const rows = Math.ceil(h / cellSize);

    ctx.clearRect(0, 0, w, h);

    // Draw grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= cols; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cellSize, 0);
      ctx.lineTo(x * cellSize, h);
      ctx.stroke();
    }
    for (let y = 0; y <= rows; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * cellSize);
      ctx.lineTo(w, y * cellSize);
      ctx.stroke();
    }

    // Draw glowing cells
    const cells = cellsRef.current;
    for (let i = cells.length - 1; i >= 0; i--) {
      const cell = cells[i];
      cell.opacity -= cell.decay;
      if (cell.opacity <= 0) {
        cells.splice(i, 1);
        continue;
      }
      const alpha = cell.opacity;
      ctx.fillStyle = `rgba(124, 58, 237, ${alpha * 0.15})`;
      ctx.fillRect(cell.x * cellSize + 1, cell.y * cellSize + 1, cellSize - 2, cellSize - 2);

      // Subtle glow border
      ctx.strokeStyle = `rgba(124, 58, 237, ${alpha * 0.25})`;
      ctx.lineWidth = 1;
      ctx.strokeRect(cell.x * cellSize + 0.5, cell.y * cellSize + 0.5, cellSize - 1, cellSize - 1);
    }

    return { cols, rows };
  }, []);

  useEffect(() => {
    let frameId: number;

    const loop = () => {
      animate();
      frameId = requestAnimationFrame(loop);
    };

    const spawnCell = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const cellSize = 60;
      const cols = Math.ceil(canvas.clientWidth / cellSize);
      const rows = Math.ceil(canvas.clientHeight / cellSize);
      const count = Math.random() > 0.5 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        cellsRef.current.push({
          x: Math.floor(Math.random() * cols),
          y: Math.floor(Math.random() * rows),
          opacity: 1,
          decay: 0.008 + Math.random() * 0.012,
        });
      }
    };

    frameId = requestAnimationFrame(loop);
    const intervalId = setInterval(spawnCell, 800);

    return () => {
      cancelAnimationFrame(frameId);
      clearInterval(intervalId);
    };
  }, [animate]);

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      aria-hidden="true"
    />
  );
}

'use client';

interface BorderBeamProps {
  duration?: number;
  borderWidth?: number;
  colorFrom?: string;
  colorTo?: string;
  className?: string;
}

export function BorderBeam({
  duration = 4,
  borderWidth = 1.5,
  colorFrom = '#7c3aed',
  colorTo = '#c4b5fd',
  className = '',
}: BorderBeamProps) {
  return (
    <div
      className={`pointer-events-none absolute -inset-px z-10 overflow-hidden rounded-[inherit] ${className}`}
      style={{
        // Mask: show only the border area (outer minus inner)
        WebkitMask: `linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)`,
        WebkitMaskComposite: 'xor',
        maskComposite: 'exclude',
        padding: borderWidth,
      }}
    >
      {/* Spinning gradient — oversized so it covers as it rotates */}
      <div
        className="absolute inset-[-50%] animate-[border-beam-spin_var(--beam-dur)_linear_infinite]"
        style={
          {
            '--beam-dur': `${duration}s`,
            background: `conic-gradient(from 0deg, transparent 0%, transparent 25%, ${colorFrom} 30%, ${colorTo} 36%, transparent 42%, transparent 58%, ${colorFrom}90 64%, ${colorTo}70 70%, transparent 76%, transparent 100%)`,
          } as React.CSSProperties
        }
      />
    </div>
  );
}

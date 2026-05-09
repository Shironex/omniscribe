interface SplashEmberProps {
  variant: 'loading' | 'updating' | 'error';
}

/**
 * Central focal element — a steady ember disc with a breathing outer glow.
 *
 * The ember IS the orchestrator: many threads converge here. The disc itself
 * always uses `var(--primary)` so each theme paints its own ember (Forge
 * burns warm orange, Nord glows frost blue, Paper a deep terracotta).
 *
 * Decorative — `aria-hidden`. The status announcement lives on the splash root.
 */
export function SplashEmber({ variant }: SplashEmberProps) {
  const tone = variant === 'error' ? 'destructive' : variant === 'updating' ? 'accent' : 'primary';

  return (
    <div
      aria-hidden="true"
      className="relative flex items-center justify-center"
      style={
        {
          width: 96,
          height: 96,
          // Ember entrance: scale-in with a touch of overshoot.
          animation: 'omniscribe-fade-up 700ms cubic-bezier(0.34, 1.56, 0.64, 1) 350ms both',
        } as React.CSSProperties
      }
    >
      {/* Outer breathing glow ring — pure radial, no border */}
      <div
        className={variant === 'error' ? '' : 'omniscribe-anim-glow'}
        style={{
          position: 'absolute',
          inset: -48,
          borderRadius: '50%',
          background: `radial-gradient(circle at center, oklch(from var(--${tone}) l c h / 0.5) 0%, oklch(from var(--${tone}) l c h / 0.18) 35%, transparent 70%)`,
          filter: 'blur(8px)',
          animation:
            variant === 'error' ? undefined : 'omniscribe-ember-glow 2800ms ease-in-out infinite',
        }}
      />

      {/* Mid ring — darker tint for depth */}
      <div
        style={{
          position: 'absolute',
          inset: -16,
          borderRadius: '50%',
          background: `radial-gradient(circle at center, oklch(from var(--${tone}) l c h / 0.35) 0%, transparent 65%)`,
        }}
      />

      {/* Core disc — the ember */}
      <div
        className={variant === 'error' ? '' : 'omniscribe-anim-pulse'}
        style={{
          position: 'relative',
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: `radial-gradient(circle at 35% 30%, oklch(from var(--${tone}) calc(l + 0.08) c h) 0%, var(--${tone}) 60%, oklch(from var(--${tone}) calc(l - 0.1) c h) 100%)`,
          boxShadow: `0 0 24px oklch(from var(--${tone}) l c h / 0.55), 0 0 48px oklch(from var(--${tone}) l c h / 0.25)`,
          animation:
            variant === 'error' ? undefined : 'omniscribe-ember-pulse 3000ms ease-in-out infinite',
        }}
      />
    </div>
  );
}

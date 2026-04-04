'use client';

import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import Link from 'next/link';

type ShimmerButtonProps = {
  children: ReactNode;
  className?: string;
} & ({ href: string } | ({ href?: never } & ButtonHTMLAttributes<HTMLButtonElement>));

export function ShimmerButton({ children, href, className = '', ...props }: ShimmerButtonProps) {
  const baseClasses = `group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-lg bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-600/20 transition-all duration-300 hover:bg-violet-500 hover:shadow-violet-500/30 hover:-translate-y-0.5 ${className}`;

  const shimmerOverlay = (
    <span
      className="pointer-events-none absolute inset-0"
      style={{
        background:
          'linear-gradient(110deg, transparent 25%, rgba(255,255,255,0.15) 50%, transparent 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 3s ease-in-out infinite',
      }}
      aria-hidden="true"
    />
  );

  if (href) {
    return (
      <Link href={href} className={baseClasses}>
        {shimmerOverlay}
        <span className="relative z-10 flex items-center gap-2">{children}</span>
      </Link>
    );
  }

  return (
    <button className={baseClasses} {...props}>
      {shimmerOverlay}
      <span className="relative z-10 flex items-center gap-2">{children}</span>
    </button>
  );
}

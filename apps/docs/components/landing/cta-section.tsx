'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { ShimmerButton } from '@/components/ui/shimmer-button';

export function CtaSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <section
      id="cta"
      className="relative overflow-hidden border-t border-white/[0.06] py-24 sm:py-32"
    >
      {/* Retro perspective grid */}
      <div className="retro-grid" aria-hidden="true" />

      {/* Subtle purple glow at top */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-64"
        style={{
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(124,58,237,0.06) 0%, transparent 70%)',
        }}
        aria-hidden="true"
      />

      <div ref={ref} className="relative mx-auto max-w-5xl px-6 text-center">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="mb-4 text-3xl font-bold tracking-[-0.02em] text-white sm:text-4xl"
        >
          Ready to ship faster?
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.1, ease: 'easeOut' }}
          className="mx-auto mb-10 max-w-md text-base leading-relaxed text-white/45"
        >
          Download Omniscribe and orchestrate your AI coding workflow.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.2, ease: 'easeOut' }}
          className="flex flex-col items-center gap-4"
        >
          <ShimmerButton href="/download">
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Download for free
          </ShimmerButton>

          <p className="text-xs text-white/25">Available for macOS and Windows</p>
        </motion.div>
      </div>
    </section>
  );
}

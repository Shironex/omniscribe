'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { AnimatedGridBg } from '@/components/ui/animated-grid-bg';
import { BorderBeam } from '@/components/ui/border-beam';
import { ShimmerButton } from '@/components/ui/shimmer-button';
import { TextReveal } from '@/components/ui/text-reveal';

/* ── Hero Section ────────────────────────────────────────────────── */

export function Hero() {
  return (
    <section
      id="hero"
      className="relative overflow-hidden pt-20 pb-24 sm:pt-28 sm:pb-32 lg:pt-36 lg:pb-40"
    >
      {/* Backgrounds */}
      <AnimatedGridBg />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(124,58,237,0.12) 0%, transparent 60%)',
        }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-5xl px-6">
        {/* Version badge */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="mb-8 flex justify-center"
        >
          <Link
            href="/docs/changelog"
            className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-1.5 text-xs font-medium text-white/50 transition-colors hover:border-white/[0.15] hover:text-white/70"
          >
            <BorderBeam
              duration={8}
              borderWidth={1}
              colorFrom="#7c3aed"
              colorTo="#a78bfa"
              size={80}
            />
            <span className="relative z-10 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
              v1.4.0
            </span>
          </Link>
        </motion.div>

        {/* Headline */}
        <div className="mb-6 text-center">
          <TextReveal
            text="Orchestrate AI coding sessions like never before"
            className="text-4xl font-bold tracking-[-0.02em] text-white sm:text-5xl lg:text-6xl"
            delay={0.15}
          />
        </div>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.8, ease: 'easeOut' }}
          className="mx-auto mb-10 max-w-2xl text-center text-base leading-relaxed text-white/50 sm:text-lg"
        >
          Run up to 12 Claude Code and Codex sessions in parallel. Monitor, manage, and ship — all
          from one window.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 1.1, ease: 'easeOut' }}
          className="mb-20 flex flex-wrap items-center justify-center gap-3"
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
            Download
          </ShimmerButton>
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.03] px-6 py-3 text-sm font-semibold text-white/70 transition-all duration-300 hover:border-white/[0.2] hover:text-white hover:-translate-y-0.5"
          >
            Read the docs
          </Link>
        </motion.div>

        {/* App Screenshot */}
        <div style={{ perspective: '1200px' }}>
          <motion.div
            initial={{ opacity: 0, y: 60, rotateX: 4 }}
            animate={{ opacity: 1, y: 0, rotateX: 2 }}
            transition={{ duration: 0.9, delay: 1.3, ease: 'easeOut' }}
            className="relative overflow-hidden rounded-2xl border border-white/[0.08] shadow-2xl shadow-black/60"
            style={{ transformStyle: 'preserve-3d' }}
          >
            {/* Border beam effect */}
            <BorderBeam
              duration={5}
              borderWidth={3}
              colorFrom="#7c3aed"
              colorTo="#c4b5fd"
              size={250}
            />

            {/* Outer glow */}
            <div
              className="pointer-events-none absolute -inset-px rounded-2xl"
              style={{
                boxShadow:
                  '0 0 100px -20px rgba(124,58,237,0.2), 0 0 40px -10px rgba(124,58,237,0.1)',
              }}
              aria-hidden="true"
            />

            {/* Screenshot image */}
            <Image
              src="/app.png"
              alt="Omniscribe — 12 AI coding sessions running in parallel"
              width={1920}
              height={1080}
              className="relative block w-full"
              priority
            />

            {/* Bottom fade to blend with page */}
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
              style={{
                background: 'linear-gradient(to top, var(--fd-background) 0%, transparent 100%)',
              }}
              aria-hidden="true"
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

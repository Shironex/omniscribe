'use client';

import { motion, useInView, useMotionValue, animate } from 'framer-motion';
import { useRef, useEffect, useState } from 'react';

/* ── Animated Counter ────────────────────────────────────────────── */

function AnimatedNumber({
  value,
  suffix = '',
  delay = 0,
}: {
  value: number;
  suffix?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-40px' });
  const motionVal = useMotionValue(0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!isInView) return;

    const controls = animate(motionVal, value, {
      duration: 1.2,
      delay,
      ease: 'easeOut',
      onUpdate: v => setDisplay(Math.round(v)),
    });

    return () => controls.stop();
  }, [isInView, value, delay, motionVal]);

  return (
    <span ref={ref} className="tabular-nums">
      {display}
      {suffix}
    </span>
  );
}

/* ── Stat Item ───────────────────────────────────────────────────── */

function Stat({
  value,
  suffix,
  label,
  isSymbol,
  delay,
}: {
  value?: number;
  suffix?: string;
  label: string;
  isSymbol?: boolean;
  delay: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-40px' });

  return (
    <div ref={ref} className="flex flex-col items-center gap-2 px-8 py-4">
      <motion.span
        initial={{ opacity: 0, y: 12 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5, delay, ease: 'easeOut' }}
        className="text-5xl font-bold tracking-tight text-violet-400"
      >
        {isSymbol ? (
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.6, delay, ease: 'easeOut' }}
          >
            &infin;
          </motion.span>
        ) : (
          <AnimatedNumber value={value!} suffix={suffix} delay={delay} />
        )}
      </motion.span>
      <motion.span
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : {}}
        transition={{ duration: 0.4, delay: delay + 0.2, ease: 'easeOut' }}
        className="text-sm text-white/40"
      >
        {label}
      </motion.span>
    </div>
  );
}

/* ── Highlights Section ──────────────────────────────────────────── */

export function Highlights() {
  return (
    <section id="highlights" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-4xl px-6">
        <div className="flex flex-col items-center justify-center gap-0 divide-y divide-white/[0.06] rounded-2xl border border-white/[0.06] bg-white/[0.02] sm:flex-row sm:divide-x sm:divide-y-0">
          <Stat value={12} label="Parallel sessions" delay={0} />
          <Stat value={41} suffix="+" label="UI & terminal themes" delay={0.15} />
          <Stat label="Plugin extensibility" isSymbol delay={0.3} />
        </div>
      </div>
    </section>
  );
}

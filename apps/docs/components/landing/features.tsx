'use client';

import { motion, useInView } from 'framer-motion';
import { useRef, type ReactNode } from 'react';
import { BorderBeam } from '@/components/ui/border-beam';

/* ── Session Grid Visualization ──────────────────────────────────── */

function SessionGrid() {
  const statuses: ('done' | 'working' | 'active' | 'idle')[] = [
    'active',
    'working',
    'done',
    'active',
    'done',
    'working',
    'idle',
    'active',
    'working',
    'done',
    'active',
    'done',
  ];

  return (
    <div className="grid grid-cols-4 gap-1.5">
      {statuses.map((status, i) => (
        <div
          key={i}
          className="flex h-9 items-center justify-center rounded border border-white/[0.06] bg-white/[0.02]"
        >
          {status === 'done' && <span className="h-2 w-2 rounded-full bg-emerald-400/80" />}
          {status === 'working' && <span className="h-2 w-2 rounded-full bg-amber-400/80" />}
          {status === 'active' && <span className="h-2 w-0.5 animate-cursor bg-violet-400/70" />}
          {status === 'idle' && <span className="h-2 w-2 rounded-full bg-white/15" />}
        </div>
      ))}
    </div>
  );
}

/* ── Branch Diagram ──────────────────────────────────────────────── */

function BranchDiagram() {
  return (
    <svg viewBox="0 0 160 120" fill="none" className="mt-3 h-28 w-full" aria-hidden="true">
      {/* Main line */}
      <line x1="20" y1="30" x2="140" y2="30" stroke="rgba(255,255,255,0.12)" strokeWidth="2" />
      <circle cx="20" cy="30" r="4" fill="rgba(255,255,255,0.25)" />
      <circle cx="60" cy="30" r="4" fill="rgba(255,255,255,0.25)" />
      <circle cx="100" cy="30" r="4" fill="rgba(255,255,255,0.25)" />
      <circle cx="140" cy="30" r="4" fill="rgba(255,255,255,0.25)" />

      {/* Branch 1 */}
      <path d="M60 30 Q70 30 80 55" stroke="rgba(124,58,237,0.35)" strokeWidth="2" fill="none" />
      <line x1="80" y1="55" x2="130" y2="55" stroke="rgba(124,58,237,0.35)" strokeWidth="2" />
      <circle cx="80" cy="55" r="3" fill="rgba(124,58,237,0.5)" />
      <circle cx="130" cy="55" r="3" fill="rgba(124,58,237,0.5)" />
      <text x="80" y="70" fill="rgba(255,255,255,0.2)" fontSize="8" fontFamily="monospace">
        feat/auth
      </text>

      {/* Branch 2 */}
      <path d="M100 30 Q110 30 115 85" stroke="rgba(124,58,237,0.25)" strokeWidth="2" fill="none" />
      <line x1="115" y1="85" x2="145" y2="85" stroke="rgba(124,58,237,0.25)" strokeWidth="2" />
      <circle cx="115" cy="85" r="3" fill="rgba(124,58,237,0.4)" />
      <circle cx="145" cy="85" r="3" fill="rgba(124,58,237,0.4)" />
      <text x="115" y="100" fill="rgba(255,255,255,0.2)" fontSize="8" fontFamily="monospace">
        fix/142
      </text>

      {/* Label */}
      <text x="20" y="18" fill="rgba(255,255,255,0.2)" fontSize="8" fontFamily="monospace">
        main
      </text>
    </svg>
  );
}

/* ── Timeline Visualization ──────────────────────────────────────── */

function TimelineViz() {
  return (
    <div className="mt-4 flex flex-col gap-3">
      {[
        { w: '85%', ago: '2m ago' },
        { w: '100%', ago: '1h ago' },
        { w: '60%', ago: '3h ago' },
        { w: '45%', ago: '1d ago' },
      ].map((item, i) => (
        <div key={i} className="flex items-center gap-2.5">
          <span className="h-2 w-2 shrink-0 rounded-full bg-violet-500/50" />
          <div className="h-1.5 rounded-full bg-white/[0.06]" style={{ width: item.w }} />
          <span className="shrink-0 text-[9px] text-white/20">{item.ago}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Plugin Slots ────────────────────────────────────────────────── */

function PluginSlots() {
  const plugins = [
    { name: 'Claude', active: true },
    { name: 'Codex', active: true },
    { name: '+', active: false },
  ];

  return (
    <div className="flex gap-2">
      {plugins.map((plugin, i) => (
        <div
          key={i}
          className={`flex h-16 w-20 flex-col items-center justify-center rounded-lg border transition-transform duration-300 hover:-translate-y-0.5 sm:w-24 ${
            plugin.active
              ? 'border-white/[0.08] bg-white/[0.03]'
              : 'border-dashed border-white/[0.08] bg-transparent'
          }`}
        >
          {plugin.active ? (
            <span className="text-[11px] font-medium text-white/40">{plugin.name}</span>
          ) : (
            <span className="text-lg text-white/20">{plugin.name}</span>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Keyboard Shortcuts ──────────────────────────────────────────── */

function KeyboardShortcuts() {
  const shortcuts = [
    { keys: ['Ctrl', 'K'], label: 'Kill all' },
    { keys: ['Shift', 'N'], label: 'Launch session' },
    { keys: ['L'], label: 'Launch all' },
    { keys: ['Ctrl', ','], label: 'Settings' },
  ];

  return (
    <div className="flex flex-wrap gap-4">
      {shortcuts.map((shortcut, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="flex gap-1">
            {shortcut.keys.map((key, j) => (
              <kbd
                key={j}
                className="inline-flex h-7 min-w-[28px] items-center justify-center rounded border border-white/[0.1] bg-white/[0.04] px-2 font-mono text-[11px] text-white/50"
              >
                {key}
              </kbd>
            ))}
          </div>
          <span className="text-[11px] text-white/30">{shortcut.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Feature Card ────────────────────────────────────────────────── */

function FeatureCard({
  title,
  description,
  children,
  visualLeft = false,
  className = '',
  index,
}: {
  title: string;
  description: string;
  children?: ReactNode;
  visualLeft?: boolean;
  className?: string;
  index: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });
  const isLarge = className.includes('col-span');

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      transition={{
        duration: 0.5,
        delay: index * 0.08,
        ease: 'easeOut',
      }}
      className={`group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] transition-all duration-300 hover:border-white/[0.1] ${
        isLarge ? 'p-6 sm:p-8' : 'p-6'
      } ${className}`}
    >
      {/* Border beam on hover for large cards */}
      <div className="pointer-events-none opacity-0 transition-opacity duration-500 group-hover:opacity-100">
        {isLarge && <BorderBeam duration={5} borderWidth={1} />}
      </div>

      {isLarge ? (
        <div
          className={`flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between ${
            visualLeft ? 'sm:flex-row-reverse' : ''
          }`}
        >
          <div className="flex-1">
            <h3 className="mb-2 text-lg font-semibold tracking-tight text-white">{title}</h3>
            <p className="text-sm leading-relaxed text-white/50">{description}</p>
          </div>
          <div className="shrink-0">{children}</div>
        </div>
      ) : (
        <>
          {children}
          <h3 className="mb-2 text-lg font-semibold tracking-tight text-white">{title}</h3>
          <p className="text-sm leading-relaxed text-white/50">{description}</p>
        </>
      )}
    </motion.div>
  );
}

/* ── Features Section ────────────────────────────────────────────── */

export function Features() {
  return (
    <section id="features" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-5xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-12 text-center"
        >
          <h2 className="text-2xl font-bold tracking-[-0.02em] text-white sm:text-3xl">
            Built for parallel workflows
          </h2>
          <p className="mt-3 text-base text-white/40">
            Everything you need to run multiple AI agents without losing your mind.
          </p>
        </motion.div>

        <div className="grid gap-4 sm:grid-cols-3">
          {/* Row 1: Large (2 cols) + Regular (1 col) */}
          <FeatureCard
            title="12 Parallel Sessions"
            description="Run up to 12 AI coding sessions simultaneously in a resizable grid. Assign tasks, monitor progress, and manage everything from one window."
            className="col-span-1 sm:col-span-2"
            index={0}
          >
            <SessionGrid />
          </FeatureCard>

          <FeatureCard
            title="Git Worktree Isolation"
            description="Each session works on its own branch. Automatic worktree management keeps your codebase clean."
            index={1}
          >
            <BranchDiagram />
          </FeatureCard>

          {/* Row 2: Regular (1 col) + Large (2 cols) */}
          <FeatureCard
            title="Session History"
            description="Browse, search, and resume past sessions. Fork conversations from any point."
            index={2}
          >
            <TimelineViz />
          </FeatureCard>

          <FeatureCard
            title="Plugin System"
            description="Extend Omniscribe with custom AI provider plugins. Claude, Codex, or your own — build and share integrations using the Plugin SDK."
            className="col-span-1 sm:col-span-2"
            visualLeft
            index={3}
          >
            <PluginSlots />
          </FeatureCard>

          {/* Row 3: Full width */}
          <FeatureCard
            title="Keyboard-First"
            description="Navigate sessions, launch tasks, and manage your workflow without leaving the keyboard. Every action has a shortcut."
            className="col-span-1 sm:col-span-3"
            index={4}
          >
            <KeyboardShortcuts />
          </FeatureCard>
        </div>
      </div>
    </section>
  );
}

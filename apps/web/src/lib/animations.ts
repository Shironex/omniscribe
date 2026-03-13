import type { Variants, Transition } from 'motion/react';

export const animationVariants = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  scaleIn: {
    initial: { opacity: 0, scale: 0.9 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.9 },
  },
  slideUp: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 20 },
  },
  slideDown: {
    initial: { opacity: 0, y: -20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
  },
  slideLeft: {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 },
  },
  slideRight: {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
  },
  pop: {
    initial: { opacity: 0, scale: 0.8 },
    animate: {
      opacity: 1,
      scale: 1,
      transition: { type: 'spring', stiffness: 500, damping: 25 },
    },
    exit: { opacity: 0, scale: 0.8 },
  },
} satisfies Record<string, Variants>;

export const transitions = {
  instant: { duration: 0.05 },
  fast: { duration: 0.15 },
  normal: { duration: 0.25 },
  slow: { duration: 0.4 },
  spring: { type: 'spring', stiffness: 400, damping: 25 },
  springSmooth: { type: 'spring', stiffness: 200, damping: 20 },
  easeOut: { duration: 0.25, ease: [0, 0, 0.2, 1] },
  easeIn: { duration: 0.25, ease: [0.4, 0, 1, 1] },
  easeInOut: { duration: 0.25, ease: [0.4, 0, 0.2, 1] },
} satisfies Record<string, Transition>;

export type AnimationVariant = keyof typeof animationVariants;
export type TransitionPreset = keyof typeof transitions;

'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

interface TextRevealProps {
  text: string;
  className?: string;
  delay?: number;
}

export function TextReveal({ text, className = '', delay = 0 }: TextRevealProps) {
  const ref = useRef<HTMLHeadingElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-40px' });

  const words = text.split(' ');

  return (
    <h1 ref={ref} className={className}>
      {words.map((word, i) => (
        <motion.span
          key={i}
          className="inline-block"
          initial={{ opacity: 0, filter: 'blur(8px)', y: 8 }}
          animate={
            isInView
              ? { opacity: 1, filter: 'blur(0px)', y: 0 }
              : { opacity: 0, filter: 'blur(8px)', y: 8 }
          }
          transition={{
            duration: 0.5,
            delay: delay + i * 0.06,
            ease: 'easeOut',
          }}
        >
          {word}
          {i < words.length - 1 && <span>&nbsp;</span>}
        </motion.span>
      ))}
    </h1>
  );
}

import { useEffect, useRef, type RefObject } from 'react';

/**
 * Hook that calls a handler when a click occurs outside the referenced element.
 */
export function useClickOutside(ref: RefObject<HTMLElement | null>, handler: () => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        handlerRef.current();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [ref]);
}

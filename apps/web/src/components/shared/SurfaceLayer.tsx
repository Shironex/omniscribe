import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { createLogger } from '@omniscribe/shared';
import { BG_OPACITY_RENDER_FACTOR } from '@omniscribe/shared';
import { useAppearanceStore } from '@/stores/useAppearanceStore';
import { getBgImageUrl } from '@/lib/background/bg-image-store';

const logger = createLogger('SurfaceLayer');

/** z-index just below the max int — the overlay paints OVER the workspace UI. */
const SURFACE_Z_INDEX = 2147483646;
/** Quiet window after the last resize event before the blur filter is restored. */
const RESIZE_SETTLE_MS = 200;

/**
 * Translucent background-blend overlay. Renders the user's chosen image as a
 * fixed, full-viewport, pointer-transparent layer portaled to `document.body`,
 * sitting above the app chrome so it tints the whole workspace.
 *
 * Self-noops: renders nothing unless a background image is active and its
 * object URL has resolved. Mounted unconditionally at the app root.
 *
 * Perf guards (terax SurfaceLayer pattern):
 * - While the window is resizing, the CSS blur filter is dropped (blur is the
 *   most expensive part of the composite); it restores 200ms after resize ends.
 * - When the document is hidden (tab/window occluded), the visual is unmounted
 *   entirely and restored when the document becomes visible again.
 */
export function SurfaceLayer() {
  const background = useAppearanceStore(state => state.background);
  const isImage = background.kind === 'image' && background.imageId !== null;
  const imageId = isImage ? background.imageId : null;

  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [isHidden, setIsHidden] = useState(
    typeof document !== 'undefined' && document.visibilityState === 'hidden'
  );

  // Resolve the active image id to an object URL (async IndexedDB read).
  useEffect(() => {
    if (!imageId) {
      setObjectUrl(null);
      return;
    }
    let cancelled = false;
    getBgImageUrl(imageId)
      .then(url => {
        if (!cancelled) setObjectUrl(url);
      })
      .catch(error => {
        logger.warn('failed to resolve background image url', error);
        if (!cancelled) setObjectUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [imageId]);

  // Drop the blur filter while the window is actively resizing.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      setIsResizing(true);
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => setIsResizing(false), RESIZE_SETTLE_MS);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (timeout) clearTimeout(timeout);
    };
  }, []);

  // Unmount the visual entirely while the document is occluded.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisibility = () => setIsHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  if (!isImage || !objectUrl || isHidden) return null;
  if (typeof document === 'undefined') return null;

  const blur = background.blur > 0 && !isResizing ? background.blur : 0;

  return createPortal(
    <div
      aria-hidden="true"
      data-surface-layer=""
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: SURFACE_Z_INDEX,
        pointerEvents: 'none',
        backgroundImage: `url("${objectUrl}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        opacity: background.opacity * BG_OPACITY_RENDER_FACTOR,
        ...(blur > 0 ? { filter: `blur(${blur}px)` } : {}),
        transform: 'translateZ(0)',
      }}
    />,
    document.body
  );
}

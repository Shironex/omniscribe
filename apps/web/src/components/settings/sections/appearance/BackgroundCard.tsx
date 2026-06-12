import { useCallback, useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Upload, Trash2 } from 'lucide-react';
import { createLogger } from '@omniscribe/shared';
import {
  SettingsCard,
  SettingsRow,
  SettingsRowLabel,
  SettingsToggleRow,
} from '@/components/settings/SettingsCard';
import { useAppearanceStore } from '@/stores/useAppearanceStore';
import { putBgImage, getBgImageUrl, deleteBgImage } from '@/lib/background/bg-image-store';
import { cn } from '@/lib/utils';

const logger = createLogger('BackgroundCard');

const MAX_BLUR_PX = 40;

/**
 * Background ("blend") settings card — enable toggle, image picker, thumbnail
 * preview, opacity and blur controls for the translucent background overlay.
 *
 * The image bytes live in IndexedDB (via `bg-image-store`); this card only
 * mutates the small persisted config blob through `useAppearanceStore`.
 */
export function BackgroundCard() {
  const background = useAppearanceStore(state => state.background);
  const setBackground = useAppearanceStore(state => state.setBackground);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  const hasImage = background.imageId !== null;
  const isActive = background.kind === 'image' && hasImage;

  // Resolve the stored image id to a thumbnail object URL (shown even while
  // the blend is toggled off, as long as an image is stored).
  useEffect(() => {
    if (!background.imageId) {
      setThumbUrl(null);
      return;
    }
    let cancelled = false;
    getBgImageUrl(background.imageId)
      .then(url => {
        if (!cancelled) setThumbUrl(url);
      })
      .catch(() => {
        if (!cancelled) setThumbUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [background.imageId]);

  const handleChooseImage = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // Reset the input so re-picking the same file fires onChange again.
      event.target.value = '';
      if (!file) return;

      const id = await putBgImage(file);
      if (!id) {
        logger.warn('handleFileChange: failed to store image');
        return;
      }
      setBackground({ kind: 'image', imageId: id });
    },
    [setBackground]
  );

  const handleToggleEnabled = useCallback(
    (enabled: boolean) => {
      // Only meaningful with a stored image; the toggle is disabled otherwise.
      setBackground({ kind: enabled ? 'image' : 'none' });
    },
    [setBackground]
  );

  const handleRemove = useCallback(async () => {
    if (background.imageId) {
      await deleteBgImage(background.imageId);
    }
    setBackground({ kind: 'none', imageId: null });
  }, [background.imageId, setBackground]);

  const opacityPercent = Math.round(background.opacity * 100);

  return (
    <SettingsCard
      icon={ImageIcon}
      tone="blue"
      title="Background"
      subtitle="Blend a custom image behind the workspace."
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
        aria-hidden="true"
      />

      {/* Enable / disable the blend (preserves the stored image). */}
      <SettingsToggleRow
        title="Enable background blend"
        description="Blend the chosen image behind the workspace."
        checked={isActive}
        onCheckedChange={handleToggleEnabled}
        disabled={!hasImage}
      />

      {/* Image picker + thumbnail / remove */}
      <SettingsRow divider>
        <SettingsRowLabel
          title="Background image"
          description={
            hasImage
              ? 'Replace or remove the stored background image.'
              : 'Choose an image to blend behind the workspace.'
          }
        />
        <div className="flex items-center gap-2.5 flex-shrink-0">
          {thumbUrl && (
            <div
              className="size-9 rounded-md border border-border-glass bg-cover bg-center shadow-sm"
              style={{ backgroundImage: `url("${thumbUrl}")` }}
              aria-label="Current background image preview"
              role="img"
            />
          )}
          <button
            type="button"
            onClick={handleChooseImage}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
              'border border-border-glass bg-background/30 text-foreground',
              'hover:bg-accent/40 transition-colors',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'
            )}
          >
            <Upload className="w-3.5 h-3.5" />
            {hasImage ? 'Replace…' : 'Choose image…'}
          </button>
          {hasImage && (
            <button
              type="button"
              onClick={handleRemove}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
                'border border-destructive/25 bg-destructive/[0.06] text-destructive',
                'hover:bg-destructive/15 transition-colors',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'
              )}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Remove
            </button>
          )}
        </div>
      </SettingsRow>

      {/* Opacity */}
      <SettingsRow stacked divider>
        <SettingsRowLabel
          title={`Opacity — ${opacityPercent}%`}
          description="Rendered at half strength to keep the UI readable."
        />
        <input
          type="range"
          min={0}
          max={100}
          value={opacityPercent}
          disabled={!isActive}
          onChange={e => setBackground({ opacity: Number(e.target.value) / 100 })}
          className="w-full accent-primary disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Background opacity"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>0%</span>
          <span>100%</span>
        </div>
      </SettingsRow>

      {/* Blur */}
      <SettingsRow stacked divider>
        <SettingsRowLabel
          title={`Blur — ${background.blur}px`}
          description="Soften the background image."
        />
        <input
          type="range"
          min={0}
          max={MAX_BLUR_PX}
          value={background.blur}
          disabled={!isActive}
          onChange={e => setBackground({ blur: Number(e.target.value) })}
          className="w-full accent-primary disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Background blur"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>0px</span>
          <span>{MAX_BLUR_PX}px</span>
        </div>
      </SettingsRow>
    </SettingsCard>
  );
}

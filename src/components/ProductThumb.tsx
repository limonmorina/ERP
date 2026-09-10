/**
 * Lazy product thumbnail: loads a data URL from Electron for a stored image_path.
 */
import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import clsx from 'clsx';
import { hasErpBridge } from '../lib/format';

export function ProductThumb({
  imagePath,
  itemId,
  alt,
  className,
  size = 40,
}: {
  imagePath?: string | null;
  itemId?: number;
  alt: string;
  className?: string;
  size?: number;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!hasErpBridge() || (!imagePath && !itemId)) {
        setSrc(null);
        return;
      }
      if (!imagePath) {
        setSrc(null);
        return;
      }
      try {
        const data = await window.erp.inventory.getImage({
          image_path: imagePath,
          id: itemId,
        });
        if (!cancelled) setSrc(data);
      } catch {
        if (!cancelled) setSrc(null);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [imagePath, itemId]);

  if (!src) {
    return (
      <div
        className={clsx(
          'flex shrink-0 items-center justify-center rounded bg-ink-100 text-ink-400',
          className
        )}
        style={{ width: size, height: size }}
        title="Pa foto"
      >
        <ImageOff size={Math.max(14, size * 0.35)} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={clsx('shrink-0 rounded object-cover', className)}
      style={{ width: size, height: size }}
    />
  );
}

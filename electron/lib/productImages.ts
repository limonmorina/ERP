// Product photo helpers for HSM Furniture ERP.
// Images are stored under Electron userData/product-images and referenced by filename in SQLite.

import fs from 'fs';
import path from 'path';
import { app } from 'electron';

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

/** Directory for product photos (created on demand). */
export function getProductImagesDir(): string {
  const dir = path.join(app.getPath('userData'), 'product-images');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** Resolve a stored relative filename to an absolute path, or null if invalid/missing. */
export function resolveProductImagePath(relativeName: string | null | undefined): string | null {
  if (!relativeName) return null;
  const base = path.basename(relativeName);
  if (base !== relativeName || base.includes('..')) return null;
  const full = path.join(getProductImagesDir(), base);
  return fs.existsSync(full) ? full : null;
}

/**
 * Save a base64 image payload as a new file and return the relative filename.
 * Optional oldRelative removes the previous file after a successful save.
 */
export function saveProductImageFromBase64(
  base64: string,
  mimeHint?: string,
  oldRelative?: string | null
): string {
  const cleaned = base64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
  const buffer = Buffer.from(cleaned, 'base64');
  if (!buffer.length) throw new Error('Fotoja është bosh');
  if (buffer.length > 8 * 1024 * 1024) throw new Error('Fotoja duhet të jetë nën 8MB');

  let ext = '.jpg';
  if (mimeHint?.includes('png') || base64.startsWith('data:image/png')) ext = '.png';
  else if (mimeHint?.includes('webp') || base64.startsWith('data:image/webp')) ext = '.webp';
  else if (mimeHint?.includes('gif') || base64.startsWith('data:image/gif')) ext = '.gif';

  const filename = `product-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  const dest = path.join(getProductImagesDir(), filename);
  fs.writeFileSync(dest, buffer);

  if (oldRelative) {
    deleteProductImage(oldRelative);
  }

  return filename;
}

/** Delete a product image file by relative name (ignores missing files). */
export function deleteProductImage(relativeName: string | null | undefined): void {
  const full = resolveProductImagePath(relativeName);
  if (!full) return;
  try {
    fs.unlinkSync(full);
  } catch {
    /* ignore */
  }
}

/** Build a data URL for <img src> in the renderer (CSP allows data:). */
export function productImageToDataUrl(relativeName: string | null | undefined): string | null {
  const full = resolveProductImagePath(relativeName);
  if (!full) return null;
  const ext = path.extname(full).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return null;
  const mime =
    ext === '.png'
      ? 'image/png'
      : ext === '.webp'
        ? 'image/webp'
        : ext === '.gif'
          ? 'image/gif'
          : 'image/jpeg';
  const data = fs.readFileSync(full).toString('base64');
  return `data:${mime};base64,${data}`;
}

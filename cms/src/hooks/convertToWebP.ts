import path from 'path';
import type { BeforeOperationHook } from 'payload/dist/collections/config/types';

const WEBP_QUALITY = 82;
const CONVERTIBLE_TYPES = ['image/jpeg', 'image/png', 'image/tiff', 'image/bmp'];
// GIF excluded — WebP conversion strips animation frames

/**
 * beforeOperation hook for the media collection.
 * Converts uploaded images (JPEG, PNG, TIFF, BMP) to WebP format. GIFs are excluded to preserve animation.
 * BEFORE Payload processes the file (generateFileData, image resizing, S3 upload).
 *
 * Uses (global as any).convertImageToWebP assigned in server.ts
 * to avoid Webpack trying to bundle sharp's native binary in the admin panel.
 */
export const convertToWebP: BeforeOperationHook = async ({ args, operation }) => {
  if (operation !== 'create') return args;

  const file = args.req.files?.file;
  if (!file) return args;

  const mimeType = file.mimetype || (file as any).mimeType;
  if (!CONVERTIBLE_TYPES.includes(mimeType)) return args;

  const convert = (global as any).convertImageToWebP;
  if (!convert) return args;

  try {
    const originalSize = file.data.length;
    const webpBuffer = await convert(file.data, WEBP_QUALITY);

    // Update the file object in-place BEFORE Payload reads it
    file.data = webpBuffer;
    file.size = webpBuffer.length;
    file.mimetype = 'image/webp';
    (file as any).mimeType = 'image/webp';

    // Change filename extension to .webp
    const parsed = path.parse(file.name);
    file.name = `${parsed.name}.webp`;

    const savings = ((1 - webpBuffer.length / originalSize) * 100).toFixed(1);
    console.log(
      `[WebP] Converted ${parsed.base} (${(originalSize / 1024).toFixed(0)}KB) -> ${file.name} (${(webpBuffer.length / 1024).toFixed(0)}KB) — ${savings}% smaller`
    );
  } catch (err) {
    console.error('[WebP] Conversion failed, using original:', err);
  }

  return args;
};

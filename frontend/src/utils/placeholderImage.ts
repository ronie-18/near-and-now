/**
 * Inline SVG placeholder used wherever a product/category image is missing or fails to load.
 *
 * Replaces the external via.placeholder.com URLs, which (a) added a third-party
 * request per broken image and (b) caused an infinite onError loop when that
 * host itself was unreachable.
 */
import type { SyntheticEvent } from 'react';

const svg = (label: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">` +
  `<rect width="300" height="300" fill="#f1f5f1"/>` +
  `<text x="150" y="158" font-family="Arial, sans-serif" font-size="20" fill="#9ca3af" text-anchor="middle">${label}</text>` +
  `</svg>`;

export const PLACEHOLDER_IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(svg('No image'))}`;

export function placeholderFor(label: string): string {
  const safe = label.replace(/[<>&"]/g, '').slice(0, 24) || 'No image';
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg(safe))}`;
}

/** onError handler that swaps to the placeholder exactly once (no retry loop). */
export function handleImageError(event: SyntheticEvent<HTMLImageElement>, fallback: string = PLACEHOLDER_IMAGE): void {
  const img = event.currentTarget;
  if (img.dataset.fallbackApplied === '1') return;
  img.dataset.fallbackApplied = '1';
  img.src = fallback;
}

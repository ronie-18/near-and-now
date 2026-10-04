/**
 * Every image path the shell pages reference must exist in public/ (a typo
 * here only shows up as a broken image in production). Also pins the in-app
 * logo to its downscaled copy (perf/optimisation-2026-10-05, A8): the header
 * and footer show it at 40-48 CSS px, so 192 px covers 4x displays, while the
 * 1563 px original stays for the favicon.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');
const SOURCES = ['index.html', 'src/components/layout/Header.tsx', 'src/components/layout/Footer.tsx', 'src/pages/HomePage.tsx'];

function pngSize(rel: string): { width: number; height: number } {
  const buf = readFileSync(path.join(root, 'public', rel));
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('public image assets', () => {
  it('every /<file>.(png|jpg|jpeg|webp|svg) referenced by the shell pages exists in public/', () => {
    const refs = new Set<string>();
    for (const file of SOURCES) {
      for (const m of read(file).matchAll(/(?:src|href)="\/([\w.-]+\.(?:png|jpe?g|webp|svg))"/g)) refs.add(m[1]);
    }
    expect(refs.size).toBeGreaterThan(0);
    for (const ref of refs) expect(existsSync(path.join(root, 'public', ref)), ref).toBe(true);
  });

  it('header and footer use the 192 px logo; the favicon keeps the original', () => {
    expect(read('src/components/layout/Header.tsx')).toContain('src="/logo-192.png"');
    expect(read('src/components/layout/Footer.tsx')).toContain('src="/logo-192.png"');
    expect(read('index.html')).toContain('rel="icon" type="image/png" href="/Logo.png"');
    expect(pngSize('logo-192.png')).toEqual({ width: 192, height: 192 });
  });
});

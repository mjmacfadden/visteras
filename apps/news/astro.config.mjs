// @ts-check
import { defineConfig } from 'astro/config';

/**
 * 100% Client-side static application for THE DAILY MIKE.
 * - Ready for GitHub Pages, Cloudflare Pages, Netlify, Vercel, or any static host.
 * - Set ASTRO_BASE or ASTRO_SITE via environment / repository settings if hosting under a subpath (e.g. /royko/).
 */
export default defineConfig({
  output: 'static',
  base: process.env.ASTRO_BASE || '/news/',
  site: process.env.ASTRO_SITE || undefined,
  // Dev-only floating toolbar (audits / x-ray) — off for a clean newspaper preview
  devToolbar: { enabled: false },
  vite: {
    optimizeDeps: {
      include: ['@vivliostyle/print', 'fast-xml-parser', 'qrcode'],
    },
    ssr: {
      external: ['@vivliostyle/print'],
    },
  },
});

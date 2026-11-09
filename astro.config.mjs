// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://www.isaacandersonart.com',
  // Pages build to /path/index.html, so URLs are clean (/works/dawn/).
  // CSS and JS are always separate files (never inlined) so the Content-Security-Policy in
  // public/_headers can allow only the site's own code.
  build: { format: 'directory', inlineStylesheets: 'never' },
  vite: { build: { assetsInlineLimit: 0 } },
  image: {
    // Widths generated for artwork srcsets. Phones get ~640px, retina desktop up to 2400px.
    breakpoints: [480, 640, 960, 1280, 1600, 2000, 2400],
  },
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
});

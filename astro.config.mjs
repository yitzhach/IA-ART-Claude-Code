// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://www.isaacandersonart.com',
  // Pages build to /path/index.html, so URLs are clean (/works/dawn/).
  build: { format: 'directory' },
  image: {
    // Widths generated for artwork srcsets. Phones get ~640px, retina desktop up to 2400px.
    breakpoints: [480, 640, 960, 1280, 1600, 2000, 2400],
  },
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
});

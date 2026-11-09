import type { APIRoute } from 'astro';
import { getWorks } from '~/lib/works';

/**
 * Names each artwork image for cross-page view transitions: a card's image glides into the large
 * image on the work's page. Generated as a stylesheet because the Content-Security-Policy blocks
 * inline style attributes. Browsers without view transitions simply navigate as normal.
 */
export const GET: APIRoute = async () => {
  const works = await getWorks();
  const css = works.map((w) => `img[data-vt='${w.id}']{view-transition-name:w-${w.id}}`).join('\n');
  return new Response(css + '\n', { headers: { 'Content-Type': 'text/css' } });
};

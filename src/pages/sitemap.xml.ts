import type { APIRoute } from 'astro';
import { getWorks, workUrl } from '~/lib/works';
import { collectionInfo, site } from '~/lib/site';

/** sitemap.xml — every public page, generated at build time. */
export const GET: APIRoute = async () => {
  const works = await getWorks();
  const paths = [
    '/',
    '/works/',
    ...Object.keys(collectionInfo).map((c) => `/collections/${c}/`),
    ...works.map(workUrl),
    '/commissions/',
    '/process/',
    '/about/',
    '/inquire/',
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `  <url><loc>${new URL(p, site.url).href}</loc></url>`).join('\n')}
</urlset>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
};

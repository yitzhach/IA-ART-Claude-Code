import type { APIRoute } from 'astro';
import { getImage } from 'astro:assets';
import { faq } from '~/lib/faq';
import { site, collectionInfo } from '~/lib/site';
import { getWorks, workUrl, refTitle, sizeLabel, sizeLabelCm, priceLabel, collectionsLabel } from '~/lib/works';

/**
 * Everything the Ask AI assistant knows, generated at build time from the catalogue and FAQ.
 * The browser uses it for instant answers; the /api/ask Worker reads the same file, so the
 * AI never sees a stale price or a work that has since sold.
 */
export const GET: APIRoute = async () => {
  const works = await getWorks();
  const items = await Promise.all(
    works.map(async (w) => {
      const thumb = await getImage({ src: w.data.images[0], width: 320, format: 'webp', quality: 72 });
      return {
        slug: w.id,
        title: refTitle(w),
        titled: Boolean(w.data.title),
        url: workUrl(w),
        thumb: thumb.src,
        collections: w.data.collections,
        collectionsLabel: collectionsLabel(w),
        status: w.data.status,
        price: w.data.price ?? null,
        priceLabel: priceLabel(w),
        width: w.data.width ?? null,
        height: w.data.height ?? null,
        size: sizeLabel(w),
        sizeCm: sizeLabelCm(w),
        medium: w.data.medium ?? null,
        year: w.data.year ?? null,
        statement: w.body?.trim() || null,
      };
    }),
  );

  const body = {
    studio: {
      name: 'Isaac Anderson Art',
      artist: 'Isaac Anderson',
      tagline: site.tagline,
      studios: site.studios,
      phone: site.phone.display,
      instagram: site.instagram.handle,
      leadTime: site.leadTime,
      replyPromise: site.replyPromise,
      collections: collectionInfo,
    },
    faq,
    works: items,
  };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
};

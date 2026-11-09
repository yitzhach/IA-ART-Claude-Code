/**
 * schema.org data for search engines (Google rich results, Pinterest, link previews).
 * Each page passes one of these to <Base jsonLd={…}>.
 */
import { site, collectionInfo } from './site';
import { type Work, refTitle, workUrl } from './works';

const abs = (path: string) => new URL(path, site.url).href;

export const artistSchema = () => ({
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: 'Isaac Anderson',
  jobTitle: 'Sculptor',
  url: site.url,
  sameAs: [site.instagram.href],
  knowsAbout: ['Sculpture', 'Cement', 'Plaster', 'Mixed media', 'Site-specific art'],
});

/** A work as VisualArtwork (with an Offer when it has a price and is available), plus its breadcrumb trail. */
export function workSchema(work: Work) {
  const d = work.data;
  const title = refTitle(work);
  const primary = d.collections[0];
  const artwork = {
    '@type': 'VisualArtwork',
    name: title,
    url: abs(workUrl(work)),
    creator: { '@type': 'Person', name: 'Isaac Anderson', url: site.url },
    artform: d.collections.includes('sculptural') ? 'Relief sculpture' : 'Mixed media',
    ...(d.medium && { artMedium: d.medium }),
    ...(d.year && { dateCreated: String(d.year) }),
    ...(d.width && { width: { '@type': 'Distance', name: `${d.width} in` } }),
    ...(d.height && { height: { '@type': 'Distance', name: `${d.height} in` } }),
    ...(d.status === 'available' &&
      d.price && {
        offers: {
          '@type': 'Offer',
          price: d.price,
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
          url: abs(workUrl(work)),
        },
      }),
  };
  const trail = [
    { name: 'Works', item: abs('/works/') },
    ...(primary ? [{ name: collectionInfo[primary].name, item: abs(`/collections/${primary}/`) }] : []),
    { name: title, item: abs(workUrl(work)) },
  ];
  const breadcrumbs = {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({ '@type': 'ListItem', position: i + 1, ...t })),
  };
  return { '@context': 'https://schema.org', '@graph': [artwork, breadcrumbs] };
}

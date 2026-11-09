/**
 * Site-wide settings. Contact details, navigation and form endpoints live here —
 * change them once and every page picks them up.
 */
export const site = {
  name: 'Isaac Anderson',
  /** Used in page titles: "Dawn — Isaac Anderson Art" */
  titleSuffix: 'Isaac Anderson Art',
  tagline: 'Sculptural art in cement, plaster and steel',
  description:
    'Site-specific sculptural work in cement, plaster and steel by Isaac Anderson — for private collections, commercial, interior and exterior spaces. Southern California and Southern Kentucky.',
  motto: 'Revelation in the midst of decay.',
  url: 'https://www.isaacandersonart.com',

  phone: { display: '949 · 813 · 5258', href: 'tel:+19498135258' },
  email: 'bobdylan2000@gmail.com',
  instagram: { handle: '@isaacandersonart', href: 'https://www.instagram.com/isaacandersonart/' },
  studios: ['Southern California', 'Southern Kentucky'],

  /** Every inquiry form posts here (Formspree). */
  formEndpoint: 'https://formspree.io/f/xaqrglpk',
  replyPromise: 'We reply within two working days.',
  leadTime: 'Typical lead time 8–12 weeks',

  nav: [
    { href: '/works/', label: 'Works' },
    { href: '/commissions/', label: 'Commissions' },
    { href: '/process/', label: 'Process' },
    { href: '/about/', label: 'About' },
  ],
} as const;

/** The three collections, in display order. */
export const collectionInfo = {
  abstract: {
    name: 'Abstract',
    blurb: 'Contemporary abstract works exploring the space between sculpture, architecture, and painting.',
  },
  figurative: {
    name: 'Figurative',
    // DRAFT copy — v1 had a placeholder here. Isaac to confirm.
    blurb: 'Figures and faces drawn up out of plaster and cement — presence held in a weathered surface.',
  },
  sculptural: {
    name: 'Sculptural',
    // DRAFT copy — v1 had a placeholder here. Isaac to confirm.
    blurb: 'Relief and object work in cement, plaster and steel, built out from the wall and into the room.',
  },
} as const;

export type CollectionKey = keyof typeof collectionInfo;

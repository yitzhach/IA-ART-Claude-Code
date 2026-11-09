/**
 * The assistant's preloaded answers. Shown instantly (no AI call) when a visitor's question
 * matches, and given to the AI as the facts it may rely on.
 *
 * Only state what is true for the studio. When something isn't known yet (exact prices,
 * care instructions, show dates), the answer hands the visitor to Isaac instead of guessing.
 * Questions marked `chip: true` appear as one-tap suggestions in the assistant.
 */
export interface Faq {
  id: string;
  q: string;
  a: string;
  /** Words a visitor might use. Lowercase. */
  keywords: string[];
  links?: { label: string; href: string }[];
  chip?: boolean;
}

export const faq: Faq[] = [
  {
    id: 'available',
    q: 'What’s available right now?',
    a: 'These are the works available today. Open any of them for size, price and how to bring it home — or add a few to your inquiry list and ask about them together.',
    keywords: ['available', 'buy', 'purchase', 'for sale', 'in stock', 'now', 'shop', 'own'],
    links: [{ label: 'All available works', href: '/works/?status=available' }],
    chip: true,
  },
  {
    id: 'commission',
    q: 'How does a commission work?',
    a: 'Four steps. 1 · Consultation — a conversation about the site, scale and use, in person or by video. 2 · Concept — a direction, material palette and quote, refined until form, vision and budget align. 3 · Fabrication — made and finished in the studio, with progress photos as it develops. 4 · Install — delivered and installed on site throughout the U.S. and internationally.',
    keywords: ['commission', 'custom', 'bespoke', 'made to order', 'process', 'steps', 'order', 'create', 'design'],
    links: [{ label: 'Start a commission', href: '/commissions/#inquire' }],
    chip: true,
  },
  {
    id: 'price',
    q: 'What does a piece cost?',
    a: 'Each work is priced individually by size, materials and installation. Where a price isn’t listed it’s on request — ask and the studio replies within two working days. For commissions, the quote comes with the concept, once size and materials are settled.',
    keywords: ['price', 'cost', 'how much', 'expensive', 'budget', 'pricing', 'quote', 'afford', '$', 'dollars'],
    links: [{ label: 'Ask about pricing', href: '/inquire/' }],
    chip: true,
  },
  {
    id: 'lead-time',
    q: 'How long does a commission take?',
    a: 'Typically 8–12 weeks from approved concept, depending on scale and the number of pieces. The timeline is agreed with you at the concept stage.',
    keywords: ['how long', 'lead time', 'timeline', 'weeks', 'months', 'when', 'deadline', 'turnaround', 'time'],
    links: [{ label: 'Commissions', href: '/commissions/' }],
  },
  {
    id: 'delivery',
    q: 'Do you ship and install?',
    a: 'Yes — work is delivered and installed on site throughout the U.S. and internationally. Tell the studio where the piece is going and it will advise on delivery and installation.',
    keywords: ['ship', 'shipping', 'deliver', 'delivery', 'install', 'installation', 'hang', 'international', 'crate', 'freight'],
    links: [{ label: 'Ask about delivery', href: '/inquire/' }],
    chip: true,
  },
  {
    id: 'trade',
    q: 'Do you work with designers and architects?',
    a: 'Yes. Commissions are developed with architects, interior designers, art consultants and private collectors, from first sketch to final install — one piece or a full program. To-the-trade inquiries are welcome.',
    keywords: ['designer', 'interior designer', 'architect', 'trade', 'consultant', 'hospitality', 'hotel', 'commercial', 'project', 'specifier', 'lobby'],
    links: [{ label: 'Tell us about the project', href: '/inquire/' }],
    chip: true,
  },
  {
    id: 'wall',
    q: 'Can I see a piece on my wall?',
    a: 'Yes. On any work’s page, “View on your wall” shows it at true scale on a photo of your own wall — the photo stays on your device. For commissions, the studio also prepares digital mock-ups of the proposed piece in your space.',
    keywords: ['wall', 'visualize', 'visualise', 'see it', 'mock', 'mockup', 'preview', 'room', 'scale', 'my space', 'fit'],
    links: [{ label: 'Browse works', href: '/works/' }],
    chip: true,
  },
  {
    id: 'materials',
    q: 'What are the works made of?',
    a: 'Gypsum, lime and cementitious plasters layered on custom wood panels, with hand-mixed mineral pigments and copper or brass gilding. Sculptural work adds cast cement, geopolymer and welded steel. Surfaces are built up, carved, sanded and excavated, so every piece carries the record of its making.',
    keywords: ['material', 'materials', 'made of', 'plaster', 'cement', 'concrete', 'steel', 'pigment', 'medium', 'gold', 'gilding', 'technique'],
    links: [{ label: 'The process', href: '/process/' }],
  },
  {
    id: 'size',
    q: 'Can a piece be made in a different size or colour?',
    a: 'Every work is one of a kind, but if a piece is the wrong size or already sold, the studio can make a new work in the same spirit to your dimensions and palette — that’s a commission.',
    keywords: ['different size', 'bigger', 'larger', 'smaller', 'colour', 'color', 'palette', 'similar', 'like this', 'sold', 'another'],
    links: [{ label: 'Start a commission', href: '/commissions/#inquire' }],
  },
  {
    id: 'outdoor',
    q: 'Can work go outside?',
    a: 'Commissions can be made for interior or exterior settings. Exterior work is made for that purpose, so tell the studio where a piece will live before you buy.',
    keywords: ['outside', 'outdoor', 'exterior', 'garden', 'patio', 'weather', 'rain', 'sun'],
    links: [{ label: 'Ask the studio', href: '/inquire/' }],
  },
  {
    id: 'studio',
    q: 'Where is the studio?',
    a: 'Isaac works between two studios, in Southern California and Southern Kentucky. Consultations happen in person or by video.',
    keywords: ['where', 'studio', 'location', 'visit', 'california', 'kentucky', 'based', 'meet', 'in person'],
    links: [{ label: 'About Isaac', href: '/about/' }],
  },
  {
    id: 'contact',
    q: 'How do I reach the studio?',
    a: 'Send a note through the inquiry form, call 949 · 813 · 5258, or message @isaacandersonart on Instagram. The studio replies within two working days.',
    keywords: ['contact', 'reach', 'email', 'phone', 'call', 'talk', 'message', 'speak', 'human', 'person', 'isaac'],
    links: [{ label: 'Inquire', href: '/inquire/' }],
  },
];

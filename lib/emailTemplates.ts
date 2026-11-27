/**
 * Starting points for a new email. Each is just a doc + audience; everything
 * stays editable. Copy follows the Stationly voice: plain words, no dashes.
 */
import { uid, type AudienceFilter, type EmailBlock, type EmailDoc } from './emailTypes';

export interface EmailTemplate {
  id: string;
  name: string;
  description: string;
  doc: EmailDoc;
  audience: AudienceFilter;
}

const b = <T extends Omit<EmailBlock, 'id'>>(x: T) => ({ id: uid(), ...x }) as EmailBlock;

const base = (o: Partial<EmailDoc>): EmailDoc => ({
  subject: '', preheader: '', fromName: 'Stationly', category: 'service',
  header: { logo: true, accentBars: true }, blocks: [], ...o,
});

export function emailTemplates(): EmailTemplate[] {
  return [
    {
      id: 'blank',
      name: 'Blank',
      description: 'Logo, a heading and a paragraph.',
      doc: base({ blocks: [b({ type: 'heading', text: 'Your heading' }), b({ type: 'text', text: 'Hi {{first_name}},\n\nWrite your message here.' }), b({ type: 'signoff', name: 'Stationly Support' })] }),
      audience: { source: 'none', customEmails: [] },
    },
    {
      id: 'service',
      name: 'Service notice',
      description: 'Explain an issue affecting a feature people use, with sources.',
      doc: base({
        subject: 'About your {{station}} board',
        preheader: 'Something you may have noticed, and why.',
        blocks: [
          b({ type: 'heading', eyebrow: 'Service update', text: 'Something you may have noticed', size: 'lg' }),
          b({ type: 'text', text: 'Hi {{first_name}},\n\nYou follow **{{station}}** in Stationly, so we want to explain something you may have seen on your board.' }),
          b({ type: 'callout', tone: 'note', title: 'What is happening', text: 'Describe the issue in one or two plain sentences.' }),
          b({ type: 'text', text: 'What we are doing about it, and what still works as normal.' }),
          b({ type: 'quote', text: 'A short quote from an official source.', cite: 'Source name, date', citeUrl: 'https://' }),
          b({ type: 'signoff', text: 'Thanks for using Stationly, and sorry for the trouble.', name: 'Stationly Support' }),
          b({ type: 'divider' }),
          b({ type: 'references', title: 'References', items: [{ text: 'Source title, publisher, date', url: 'https://' }] }),
        ],
      }),
      audience: { source: 'users', stations: [], lines: [] },
    },
    {
      id: 'update',
      name: 'App update',
      description: 'Announce a new version, with store badges. Marketing, so it carries an unsubscribe link.',
      doc: base({
        category: 'marketing',
        // The big centred logo below replaces the small header one.
        header: { logo: false, accentBars: true },
        subject: 'Stationly 2.0 is here',
        preheader: 'Up to four stations, filters and a widget for each.',
        blocks: [
          b({ type: 'icons', items: ['logo'], size: 56, align: 'center' }),
          b({ type: 'heading', eyebrow: 'New version', text: 'Stationly 2.0', accent: 'is here.', align: 'center' }),
          b({ type: 'text', text: 'Hi {{first_name}}, the biggest update yet is ready for you.', align: 'center' }),
          b({ type: 'list', items: ['**Up to four stations**, every line on one board', '**Filters**, so you only see the trains you want', '**A widget for each station**'] }),
          b({ type: 'storeBadges', ios: false, android: true, align: 'center', caption: 'Free, no ads.' }),
          b({ type: 'signoff', name: 'Stationly Support' }),
        ],
      }),
      audience: { source: 'users', platforms: ['android'], appVersion: { platform: 'android', op: 'lt', value: '2.0' } },
    },
  ];
}

export const BLOCK_PALETTE: Array<{ type: EmailBlock['type']; label: string; hint: string; make: () => EmailBlock }> = [
  { type: 'heading', label: 'Heading', hint: 'Title, with optional eyebrow and red accent line', make: () => b({ type: 'heading', text: 'Heading' }) },
  { type: 'text', label: 'Text', hint: '**bold**, *italic*, [link](https://…)', make: () => b({ type: 'text', text: '' }) },
  { type: 'image', label: 'Image', hint: 'Upload or paste a link', make: () => b({ type: 'image', url: '', alt: '', rounded: true, align: 'center' }) },
  { type: 'button', label: 'Button', hint: 'A call to action', make: () => b({ type: 'button', label: 'Open Stationly', url: 'https://stationly.co.uk', variant: 'primary', align: 'left' }) },
  { type: 'storeBadges', label: 'Store badges', hint: 'App Store and Google Play', make: () => b({ type: 'storeBadges', ios: true, android: true, align: 'center' }) },
  { type: 'icons', label: 'Icons', hint: 'Logo and mode icons', make: () => b({ type: 'icons', items: ['tube', 'bus', 'dlr', 'elizabeth', 'overground'], size: 32, align: 'center' }) },
  { type: 'callout', label: 'Callout', hint: 'A highlighted box', make: () => b({ type: 'callout', tone: 'info', text: '' }) },
  { type: 'quote', label: 'Quote', hint: 'With a linked source', make: () => b({ type: 'quote', text: '' }) },
  { type: 'list', label: 'List', hint: 'Bullets or numbers', make: () => b({ type: 'list', items: [''] }) },
  { type: 'references', label: 'References', hint: 'Numbered sources', make: () => b({ type: 'references', title: 'References', items: [{ text: '', url: '' }] }) },
  { type: 'signoff', label: 'Sign-off', hint: 'Name and role', make: () => b({ type: 'signoff', name: 'Stationly Support' }) },
  { type: 'divider', label: 'Divider', hint: 'A thin line', make: () => b({ type: 'divider' }) },
  { type: 'spacer', label: 'Spacer', hint: 'Empty space', make: () => b({ type: 'spacer', size: 16 }) },
];

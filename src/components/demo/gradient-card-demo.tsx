import { GradientCard } from '@/components/ui/gradient-card';

// The upstream demo hot-linked decorative art from thiings.co's blob storage.
// This repo is public and deployed, so it must not depend on another company's
// CDN or ship their assets. These are inline SVG data URIs instead — no network
// request, no licence question. Pass any URL you like through `imageUrl`.
const blob = (a: string, b: string) =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
       <defs><radialGradient id="g" cx="35%" cy="30%">
         <stop offset="0%" stop-color="${a}"/><stop offset="100%" stop-color="${b}"/>
       </radialGradient></defs>
       <circle cx="100" cy="100" r="92" fill="url(#g)"/>
       <circle cx="72" cy="70" r="26" fill="#fff" opacity="0.28"/>
     </svg>`
  );

const cardData = [
  {
    badgeText: 'Open / Invite-priority',
    badgeColor: '#F59E0B',
    title: 'Companies',
    description:
      'Build teams of highly motivated tech-professionals across the globe, with projects across all industries.',
    ctaText: 'Start hiring',
    ctaHref: '#',
    imageUrl: blob('#FDBA74', '#D97706'),
    gradient: 'orange' as const,
  },
  {
    badgeText: 'Open for applications',
    badgeColor: '#4B5563',
    title: 'Builders',
    description:
      'Work on your own terms in a motivating and healthy environment. You will earn TMW-tokens too!',
    ctaText: 'Apply now',
    ctaHref: '#',
    imageUrl: blob('#CBD5E1', '#475569'),
    gradient: 'gray' as const,
  },
  {
    badgeText: 'Invite only',
    badgeColor: '#8B5CF6',
    title: 'Scouts',
    description:
      'As a scout you will utilize your network to refer new members and companies to earn ownership in form of TMW-tokens.',
    ctaText: 'Request invite',
    ctaHref: '#',
    imageUrl: blob('#C4B5FD', '#6D28D9'),
    gradient: 'purple' as const,
  },
  {
    badgeText: 'Invite only',
    badgeColor: '#10B981',
    title: 'Partners',
    description:
      'As a partner you can offer direct access to the Teamway society to your portfolio companies, community or customers.',
    ctaText: 'Get in touch',
    ctaHref: '#',
    imageUrl: blob('#6EE7B7', '#047857'),
    gradient: 'green' as const,
  },
];

const GradientCardDemo = () => {
  return (
    <div className="p-4 sm:p-8">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:gap-10">
        {cardData.map((card) => (
          <GradientCard key={card.title} {...card} />
        ))}
      </div>
    </div>
  );
};

export default GradientCardDemo;

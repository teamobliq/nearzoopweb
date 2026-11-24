import DocPage, { type DocSection } from './DocPage'

type Props = { onBack: () => void }

const SECTIONS: DocSection[] = [
  {
    heading: '1. Who can register',
    paragraphs: [
      'A shop must be run by the owner or an authorised manager. The name, phone number, email address and verification document you give us should be accurate and belong to your business.',
      'We verify your phone with a one-time code and ask you to confirm your email. Verification is not approval to go live — a person on our team checks your shop before the verified badge appears.',
    ],
  },
  {
    heading: '2. Your shop listing',
    paragraphs: [
      'Your listing shows the details customers need to find you: shop name, category, address, map pin, opening hours and photos. Keep them current — a wrong pin or hours means customers can turn up at the wrong time.',
    ],
    bullets: [
      'Changing your shop name sends it back for verification.',
      'Holiday mode keeps your listing but pauses its offers.',
      'You can edit your name, phone, photo and hours from the Shop page at any time.',
    ],
  },
  {
    heading: '3. Listing fee',
    paragraphs: [
      'An annual listing fee of ₹1,000 activates your shop and keeps it listed for one year. Payment is handled by Razorpay; NearZoop does not store your card details.',
      'When the year ends, you renew from your dashboard. A paid fee is not a promise of sales — it pays for the listing, not for customer traffic or redemptions.',
    ],
  },
  {
    heading: '4. Offers and redemptions',
    paragraphs: [
      'You decide the deal, its dates and how a customer redeems it. Once an offer is live, honour it exactly as written. Staff should scan the coupon or mark a redemption when a customer uses it.',
      'Customers can report an offer if the terms were misleading or the shop refused to honour it. We review each report with the shop and may ask for changes or take the offer down.',
    ],
  },
  {
    heading: '5. Review and moderation',
    paragraphs: [
      'Every new offer is reviewed before it goes live. We may approve it, ask for changes, or remove it. Notifications of those decisions land in your dashboard and are emailed to your confirmed address.',
      'We may pause a shop or an offer that breaks these terms, contains unsafe or unlawful claims, or misleads customers.',
    ],
  },
  {
    heading: '6. Your data and customer privacy',
    paragraphs: [
      'Your verified email is used for registration, verification and important shop updates. Phones shown on your listing are the business number you chose to publish.',
      'Shops see anonymous view, save and redemption counts. When a customer files a report, their identity is not shared with the shop.',
    ],
  },
  {
    heading: '7. Availability and changes',
    paragraphs: [
      'The feed, map and payments depend on outside services. We may need to pause parts of the service for maintenance or failures beyond our control.',
      'We may update these terms as the product changes. The date at the bottom of this page always shows the latest version; continuing to use NearZoop after an update means you accept it.',
    ],
  },
]

export default function MerchantTerms({ onBack }: Props) {
  return (
    <DocPage
      eyebrow="NearZoop for business · Legal"
      title="Merchant Terms"
      intro="Plain-language rules for listing your shop and posting offers on NearZoop. This is a summary of how the service works, not legal advice."
      quick={[
        '₹1,000 a year keeps your shop listed — it does not guarantee sales.',
        'Your shop details and verification document must be accurate.',
        'You honour every live offer exactly as written.',
        'Reviews, reports and reminders reach your verified email and dashboard.',
      ]}
      sections={SECTIONS}
      onBack={onBack}
    />
  )
}

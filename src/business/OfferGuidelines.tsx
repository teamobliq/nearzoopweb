import DocPage, { type DocSection } from './DocPage'

type Props = { onBack: () => void }

const SECTIONS: DocSection[] = [
  {
    heading: '1. Say exactly what the deal is',
    paragraphs: [
      'Use a title a customer can understand in one glance. State the real discount or amount, and make sure it matches what a customer actually gets at the counter.',
    ],
    bullets: [
      '“50% OFF” should mean half off, not half off a selected high-priced item.',
      'If a minimum bill applies, say so in the terms — not only in the description.',
      'Avoid “up to” unless the conditions are obvious and visible on the card.',
    ],
  },
  {
    heading: '2. Use clear photos',
    paragraphs: [
      'Offer photos should show the actual product or service being offered. A clear shop-front photo helps customers recognise you on the map.',
    ],
    bullets: [
      'No unrelated stock photos, screenshots of text, or heavily edited claims.',
      'Keep the shop front landscape (4:3) so it crops well everywhere.',
      'Documents are for verification only and are never shown in the public feed.',
    ],
  },
  {
    heading: '3. Set honest dates',
    paragraphs: [
      'A start date in the future reads Scheduled and goes live on its own at that time. An end date in the past reads Ended. Pick a window that you can actually honour.',
      'Very short or constantly renewed offers look misleading. If a deal is ongoing, describe it honestly as an everyday offer instead of recycling it.',
    ],
  },
  {
    heading: '4. Pick one way to redeem',
    paragraphs: [
      'Choose the method your staff can actually check: show the offer screen, say a code, claim a single-use coupon, or a custom instruction you spell out.',
      'A code or coupon you can’t verify at the counter will confuse customers — use “show this offer” until your staff have a way to check.',
    ],
  },
  {
    heading: '5. Put every condition up front',
    paragraphs: [
      'Minimum bill, in-store only, new customers only and exclusions appear on the public offer card. Anything that changes the deal belongs there, not in small print after the sale.',
      'If you use a coupon, the single-use code is shown to the customer and redeemed by your staff. Redemptions count only when you scan or mark them.',
    ],
  },
  {
    heading: '6. What gets sent back',
    paragraphs: [
      'The review team may ask for changes when a title is vague, the discount doesn’t match the description, dates are missing or expired, the redemption path is unclear, or the terms hide a condition.',
      'A quick fix note in your dashboard shows exactly what to change. Edited offers go through review again before they go live.',
    ],
  },
  {
    heading: '7. After approval',
    paragraphs: [
      'Customer reports about misleading terms or refused redemptions are reviewed with your shop. Repeated or serious problems can pause an offer or the whole listing.',
      'Specific, honest offers get more saves than vague ones. Keep the title short, the discount exact and the redemption simple.',
    ],
  },
]

export default function OfferGuidelines({ onBack }: Props) {
  return (
    <DocPage
      eyebrow="NearZoop for business · Reviews"
      title="Offer Guidelines"
      intro="What our reviewers look for, and what customers expect when they tap an offer. Follow these and your offer usually clears review faster."
      quick={[
        'The discount in the tile matches the deal in the description.',
        'Dates are real, and the offer can be redeemed during them.',
        'Every condition is visible on the card before a customer claims.',
        'Staff can actually check the redemption method you chose.',
      ]}
      sections={SECTIONS}
      onBack={onBack}
    />
  )
}

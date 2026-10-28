import logoUrl from '../assets/logo.svg'

type OfferBubbleProps = {
  text: string
  tail: 'left' | 'right'
  className?: string
}

/**
 * Speech-bubble offer sticker, drawn as one merged path
 * (rounded rect + tail) so the hard shadow follows the whole shape.
 */
const BUBBLE_PATH: Record<OfferBubbleProps['tail'], string> = {
  left: 'M24 4H176Q196 4 196 24V48Q196 68 176 68H56L38 88Q33 94 36 86L46 68H24Q4 68 4 48V24Q4 4 24 4Z',
  right:
    'M176 4H24Q4 4 4 24V48Q4 68 24 68H144L162 88Q167 94 164 86L154 68H176Q196 68 196 48V24Q196 4 176 4Z',
}

function OfferBubble({ text, tail, className }: OfferBubbleProps) {
  return (
    <svg
      className={`art-bubble${className ? ` ${className}` : ''}`}
      viewBox="0 0 200 94"
      aria-hidden="true"
    >
      <path
        d={BUBBLE_PATH[tail]}
        fill="#FFFFFF"
        stroke="#1C1B19"
        strokeWidth={5}
        strokeLinejoin="round"
      />
      <text
        x="100"
        y="36"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={30}
        letterSpacing={-0.5}
      >
        {text}
      </text>
    </svg>
  )
}

/**
 * Decorative "map board" for the right side of the sign-in screens
 * (desktop only) — one composed paper card: clipped map patches, the
 * dashed search-radius ring with a center pin, and offer stickers.
 * Purely presentational — hidden from assistive tech and skipped
 * below 1060px where it mirrors the app's plain layout.
 */
export default function ArtField() {
  return (
    <aside className="flow-art" aria-hidden="true">
      <div className="art-board">
        <div className="art-patch art-patch-sage" />
        <div className="art-patch art-patch-lake" />
        <div className="art-patch art-patch-cream" />
        <div className="art-ring" />
        <span className="art-pin" />
        <OfferBubble tail="left" text="BOGO" className="art-pos-bogo" />
        <OfferBubble tail="right" text="20% OFF" className="art-pos-off" />
        <OfferBubble tail="left" text="₹699" className="art-pos-price" />
        <OfferBubble tail="right" text="10 for 8" className="art-pos-ten" />
      </div>

      <figure className="art-mark">
        <img src={logoUrl} alt="" />
      </figure>
    </aside>
  )
}

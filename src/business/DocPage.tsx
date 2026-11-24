import type { ReactNode } from 'react'

export type DocSection = {
  heading: string
  paragraphs?: string[]
  bullets?: string[]
}

type Props = {
  eyebrow: string
  title: string
  intro: string
  quick: string[]
  sections: DocSection[]
  footer?: ReactNode
  onBack: () => void
}

function BackSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 5-7 7 7 7" />
    </svg>
  )
}

function CheckSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  )
}

/** Shared layout for the merchant's plain-language policy documents. */
export default function DocPage({ eyebrow, title, intro, quick, sections, footer, onBack }: Props) {
  return (
    <main className="biz-page">
      <div className="biz-shell biz-doc">
        <header className="biz-doc-head">
          <button
            type="button"
            className="biz-doc-back nz-icon-btn"
            onClick={onBack}
            aria-label="Back"
          >
            <BackSvg />
          </button>
          <span className="biz-doc-eyebrow">{eyebrow}</span>
        </header>

        <h1 className="biz-doc-title">{title}</h1>
        <p className="biz-doc-intro">{intro}</p>

        <section className="biz-doc-callout">
          <h2>The short version</h2>
          <ul>
            {quick.map((line) => (
              <li key={line}>
                <CheckSvg />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>

        {sections.map((section) => (
          <section className="biz-doc-section" key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs?.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {section.bullets && (
              <ul>
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <p className="biz-doc-foot">
          Last updated 24 Nov 2026 · NearZoop
          {footer ? <> · {footer}</> : null}
        </p>
      </div>
    </main>
  )
}

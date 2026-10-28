type Variant = 'checking' | 'failed'

type Props = {
  variant: Variant
  /** "Draft my first offer" (checking) / "Upload another document" (failed). */
  onPrimary: () => void
  onDashboard: () => void
  /** Demo hook: flips between checking and failed until a real backend exists. */
  onDemoSwitch: () => void
}

const COPY: Record<
  Variant,
  {
    title: string
    body: string
    state: string
    cta: string
  }
> = {
  checking: {
    title: 'Checking your shop.',
    body: 'Usually under 24 hours. We’ll SMS you. Meanwhile you can draft your first offer.',
    state: 'In progress',
    cta: 'Draft my first offer',
  },
  failed: {
    title: 'We couldn’t verify that.',
    body:
      'The GSTIN legal name (S. Das Textiles) doesn’t match “Gariahat Saree Ghar”. Upload a trade licence or a signboard photo instead.',
    state: 'Action needed',
    cta: 'Upload another document',
  },
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 96 96" fill="none" stroke="#1C1B19" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="48" cy="48" r="30" />
      <path d="M48 30v20l13 9" />
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 96 96" fill="none" stroke="#FFFFFF" strokeWidth={8} strokeLinecap="round" aria-hidden="true">
      <circle cx="48" cy="48" r="30" />
      <path d="M48 42v26" />
      <path d="M48 27.5v.1" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#12894B" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  )
}

function ClockSmallIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#D08708" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3.2 2.2" />
    </svg>
  )
}

function CrossIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="#C0392B" strokeWidth={3.2} strokeLinecap="round" aria-hidden="true">
      <path d="M7 7l10 10M17 7 7 17" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg className="biz-cta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function FileIcon() {
  return (
    <svg
      className="biz-cta-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  )
}

export default function BusinessStatus({
  variant,
  onPrimary,
  onDashboard,
  onDemoSwitch,
}: Props) {
  const copy = COPY[variant]
  const rows = [
    { icon: <CheckIcon />, chip: 'done', label: 'Shop details', state: 'Done' },
    { icon: <CheckIcon />, chip: 'done', label: 'Location & hours', state: 'Done' },
    {
      icon: variant === 'checking' ? <ClockSmallIcon /> : <CrossIcon />,
      chip: variant,
      label: 'Document check',
      state: copy.state,
    },
  ]

  return (
    <main className="biz-page">
      <div className="biz-shell">
        <span className={`biz-bigtile biz-bigtile-${variant}`} aria-hidden="true">
          {variant === 'checking' ? <ClockIcon /> : <InfoIcon />}
        </span>

        <h1 className="biz-status-title">{copy.title}</h1>
        <p className="biz-status-body">{copy.body}</p>

        <ul className="biz-checklist">
          {rows.map((row) => (
            <li className="biz-checkrow" key={row.label}>
              <span className={`biz-chipicon biz-chipicon-${row.chip}`}>
                {row.icon}
              </span>
              <span className="biz-checklabel">{row.label}</span>
              <span className="biz-checkstate">{row.state}</span>
            </li>
          ))}
        </ul>

        <button type="button" className="btn-primary biz-btn biz-statuscta" onClick={onPrimary}>
          {variant === 'checking' ? <PlusIcon /> : <FileIcon />}
          {copy.cta}
        </button>

        <button type="button" className="biz-linkbtn" onClick={onDashboard}>
          Go to dashboard
        </button>

        <button type="button" className="biz-demo" onClick={onDemoSwitch}>
          {variant === 'checking'
            ? 'demo · show the failed state'
            : 'demo · back to checking'}
        </button>
      </div>
    </main>
  )
}

/**
 * The brand mark: a tower-crane silhouette drawn in currentColor so it
 * inherits the amber text token and re-lights with the theme — unlike the
 * platform emoji it replaced, which drew differently on every OS and ignored
 * the palette entirely.
 */
export default function Logo({ size = 'md', className = '' }) {
  const box = size === 'lg' ? 'w-14 h-14 rounded-card' : 'w-8 h-8 rounded-btn'
  const glyph = size === 'lg' ? 30 : 18
  return (
    <span
      className={`${box} bg-primary/15 text-primary-text flex items-center justify-center shrink-0 ${className}`}
      aria-hidden="true"
    >
      <svg
        width={glyph}
        height={glyph}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* ground, mast, jib, counter-tie, cable and hook */}
        <path d="M5.5 21h6" />
        <path d="M8.5 21V5" />
        <path d="M3 5h18" />
        <path d="M8.5 2.5V5" />
        <path d="M8.5 2.5L15 5" />
        <path d="M3 5v2.5" />
        <path d="M18.5 5v3.5" />
        <circle cx="18.5" cy="10.2" r="1.4" />
      </svg>
    </span>
  )
}

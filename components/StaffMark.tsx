/**
 * The staff, drawn rather than fetched.
 *
 * Same geometry as `public/icon.svg`, which `scripts/make-icons.mjs` writes —
 * a shaft with a cut stone at its head, tilted 12° so it reads as something
 * held rather than a diagram of itself. The two are kept in step by a test.
 */
export default function StaffMark({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect width="64" height="64" rx="12" fill="#5b1d8e" />
      <g transform="rotate(12 32 30)">
        <rect x="28.5" y="24" width="7" height="34" rx="1.5" fill="#f6f0fc" />
        <path d="M32 3 44 15 32 27 20 15z" fill="#f6f0fc" />
      </g>
    </svg>
  );
}

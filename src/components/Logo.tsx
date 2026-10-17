type LogoProps = {
  /** Width and height in pixels. */
  size?: number;
  /** Play the slow ripple and the pulsing start node. */
  animated?: boolean;
  /** Warm glow behind the mark. */
  glow?: boolean;
  /** Set when a visible name sits next to the mark, so screen readers do not hear it twice. */
  decorative?: boolean;
  className?: string;
};

export default function Logo({
  size = 40,
  animated = true,
  glow = false,
  decorative = false,
  className,
}: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "LinkGuard logo"}
      aria-hidden={decorative ? true : undefined}
      style={glow ? { filter: "drop-shadow(0 0 8px rgba(255, 181, 71, 0.35))" } : undefined}
    >
      <polygon
        points="18,1 46,1 63,18 63,46 46,63 18,63 1,46 1,18"
        fill="#162231"
        stroke="#4D6280"
        strokeWidth="2"
      />
      <line x1="16" y1="46" x2="30" y2="35" stroke="#9FB0C3" strokeWidth="4" strokeLinecap="round" />
      <circle className={animated ? "lg-node" : undefined} cx="16" cy="46" r="4" fill="#9FB0C3" />
      {animated && (
        <circle
          className="lg-ripple"
          cx="40"
          cy="26"
          r="11"
          fill="none"
          stroke="#FFB547"
          strokeWidth="2"
        />
      )}
      <circle cx="40" cy="26" r="11" fill="none" stroke="#FFB547" strokeWidth="5" />
      <circle cx="40" cy="26" r="3" fill="#FFB547" />
    </svg>
  );
}
export function SentriveLogo({ size = 26 }: { size?: number }) {
  return (
    <img
      src="/sentrive.png"
      alt=""
      width={size}
      height={size}
      style={{ borderRadius: Math.round(size * 0.28), display: "block" }}
      aria-hidden="true"
    />
  );
}

/**
 * The app's canvas: a calm, flat, blue-tinted gradient with one faint glow.
 * The old fractal-cloud texture read as busy next to the cards and swallowed
 * their shadows; premium surfaces need a quiet floor. Styled in dashboard.css.
 */
export function SentriveSky() {
  return <div className="flowy-app-sky" aria-hidden="true" />;
}

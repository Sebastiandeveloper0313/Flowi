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

export function SentriveSky() {
  return (
    <div className="flowy-app-sky" aria-hidden="true">
      <svg
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="dsky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#bcd6f2" />
            <stop offset="38%" stopColor="#d8e7f7" />
            <stop offset="100%" stopColor="#f3f6fb" />
          </linearGradient>
          <radialGradient id="dhaze" cx="50%" cy="10%" r="70%">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
            <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <filter id="dclouds" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.004 0.008"
              numOctaves={3}
              seed={31}
              stitchTiles="stitch"
              result="t"
            />
            <feColorMatrix
              in="t"
              type="matrix"
              values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -1.6 1.35"
            />
          </filter>
        </defs>
        <rect width="1440" height="900" fill="url(#dsky)" />
        <rect width="1440" height="900" filter="url(#dclouds)" />
        <rect width="1440" height="900" fill="url(#dhaze)" />
      </svg>
    </div>
  );
}

import type { ReactNode } from "react";

import "@/features/landing/landing.css";

/** Shared shell for the public legal pages (terms, privacy), styled like the landing page. */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="flowy">
      <header className="nav-wrap">
        <nav className="nav">
          <a className="brand" href="/" aria-label="Senable home">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 100 100" width="28" height="28">
                <rect width="100" height="100" rx="28" fill="url(#bmLegal)" />
                <path
                  d="M34 32h34M34 50h27M34 68h18"
                  stroke="white"
                  strokeWidth="9"
                  strokeLinecap="round"
                />
                <defs>
                  <linearGradient id="bmLegal" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#5aa6ff" />
                    <stop offset="1" stopColor="#1566e6" />
                  </linearGradient>
                </defs>
              </svg>
            </span>
            <span className="brand-name">senable</span>
          </a>

          <ul className="nav-links">
            <li>
              <a href="/#how">How it works</a>
            </li>
            <li>
              <a href="/#security">Security</a>
            </li>
            <li>
              <a href="/#pricing">Pricing</a>
            </li>
          </ul>

          <div className="nav-cta">
            <a href="/auth/login" className="btn btn-ghost-sm">
              Sign in
            </a>
            <a href="/auth/signup" className="btn btn-dark btn-beam">
              Start Free Trial
            </a>
          </div>
        </nav>
      </header>

      <main className="legal">
        <div className="legal-head">
          <span className="badge-pill">Legal</span>
          <h1 className="legal-title">{title}</h1>
          <p className="legal-updated">Last updated: {updated}</p>
        </div>

        <div className="legal-card">{children}</div>

        <div className="legal-foot">
          <span>© 2026 Senable</span>
          <a href="mailto:sebastiandevbusiness@gmail.com">Contact</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </div>
      </main>
    </div>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="legal-section">
      <h2>{heading}</h2>
      {children}
    </section>
  );
}

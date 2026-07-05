import type { ReactNode } from "react";

import "@/features/landing/landing.css";

/** Public marketing/content page shell in the landing design language. */
export function ContentPage({
  badge,
  title,
  lede,
  children,
}: {
  badge: string;
  title: string;
  lede?: string;
  children: ReactNode;
}) {
  return (
    <div className="flowy">
      <header className="nav-wrap">
        <nav className="nav">
          <a className="brand" href="/" aria-label="Sentrive home">
            <span className="brand-mark" aria-hidden="true">
              <img
                src="/sentrive.png"
                alt=""
                width="28"
                height="28"
                style={{ borderRadius: 8, display: "block" }}
              />
            </span>
            <span className="brand-name">sentrive</span>
          </a>

          <ul className="nav-links">
            <li>
              <a href="/#how">How it works</a>
            </li>
            <li>
              <a href="/use-cases">Use cases</a>
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
          <span className="badge-pill">{badge}</span>
          <h1 className="legal-title">{title}</h1>
          {lede && <p className="legal-updated">{lede}</p>}
        </div>

        <div className="legal-card">{children}</div>

        <div className="content-cta">
          <a href="/auth/signup" className="btn btn-blue btn-lg">
            Start 3-day Free Trial
          </a>
          <p>$49/month after the trial. Cancel anytime, one click.</p>
        </div>

        <div className="legal-foot">
          <span>© 2026 Sentrive</span>
          <a href="/use-cases">Use cases</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </div>
      </main>
    </div>
  );
}

export function ContentSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="legal-section">
      <h2>{heading}</h2>
      {children}
    </section>
  );
}

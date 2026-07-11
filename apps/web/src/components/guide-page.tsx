import { useEffect, useRef } from "react";

import { initGuide } from "@/features/landing/initGuide";

import "@/features/landing/landing.css";
import "@/features/landing/guides.css";

/**
 * Shell for the long-form Playbook guides, in the landing design language.
 * Renders the shared Sentrive nav and footer, and drops the guide body in as a
 * trusted, build-time HTML string (same pattern the landing route uses), so the
 * hand-authored editorial markup renders verbatim.
 */
export function GuidePage({ bodyHtml }: { bodyHtml: string }) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (ref.current) return initGuide(ref.current);
  }, []);

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
              <a href="/playbook">Playbook</a>
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

      <main
        className="pb"
        ref={ref}
        // Trusted, build-time asset (our own file), imported as a raw string.
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />

      <footer className="pb-foot">
        <span>© 2026 Sentrive</span>
        <a href="/playbook">Playbook</a>
        <a href="/use-cases">Use cases</a>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
      </footer>
    </div>
  );
}

import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

/** Shared shell for the public legal pages (terms, privacy). */
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
    <div className="bg-background min-h-screen">
      <div className="mx-auto max-w-2xl px-6 py-16">
        <Link
          to="/"
          className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
        >
          ← Back to Flowy
        </Link>
        <h1 className="mt-6 text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-2 text-sm">Last updated: {updated}</p>
        <div className="mt-10 space-y-10">{children}</div>
        <div className="text-muted-foreground mt-16 border-t pt-6 text-sm">
          Questions? Email{" "}
          <a href="mailto:sebastiandevbusiness@gmail.com" className="underline underline-offset-4">
            sebastiandevbusiness@gmail.com
          </a>
          {" · "}
          <Link to="/terms" className="underline underline-offset-4">
            Terms of Service
          </Link>
          {" · "}
          <Link to="/privacy" className="underline underline-offset-4">
            Privacy Policy
          </Link>
        </div>
      </div>
    </div>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-tight">{heading}</h2>
      <div className="text-muted-foreground mt-3 space-y-3 text-[0.95rem] leading-relaxed">
        {children}
      </div>
    </section>
  );
}

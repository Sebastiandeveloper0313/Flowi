import { createFileRoute, Link } from "@tanstack/react-router";

import { ContentPage } from "@/components/content-page";
import { USE_CASE_LIST } from "@/features/landing/use-cases";

export const Route = createFileRoute("/use-cases/")({
  head: () => ({
    meta: [
      { title: "Use Cases: What Your AI Marketing Employee Can Run | Sentrive" },
      {
        name: "description",
        content:
          "Everything Sentrive runs for you on schedule: Reddit lead generation, LinkedIn and Facebook publishing, inbox work, and marketing automation for solo founders.",
      },
    ],
    links: [{ rel: "canonical", href: "https://www.sentrive.ai/use-cases" }],
  }),
  component: UseCasesIndex,
});

function UseCasesIndex() {
  return (
    <ContentPage
      badge="Use cases"
      title="What Sentrive runs for you"
      lede="Brief it once. Each of these runs on schedule, forever."
    >
      <div className="uc-grid">
        {USE_CASE_LIST.map((uc) => (
          <Link key={uc.slug} to="/use-cases/$slug" params={{ slug: uc.slug }} className="uc-card">
            <h2>{uc.h1}</h2>
            <p>{uc.intro[0].slice(0, 150)}…</p>
            <span className="uc-more">Read more →</span>
          </Link>
        ))}
      </div>
    </ContentPage>
  );
}

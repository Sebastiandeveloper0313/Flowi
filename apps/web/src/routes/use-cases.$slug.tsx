import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { ContentPage, ContentSection } from "@/components/content-page";
import { USE_CASES } from "@/features/landing/use-cases";

export const Route = createFileRoute("/use-cases/$slug")({
  loader: ({ params }) => {
    const useCase = USE_CASES[params.slug];
    if (!useCase) throw notFound();
    return useCase;
  },
  head: (ctx) => {
    const uc = ctx.loaderData;
    if (!uc) return {};
    return {
      meta: [
        { title: uc.title },
        { name: "description", content: uc.metaDescription },
        { property: "og:title", content: uc.title },
        { property: "og:description", content: uc.metaDescription },
      ],
      links: [{ rel: "canonical", href: `https://www.sentrive.ai/use-cases/${uc.slug}` }],
    };
  },
  component: UseCasePage,
});

function UseCasePage() {
  const uc = Route.useLoaderData();

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: uc.faq.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <ContentPage badge="Use case" title={uc.h1}>
      <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>

      <ContentSection heading="The problem">
        {uc.intro.map((p) => (
          <p key={p.slice(0, 24)}>{p}</p>
        ))}
      </ContentSection>

      <ContentSection heading="How it works">
        <ol className="uc-steps">
          {uc.steps.map((s, i) => (
            <li key={s.title}>
              <strong>
                {i + 1}. {s.title}.
              </strong>{" "}
              {s.body}
            </li>
          ))}
        </ol>
      </ContentSection>

      <ContentSection heading="Why it works">
        <ul>
          {uc.benefits.map((b) => (
            <li key={b.slice(0, 24)}>{b}</li>
          ))}
        </ul>
      </ContentSection>

      <ContentSection heading="Common questions">
        {uc.faq.map((f) => (
          <div key={f.q} className="uc-faq">
            <p>
              <strong>{f.q}</strong>
            </p>
            <p>{f.a}</p>
          </div>
        ))}
      </ContentSection>

      <ContentSection heading="Related">
        <p>
          {uc.related.map((slug, i) => (
            <span key={slug}>
              {i > 0 && " · "}
              <Link to="/use-cases/$slug" params={{ slug }}>
                {USE_CASES[slug]?.h1 ?? slug}
              </Link>
            </span>
          ))}
        </p>
      </ContentSection>
    </ContentPage>
  );
}

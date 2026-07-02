import { createFileRoute } from "@tanstack/react-router";

import { LegalPage, LegalSection } from "@/components/legal-page";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="July 2, 2026">
      <LegalSection heading="1. Overview">
        <p>
          This policy explains what data Flowy ("Flowy", "we", "us") collects, why, and how it is
          handled when you use our website and application (the "Service"). Flowy is operated from
          Sweden. The short version: we collect what is needed to run your AI marketing employee, we
          never sell your data, and your data is never used to train AI models.
        </p>
      </LegalSection>

      <LegalSection heading="2. Data we collect">
        <p>
          <strong className="text-foreground">Account data.</strong> Your email address and password
          (stored as a secure hash), and your team/workspace name.
        </p>
        <p>
          <strong className="text-foreground">Business context.</strong> If you use website
          analysis, we fetch the website URL you provide and store the extracted business profile
          (what you sell, your audience, your voice) so agents can write accurately for you.
        </p>
        <p>
          <strong className="text-foreground">Content you create.</strong> Your chat messages with
          Flowy, agent instructions and schedules, approval decisions, and the results agents
          produce (for example lead reports and drafted replies).
        </p>
        <p>
          <strong className="text-foreground">Connected account data.</strong> When you connect
          Gmail, Reddit, LinkedIn, Facebook, or Slack, we store the connection (via OAuth) and
          process the data needed for the tasks you run — for example the emails a task reads or
          sends, posts published, or Slack messages exchanged with the Flowy bot. Access tokens are
          stored encrypted. We only receive the permissions you approve in each provider's consent
          screen.
        </p>
        <p>
          <strong className="text-foreground">Billing data.</strong> Payments are processed by
          Stripe. We never see or store your card number — we store only your Stripe customer
          reference, plan, and subscription status.
        </p>
        <p>
          <strong className="text-foreground">Usage data.</strong> We count feature usage (such as
          chats per day) to enforce plan limits, and keep standard technical logs to keep the
          Service secure and working.
        </p>
      </LegalSection>

      <LegalSection heading="3. How we use your data">
        <ul className="list-disc space-y-1 pl-5">
          <li>to provide the Service: run your agents, chats, and integrations;</li>
          <li>to personalize output using your business context;</li>
          <li>to meter usage and process billing;</li>
          <li>to secure the Service and prevent abuse;</li>
          <li>
            to communicate with you about the Service (results you opted into, account and billing
            notices).
          </li>
        </ul>
        <p>We do not sell personal data and we do not use your data for third-party advertising.</p>
      </LegalSection>

      <LegalSection heading="4. AI processing — no training on your data">
        <p>
          Flowy uses Anthropic's Claude models via API to understand your requests and generate
          content. The content needed for a given task (for example your instruction, business
          context, and the material an agent is working on) is sent to Anthropic for processing.
          Under Anthropic's commercial API terms, this data is not used to train their models. We do
          not use your data to train models either.
        </p>
      </LegalSection>

      <LegalSection heading="5. Google user data (Gmail)">
        <p>
          If you connect Gmail, Flowy accesses your Gmail data only to provide user-facing features
          you actively use: reading threads you ask it to work with, drafting replies, and sending
          email you approve (or that you have set to send automatically in Auto mode).
        </p>
        <p>
          Flowy's use and transfer of information received from Google APIs adheres to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. We do not use Gmail data for advertising, do not
          sell it, and do not let humans read it except with your permission, for security purposes,
          or as required by law.
        </p>
      </LegalSection>

      <LegalSection heading="6. Who we share data with (subprocessors)">
        <p>We share data only with the providers needed to run the Service:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong className="text-foreground">Supabase</strong> — database, authentication, and
            backend hosting;
          </li>
          <li>
            <strong className="text-foreground">Vercel</strong> — web application hosting;
          </li>
          <li>
            <strong className="text-foreground">Anthropic</strong> — AI model processing;
          </li>
          <li>
            <strong className="text-foreground">Composio</strong> — managed OAuth connections and
            actions on Gmail, Reddit, LinkedIn, and Facebook;
          </li>
          <li>
            <strong className="text-foreground">Stripe</strong> — payment processing;
          </li>
          <li>
            <strong className="text-foreground">Firecrawl</strong> — fetching the website you submit
            for analysis;
          </li>
          <li>
            <strong className="text-foreground">Slack</strong> — if you install the Flowy Slack app.
          </li>
        </ul>
        <p>
          We may also disclose data if required by law, or as part of a merger or acquisition (in
          which case this policy continues to apply to your data).
        </p>
      </LegalSection>

      <LegalSection heading="7. Security">
        <p>
          Data is encrypted in transit and at rest. OAuth and workspace tokens are stored in an
          encrypted vault. Each team's data is isolated with row-level security, so one workspace
          can never read another's data. Outward-facing actions run through an approval queue you
          control.
        </p>
      </LegalSection>

      <LegalSection heading="8. Retention and deletion">
        <p>
          We keep your data while your account is active. If you disconnect an integration, we stop
          accessing that account and its token is revoked. If you delete your account or ask us to,
          we delete your personal data within 30 days, except records we must keep for legal or
          accounting reasons (such as invoices). You can request deletion by email at any time.
        </p>
      </LegalSection>

      <LegalSection heading="9. Your rights">
        <p>
          If you are in the EU/EEA (and in many other places), you have the right to access,
          correct, export, restrict, object to the processing of, and delete your personal data. The
          legal bases we rely on are performance of our contract with you (running the Service), our
          legitimate interests (security, preventing abuse), and consent where applicable (optional
          integrations). Email us to exercise any right; you can also lodge a complaint with your
          local data protection authority (in Sweden, IMY).
        </p>
      </LegalSection>

      <LegalSection heading="10. Cookies">
        <p>
          We use only essential cookies and local storage needed to keep you signed in and make the
          app work. We do not use advertising or cross-site tracking cookies.
        </p>
      </LegalSection>

      <LegalSection heading="11. International transfers">
        <p>
          Some of our providers process data outside the EU/EEA (for example in the United States).
          Where they do, transfers are protected by safeguards such as the EU Standard Contractual
          Clauses or an adequacy decision (including the EU-U.S. Data Privacy Framework where the
          provider is certified).
        </p>
      </LegalSection>

      <LegalSection heading="12. Children">
        <p>
          The Service is for business use and not directed to children. We do not knowingly collect
          data from anyone under 16.
        </p>
      </LegalSection>

      <LegalSection heading="13. Changes to this policy">
        <p>
          We may update this policy as the Service evolves. For material changes we will notify you
          by email or in the app before they take effect. The date at the top shows the latest
          revision.
        </p>
      </LegalSection>
    </LegalPage>
  );
}

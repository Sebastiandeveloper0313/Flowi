import { createFileRoute } from "@tanstack/react-router";

import { LegalPage, LegalSection } from "@/components/legal-page";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
});

function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="July 2, 2026">
      <LegalSection heading="1. Who we are">
        <p>
          Entrives ("Entrives", "we", "us") is an AI marketing service operated from Sweden. These
          Terms of Service ("Terms") are a binding agreement between you and Entrives and govern
          your use of the Entrives website, application, and related services (together, the
          "Service"). By creating an account or using the Service, you agree to these Terms. If you
          use Entrives on behalf of a company, you confirm you have authority to bind that company,
          and "you" means that company.
        </p>
      </LegalSection>

      <LegalSection heading="2. The Service">
        <p>
          Entrives is an AI marketing employee. You describe marketing work in plain language and
          Entrives performs it: finding relevant conversations and leads, drafting and publishing
          posts and replies, working with your email, and running recurring agents on a schedule.
          Entrives acts through accounts you connect (such as Gmail, Reddit, LinkedIn, Facebook, and
          Slack) and reports results back to you in the app, by email, or in Slack.
        </p>
      </LegalSection>

      <LegalSection heading="3. Your account">
        <p>
          You must be at least 18 years old and provide accurate information when signing up. You
          are responsible for your login credentials and for all activity under your account. Tell
          us immediately if you suspect unauthorized access. The Service is intended for business
          use.
        </p>
      </LegalSection>

      <LegalSection heading="4. Connected accounts and authorization">
        <p>
          When you connect a third-party account, you authorize Entrives to access and act through
          that account on your behalf, within the permissions you grant during the OAuth flow. You
          can revoke a connection at any time in the app or with the third-party provider.
        </p>
        <p>
          Actions Entrives takes through your connected accounts (posts, replies, emails, messages)
          are made in your name and are your responsibility. Entrives provides approval controls: in
          Ask mode, outward-facing actions are queued for your explicit approval before anything is
          sent or published. If you enable Auto mode, you instruct Entrives to act without asking
          first, and you accept responsibility for those actions as if you had approved each one.
        </p>
      </LegalSection>

      <LegalSection heading="5. AI-generated content">
        <p>
          Entrives uses large language models to analyze information and generate content. AI output
          can be inaccurate, incomplete, or inappropriate for your context. You are responsible for
          reviewing content before it is published and for everything published from your connected
          accounts. The Service is a tool that works under your direction; it does not provide
          legal, financial, or professional advice.
        </p>
      </LegalSection>

      <LegalSection heading="6. Acceptable use">
        <p>You agree not to use the Service to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>send spam or unsolicited bulk messages, or engage in deceptive marketing;</li>
          <li>
            violate the rules of connected platforms (including Reddit, LinkedIn, Meta, Google, and
            Slack policies on automation, self-promotion, and commercial messaging);
          </li>
          <li>publish content that is illegal, infringing, defamatory, or harassing;</li>
          <li>misrepresent who you are or impersonate others;</li>
          <li>probe, disrupt, or overload the Service, or bypass usage limits;</li>
          <li>resell or provide the Service to third parties without our written consent.</li>
        </ul>
        <p>
          We may suspend or terminate accounts that violate this section, including where a
          connected platform complains about activity from your account.
        </p>
      </LegalSection>

      <LegalSection heading="7. Trial, subscription, and billing">
        <p>
          Entrives offers one paid plan (Pro) with a 3-day free trial for new customers. A payment
          method is required to start the trial. If you do not cancel before the trial ends, your
          subscription starts automatically and the plan price is charged to your payment method.
          Subscriptions renew monthly until canceled.
        </p>
        <p>
          You can cancel anytime from Settings → Billing, which opens the Stripe billing portal.
          Canceling stops future charges; your plan remains active until the end of the paid period.
          Fees already paid are non-refundable except where required by law. The free trial is
          available once per customer. We may change prices with at least 30 days' notice; changes
          apply from your next billing cycle. Daily usage limits apply as described on our pricing
          page, and we may adjust them to protect the Service.
        </p>
      </LegalSection>

      <LegalSection heading="8. Your content and data">
        <p>
          You retain all rights to the content you provide and to the marketing content Entrives
          generates for you. You grant us the license needed to operate the Service: to store,
          process, and transmit your content, including sending it to the AI providers and connected
          platforms involved in performing the work you request. Our handling of personal data is
          described in the Privacy Policy. Your data is not used to train AI models.
        </p>
      </LegalSection>

      <LegalSection heading="9. Intellectual property">
        <p>
          The Service itself, including its software, design, and branding, belongs to Entrives and
          its licensors. These Terms do not grant you any rights in the Service other than the right
          to use it while these Terms are in effect.
        </p>
      </LegalSection>

      <LegalSection heading="10. Third-party services">
        <p>
          The Service depends on third-party platforms and providers (for example Google, Reddit,
          LinkedIn, Meta, Slack, Stripe, and AI model providers). We do not control them, and they
          may change or restrict their APIs at any time, which can affect features. Your use of a
          connected platform remains governed by that platform's own terms.
        </p>
      </LegalSection>

      <LegalSection heading="11. Availability and changes">
        <p>
          We work to keep the Service reliable but provide it "as is" and "as available", without
          uptime guarantees. We may add, change, or remove features, and may suspend the Service for
          maintenance or security reasons.
        </p>
      </LegalSection>

      <LegalSection heading="12. Disclaimers and liability">
        <p>
          To the maximum extent permitted by law: the Service is provided without warranties of any
          kind, express or implied; we are not liable for indirect, incidental, special, or
          consequential damages, or for lost profits, revenue, or data; and our total liability for
          all claims related to the Service is limited to the amount you paid us in the 12 months
          before the claim arose. Nothing in these Terms limits liability that cannot be limited by
          law.
        </p>
      </LegalSection>

      <LegalSection heading="13. Termination">
        <p>
          You can stop using the Service and delete your account at any time. We may suspend or
          terminate your access if you materially breach these Terms, if required by law, or if we
          discontinue the Service (in which case we will give reasonable notice). Sections that by
          their nature should survive termination (including 8, 9, 12, and 14) survive.
        </p>
      </LegalSection>

      <LegalSection heading="14. Governing law">
        <p>
          These Terms are governed by the laws of Sweden, without regard to conflict-of-law rules.
          Disputes will be resolved by the competent courts of Sweden, unless mandatory consumer law
          gives you the right to another venue.
        </p>
      </LegalSection>

      <LegalSection heading="15. Changes to these Terms">
        <p>
          We may update these Terms from time to time. For material changes we will notify you by
          email or in the app before they take effect. Continuing to use the Service after changes
          take effect means you accept the updated Terms.
        </p>
      </LegalSection>
    </LegalPage>
  );
}

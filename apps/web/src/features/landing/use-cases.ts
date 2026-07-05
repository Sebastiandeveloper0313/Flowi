/** Content for the public use-case pages. Pure data so the route stays a template. */

export interface UseCase {
  slug: string;
  /** <title> tag, tuned for search. */
  title: string;
  metaDescription: string;
  h1: string;
  intro: string[];
  steps: { title: string; body: string }[];
  benefits: string[];
  faq: { q: string; a: string }[];
  related: string[];
}

export const USE_CASES: Record<string, UseCase> = {
  "reddit-lead-generation": {
    slug: "reddit-lead-generation",
    title: "Reddit Lead Generation Tool: Find Buyers Asking for You | Sentrive",
    metaDescription:
      "Sentrive scans Reddit daily for people asking about the exact problem you solve, scores each post against your business, and drafts replies you approve. Try it free for 3 days.",
    h1: "Reddit lead generation on autopilot",
    intro: [
      "Every day, people go on Reddit and describe the exact problem your product solves. They ask for recommendations, compare options, and vent about the thing you fix. Almost none of them will ever find you, because nobody has time to read Reddit all day.",
      "Sentrive does. It reads your website once, learns what you sell and who buys it, then scans relevant subreddits every day for posts from people who need you. Each post is scored against your business, and for the best matches Sentrive drafts a helpful, human reply that mentions your product only where it genuinely fits. You approve every reply before it posts, from the dashboard or straight from Slack.",
    ],
    steps: [
      {
        title: "Paste your website",
        body: "Sentrive analyzes your site and builds a profile of your product, audience, and voice. Every search and reply is grounded in it.",
      },
      {
        title: "Connect Reddit in one click",
        body: "OAuth through your own Reddit account. Replies post as you, from your account, with your history behind them.",
      },
      {
        title: "Approve and post",
        body: "Every morning you get the day's leads with drafted replies. Approve, edit, or skip each one in seconds.",
      },
    ],
    benefits: [
      "Finds buyers at the exact moment they ask for help, which converts far better than cold outreach",
      "Relevance scoring, so you see 4 great leads instead of 400 keyword matches",
      "Replies written to be helpful first, so they read like a person and not an ad",
      "You approve every reply, so nothing ships without your judgment",
      "Runs daily without reminders, so the channel compounds while you build",
    ],
    faq: [
      {
        q: "Will the replies get my Reddit account banned?",
        a: "Sentrive drafts helpful answers that only mention your product where it fits, and you approve each one before it posts. Spray-and-pray spam is what gets accounts banned; one or two genuinely useful replies a day from your real account is how founders have always done Reddit well.",
      },
      {
        q: "Which subreddits does it search?",
        a: "You can specify subreddits when you create the agent, or let Sentrive pick them from your business profile. You can edit the list anytime.",
      },
      {
        q: "Does it post automatically?",
        a: "Only if you switch the agent to Auto mode. The default is Ask mode: every reply waits for your approval.",
      },
    ],
    related: ["linkedin-automation", "marketing-for-solo-founders"],
  },

  "linkedin-automation": {
    slug: "linkedin-automation",
    title: "AI LinkedIn Automation: Publish Company Posts on Schedule | Sentrive",
    metaDescription:
      "Sentrive writes and publishes LinkedIn company posts in your voice, on your schedule. Brief it once, approve each post, and stay consistent without the weekly scramble. 3-day free trial.",
    h1: "LinkedIn posting on autopilot",
    intro: [
      "Everyone knows consistency is what makes LinkedIn work, and almost nobody manages it. The weekly post becomes biweekly, then monthly, then a guilty memory. Not because writing one post is hard, but because remembering to do it every week forever is.",
      "Sentrive is an AI marketing employee that takes the schedule off your head. Brief it once, in plain English, and it drafts posts in your brand voice, grounded in what your company actually does. Every post goes through your approval before it publishes to your company page, so the bar stays yours.",
    ],
    steps: [
      {
        title: "Teach it your voice",
        body: "Sentrive reads your website and builds your business context: what you sell, who it is for, and how you sound.",
      },
      {
        title: "Set the schedule",
        body: "Weekly thought piece every Monday at 9? Three posts a week? You set the cadence when you create the agent and can change it anytime.",
      },
      {
        title: "Approve and publish",
        body: "Drafts arrive for review. Approve from the dashboard or Slack, and Sentrive publishes to your company page through your own LinkedIn connection.",
      },
    ],
    benefits: [
      "Posts that sound like you, because they are grounded in your real business context",
      "A cadence that never slips, which is the entire game on LinkedIn",
      "Publishing to your company page through your own account, not a third-party scheduler profile",
      "Approval on every post, or Auto mode when you trust the output",
      "No dashboard babysitting: results and drafts come to your inbox or Slack",
    ],
    faq: [
      {
        q: "Does it post to personal profiles or company pages?",
        a: "Company pages. You connect LinkedIn with organization permissions and pick the page Sentrive publishes to.",
      },
      {
        q: "Will the posts sound like AI?",
        a: "Sentrive writes from your business context and follows your voice, and bans the tell-tale AI patterns. You also approve everything, so nothing you would not say ships.",
      },
      {
        q: "Can I edit a draft before it publishes?",
        a: "Yes. Every draft can be edited, approved, or skipped before it goes out.",
      },
    ],
    related: ["reddit-lead-generation", "facebook-automation"],
  },

  "ai-email-marketing": {
    slug: "ai-email-marketing",
    title: "AI Email Assistant: An Employee for Your Gmail Inbox | Sentrive",
    metaDescription:
      "Sentrive reads the threads you point it at, drafts replies in your voice, and sends when you approve. Plus daily reports of everything your agents shipped, delivered to your inbox.",
    h1: "An AI employee that works your inbox",
    intro: [
      "For a small business the inbox is the real CRM: partnership threads, customer questions, follow-ups you meant to send three days ago. Every unanswered thread is money leaking out quietly.",
      "Sentrive connects to your Gmail and works it like an employee would. Ask it to handle a thread and it reads the context, drafts the reply in your voice, and sends when you approve. Its agents also report their results by email, so the work comes to you instead of the other way around.",
    ],
    steps: [
      {
        title: "Connect Gmail in one click",
        body: "OAuth through Google. Sentrive only touches the mail you point it at, and its use of Gmail data follows Google's Limited Use policy.",
      },
      {
        title: "Hand it a thread",
        body: "Tell Sentrive what you want in plain English: reply to this, chase that, summarize this thread. It drafts, you approve.",
      },
      {
        title: "Get reports where you live",
        body: "Every agent can deliver results to your inbox, so lead reports and recaps arrive like mail from a colleague.",
      },
    ],
    benefits: [
      "Replies drafted in your voice with the thread's full context, not generic templates",
      "You approve every send, so the AI never freelances with your relationships",
      "Follow-ups that actually happen, on schedule, without you remembering them",
      "Daily agent reports delivered to the inbox you already check",
      "No training on your data, and tokens stored encrypted",
    ],
    faq: [
      {
        q: "Can it read my whole inbox?",
        a: "It works on what you direct it to. You stay in control of which threads it touches, and every outgoing email requires your approval unless you enable Auto mode.",
      },
      {
        q: "Is my email data safe?",
        a: "Connections use OAuth through your own Google account, tokens are stored encrypted, your data is never used to train models, and Gmail data handling follows Google's Limited Use requirements.",
      },
      {
        q: "Does it work with Outlook?",
        a: "Gmail today. Outlook is on the roadmap; tell us if you need it and we will bump it.",
      },
    ],
    related: ["marketing-for-solo-founders", "reddit-lead-generation"],
  },

  "facebook-automation": {
    slug: "facebook-automation",
    title: "AI Facebook Page Management: Posts and Replies on Schedule | Sentrive",
    metaDescription:
      "Sentrive writes and publishes Facebook page posts, replies to comments and messages, and keeps your page alive on schedule. You approve everything. 3-day free trial.",
    h1: "Facebook page management on autopilot",
    intro: [
      "A dead Facebook page reads as a dead business. Customers check the page before they buy, see the last post from eight months ago, and quietly downgrade their trust. Keeping it alive is nobody's favorite job, which is why it does not happen.",
      "Sentrive treats your page like part of its job. It writes and publishes posts in your voice on the schedule you set, and it can draft replies to comments and messages so conversations do not rot. Everything outward goes through your approval first.",
    ],
    steps: [
      {
        title: "Connect your page",
        body: "One-click OAuth through your Facebook account, then pick the page Sentrive manages.",
      },
      {
        title: "Brief the agent",
        body: "Tell it what your page should feel like and how often to post. Sentrive drafts content grounded in your business profile.",
      },
      {
        title: "Approve and stay alive",
        body: "Posts and replies queue for your approval. Approve from the dashboard or Slack, and your page stops looking abandoned.",
      },
    ],
    benefits: [
      "A page that looks alive to every customer who checks you out before buying",
      "Posts grounded in your actual business, not filler content",
      "Comment and message replies drafted for you, so conversations get answered",
      "Approval on everything, with Auto mode when you are ready",
      "One schedule that runs forever, instead of a chore you keep dropping",
    ],
    faq: [
      {
        q: "Does it manage personal profiles?",
        a: "No, business pages. You choose which page during the one-click connection.",
      },
      {
        q: "Can it answer customer messages?",
        a: "It can read page conversations and draft replies for your approval, so response times drop without handing strangers the keys.",
      },
      {
        q: "What does it cost?",
        a: "Sentrive is one plan at $49 per month covering every channel, with a 3-day free trial.",
      },
    ],
    related: ["linkedin-automation", "reddit-lead-generation"],
  },

  "marketing-for-solo-founders": {
    slug: "marketing-for-solo-founders",
    title: "Marketing Automation for Solo Founders and Small Teams | Sentrive",
    metaDescription:
      "You cannot build the product and run the marketing. Sentrive is the AI marketing employee for solo founders: it finds leads, publishes content, and reports back daily for $49 a month.",
    h1: "Marketing automation for solo founders",
    intro: [
      "Every solo founder runs the same loop: ship product for two weeks, panic about the empty pipeline, do marketing for three days, then get pulled back into product while the marketing quietly dies again. The problem is not skill. It is that marketing is recurring work, and recurring work loses to urgent work every single time.",
      "Sentrive breaks the loop by being the employee you cannot afford yet. It learns your business from your website, then runs the recurring half of marketing on schedule: finding people on Reddit who need what you build, publishing your LinkedIn and Facebook content, working your inbox, and reporting every morning on what it shipped. You make the calls. It does the work.",
    ],
    steps: [
      {
        title: "Two-minute setup",
        body: "Paste your website, connect the channels you use, done. No onboarding project, no agency kickoff call.",
      },
      {
        title: "Brief it like a hire",
        body: "Describe the marketing that keeps falling off your plate, in plain English. Sentrive proposes agents with schedules you can edit.",
      },
      {
        title: "Stay in control",
        body: "Every outward action queues for approval in the dashboard or Slack. Approve in seconds between real work.",
      },
    ],
    benefits: [
      "The recurring marketing gets done every day, even during crunch weeks",
      "One plan at $49 per month, roughly an hour of a freelancer's time",
      "Everything grounded in your business, so output sounds like you wrote it",
      "Approvals from Slack, so managing it fits between commits",
      "Scales from one agent to a full roster as the channels start working",
    ],
    faq: [
      {
        q: "How is this different from using ChatGPT?",
        a: "A chatbot answers when you ask and forgets you the moment you close the tab. Sentrive remembers your business, runs on a schedule without being asked, acts through your real accounts, and reports back. It is the difference between a smart intern you must manage every hour and an employee who just ships.",
      },
      {
        q: "How much time does it take to manage?",
        a: "A few minutes a day to review and approve. The daily report tells you what happened; the approval queue is where you spend your seconds.",
      },
      {
        q: "What if I do not know anything about marketing?",
        a: "That is the point. Describe your business and goals in plain English and Sentrive proposes the agents worth running. You approve outcomes, not tactics.",
      },
    ],
    related: ["reddit-lead-generation", "ai-email-marketing"],
  },
};

export const USE_CASE_LIST = Object.values(USE_CASES);

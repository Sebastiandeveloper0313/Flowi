// Realistic placeholder data for the management dashboard.
// Single source so it's trivial to swap for the real backend later.

export type Channel = "discord" | "telegram" | "slack" | "whatsapp" | "email" | "dashboard";
export type AgentStatus = "running" | "paused" | "needs_input";
export type RunStatus = "success" | "failed" | "running";

export interface Run {
  id: string;
  at: string; // ISO
  status: RunStatus;
  summary: string;
  output: string;
  delivered: Channel;
}

export interface Agent {
  id: string;
  name: string;
  instruction: string;
  scheduleLabel: string;
  nextRun: string;
  channel: Channel;
  status: AgentStatus;
  autoRun: boolean;
  tools: string[];
  chatId: string;
  runs: Run[];
}

export interface ActivityItem {
  id: string;
  agentId: string;
  agentName: string;
  at: string;
  status: RunStatus;
  summary: string;
  channel: Channel;
}

export interface Approval {
  id: string;
  agentId: string;
  agentName: string;
  at: string;
  request: string;
  detail: string;
}

export interface Integration {
  key: string;
  name: string;
  category: string;
  connected: boolean;
  account?: string;
  scopes: string[];
}

export interface RecentChat {
  id: string;
  title: string;
  at: string;
  agentId?: string;
}

export const CHANNEL_LABELS: Record<Channel, string> = {
  discord: "Discord",
  telegram: "Telegram",
  slack: "Slack",
  whatsapp: "WhatsApp",
  email: "Email",
  dashboard: "Dashboard",
};

export const agents: Agent[] = [
  {
    id: "ag_competitors",
    name: "Competitor news monitor",
    instruction:
      "Every morning, scan the news and websites of our top 5 competitors. Summarize anything material — launches, pricing changes, funding, leadership moves — into a short briefing. Skip noise.",
    scheduleLabel: "Every day at 7:00 AM",
    nextRun: "Tomorrow, 7:00 AM",
    channel: "telegram",
    status: "needs_input",
    autoRun: false,
    tools: ["Web search", "Notion"],
    chatId: "chat_competitors",
    runs: [
      {
        id: "r1",
        at: "Today, 7:00 AM",
        status: "success",
        summary: "3 updates — Northwind raised a Series B; Vellum cut prices 20%.",
        output:
          "Competitor briefing — 5 tracked\n\n• Northwind announced a $40M Series B led by Accel. Positioning shifting toward enterprise.\n• Vellum dropped Pro pricing from $49 → $39/mo.\n• Swoop shipped a Slack integration (overlaps our roadmap).\nNo material moves from Coingate or LyfeFuel.",
        delivered: "telegram",
      },
      {
        id: "r2",
        at: "Yesterday, 7:00 AM",
        status: "success",
        summary: "Quiet day — 1 minor blog post from Swoop.",
        output: "Competitor briefing — only Swoop published a changelog post on minor bug fixes. Nothing material.",
        delivered: "telegram",
      },
    ],
  },
  {
    id: "ag_adspend",
    name: "Weekly ad-spend audit",
    instruction:
      "Every Friday, pull ad spend and conversions from the connected ad accounts. Flag campaigns spending above target CPA and recommend pauses. Ask before pausing anything.",
    scheduleLabel: "Every Friday at 4:00 PM",
    nextRun: "Fri, 4:00 PM",
    channel: "whatsapp",
    status: "needs_input",
    autoRun: false,
    tools: ["Stripe", "Google Ads"],
    chatId: "chat_adspend",
    runs: [
      {
        id: "r1",
        at: "Last Fri, 4:00 PM",
        status: "success",
        summary: "2 campaigns over target CPA — wants approval to pause 1.",
        output:
          "Ad-spend audit\n\nTotal spend: $8,240 · Blended CPA: $61 (target $45)\n\n⚠️ Over target:\n• “Retargeting — Broad”: CPA $112, spent $1,900. Recommend pausing.\n• “Lookalike 3%”: CPA $58, trending down — keep, watch.",
        delivered: "whatsapp",
      },
    ],
  },
  {
    id: "ag_sales",
    name: "Daily sales recap",
    instruction:
      "Every weekday at 8am, pull yesterday's sales from Stripe and HubSpot and post a one-page recap with the wins and what slipped.",
    scheduleLabel: "Every weekday at 8:00 AM",
    nextRun: "Tomorrow, 8:00 AM",
    channel: "discord",
    status: "running",
    autoRun: true,
    tools: ["Stripe", "HubSpot"],
    chatId: "chat_sales",
    runs: [
      {
        id: "r1",
        at: "Today, 8:00 AM",
        status: "success",
        summary: "$48.2k booked, +14% vs avg. 3 deals at risk.",
        output:
          "Daily Sales Recap — Tue\n\nHeadline: $48,210 in new revenue across 19 transactions (+14% vs 7-day avg).\n\n✅ Wins\n• Largest deal: Acme Corp — $12,000 (Enterprise)\n• New customers: 7\n\n⚠️ What slipped\n• 3 deals expected to close stuck in “Contract Sent”\n• 2 failed payments ($1,140) — retry queued",
        delivered: "discord",
      },
      {
        id: "r2",
        at: "Yesterday, 8:00 AM",
        status: "success",
        summary: "$41.9k booked, in line with trend.",
        output: "Daily Sales Recap — Mon\n\n$41,900 across 16 transactions. Steady. No payments failed.",
        delivered: "discord",
      },
      {
        id: "r3",
        at: "Mon, 8:00 AM",
        status: "failed",
        summary: "HubSpot token expired — couldn't pull deals.",
        output: "Run failed: HubSpot returned 401 (token expired). Reconnect HubSpot in Integrations to resume.",
        delivered: "discord",
      },
    ],
  },
  {
    id: "ag_trends",
    name: "Menswear trend slides",
    instruction:
      "Every day at noon, research what's trending in menswear and produce 3 clean slides in our deck format, ready to share with the team.",
    scheduleLabel: "Every day at 12:00 PM",
    nextRun: "Today, 12:00 PM",
    channel: "slack",
    status: "running",
    autoRun: true,
    tools: ["Web search", "Google Drive"],
    chatId: "chat_trends",
    runs: [
      {
        id: "r1",
        at: "Today, 12:00 PM",
        status: "success",
        summary: "Posted Trends.pdf — 3 slides (quiet luxury, suede, wide trousers).",
        output:
          "Trend deck shipped (3 slides):\n1. Quiet luxury holding strong — muted tones, elevated basics.\n2. Suede is back — jackets and overshirts trending +38% in search.\n3. Wider trousers continuing into next season.\nFile: Trends.pdf",
        delivered: "slack",
      },
    ],
  },
  {
    id: "ag_support",
    name: "Support ticket triage",
    instruction:
      "Every hour, review new support tickets, group duplicates, draft replies for common issues, and flag anything urgent to the team.",
    scheduleLabel: "Every hour",
    nextRun: "In 41 minutes",
    channel: "dashboard",
    status: "running",
    autoRun: true,
    tools: ["Zendesk", "Linear"],
    chatId: "chat_support",
    runs: [
      {
        id: "r1",
        at: "Today, 11:00 AM",
        status: "success",
        summary: "Triaged 23 tickets — 18 export bug, drafted replies, filed ZET-311.",
        output:
          "Triaged 23 new tickets.\n• 18 are the same “export timeout” bug — merged into one thread, drafted replies to all.\n• Filed Linear bug ZET-311 with a repro.\n• 1 urgent: enterprise customer (Acme) reports login failure — flagged to #eng.",
        delivered: "dashboard",
      },
    ],
  },
  {
    id: "ag_investor",
    name: "Weekly investor update draft",
    instruction:
      "Every Monday at 9am, draft our weekly investor update from the latest metrics — revenue, growth, hiring, key wins — in our usual format. Leave it as a draft for review.",
    scheduleLabel: "Every Monday at 9:00 AM",
    nextRun: "Paused",
    channel: "email",
    status: "paused",
    autoRun: false,
    tools: ["Stripe", "Notion", "Gmail"],
    chatId: "chat_investor",
    runs: [
      {
        id: "r1",
        at: "2 weeks ago, Mon",
        status: "success",
        summary: "Drafted update — $192k MRR, +6% WoW.",
        output: "Investor update draft saved. MRR $192k (+6% WoW), 2 enterprise logos closed, 1 senior eng hire signed.",
        delivered: "email",
      },
    ],
  },
];

export const approvals: Approval[] = [
  {
    id: "ap1",
    agentId: "ag_adspend",
    agentName: "Weekly ad-spend audit",
    at: "Today, 4:02 PM",
    request: "Pause campaign “Retargeting — Broad”",
    detail:
      "This campaign is at $112 CPA (target $45) and has spent $1,900 this week with 17 conversions. I recommend pausing it. Approve to pause now.",
  },
  {
    id: "ap2",
    agentId: "ag_competitors",
    agentName: "Competitor news monitor",
    at: "Today, 7:01 AM",
    request: "Add “Tasklet” to the tracked competitor list",
    detail:
      "I noticed Tasklet mentioned repeatedly alongside our competitors and in 3 customer tickets. Want me to start tracking them daily too?",
  },
  {
    id: "ap3",
    agentId: "ag_sales",
    agentName: "Daily sales recap",
    at: "Yesterday, 8:05 AM",
    request: "Email the 3 at-risk deals to the AE owners",
    detail:
      "3 deals are stuck in “Contract Sent” past our 5-day SLA. Want me to email each AE a nudge with the deal details?",
  },
];

export const activity: ActivityItem[] = [
  { id: "a1", agentId: "ag_support", agentName: "Support ticket triage", at: "Today, 11:00 AM", status: "success", summary: "Triaged 23 tickets, filed ZET-311, flagged 1 urgent.", channel: "dashboard" },
  { id: "a2", agentId: "ag_trends", agentName: "Menswear trend slides", at: "Today, 12:00 PM", status: "success", summary: "Posted 3-slide trend deck.", channel: "slack" },
  { id: "a3", agentId: "ag_sales", agentName: "Daily sales recap", at: "Today, 8:00 AM", status: "success", summary: "$48.2k booked (+14%). 3 deals at risk.", channel: "discord" },
  { id: "a4", agentId: "ag_competitors", agentName: "Competitor news monitor", at: "Today, 7:00 AM", status: "success", summary: "3 competitor updates — needs your input on 1.", channel: "telegram" },
  { id: "a5", agentId: "ag_support", agentName: "Support ticket triage", at: "Today, 10:00 AM", status: "success", summary: "Triaged 11 tickets, drafted 9 replies.", channel: "dashboard" },
  { id: "a6", agentId: "ag_sales", agentName: "Daily sales recap", at: "Mon, 8:00 AM", status: "failed", summary: "HubSpot token expired — run failed.", channel: "discord" },
  { id: "a7", agentId: "ag_adspend", agentName: "Weekly ad-spend audit", at: "Last Fri, 4:00 PM", status: "success", summary: "Audited $8.2k spend, flagged 2 campaigns.", channel: "whatsapp" },
  { id: "a8", agentId: "ag_trends", agentName: "Menswear trend slides", at: "Yesterday, 12:00 PM", status: "success", summary: "Posted 3-slide trend deck.", channel: "slack" },
];

export const integrations: Integration[] = [
  { key: "stripe", name: "Stripe", category: "Payments", connected: true, account: "Acme Inc", scopes: ["Read charges", "Read balance", "Read customers"] },
  { key: "hubspot", name: "HubSpot", category: "CRM", connected: true, account: "acme.hubspot.com", scopes: ["Read deals", "Read contacts"] },
  { key: "notion", name: "Notion", category: "Docs", connected: true, account: "Acme workspace", scopes: ["Read pages", "Write pages"] },
  { key: "gdrive", name: "Google Drive", category: "Files", connected: true, account: "founder@acme.com", scopes: ["Read files", "Create files"] },
  { key: "discord", name: "Discord", category: "Channel", connected: true, account: "#results", scopes: ["Post messages"] },
  { key: "slack", name: "Slack", category: "Channel", connected: true, account: "Acme HQ", scopes: ["Post messages"] },
  { key: "zendesk", name: "Zendesk", category: "Support", connected: true, account: "acme.zendesk.com", scopes: ["Read tickets", "Draft replies"] },
  { key: "telegram", name: "Telegram", category: "Channel", connected: true, account: "@acme_ops", scopes: ["Send messages"] },
  { key: "googleads", name: "Google Ads", category: "Marketing", connected: false, scopes: [] },
  { key: "salesforce", name: "Salesforce", category: "CRM", connected: false, scopes: [] },
  { key: "linear", name: "Linear", category: "Eng", connected: true, account: "Acme", scopes: ["Create issues"] },
  { key: "gmail", name: "Gmail", category: "Email", connected: true, account: "founder@acme.com", scopes: ["Send mail", "Read drafts"] },
];

export const recentChats: RecentChat[] = [
  { id: "chat_competitors", title: "Track our competitors daily", at: "Today", agentId: "ag_competitors" },
  { id: "chat_trends", title: "Menswear trend slides at noon", at: "Today", agentId: "ag_trends" },
  { id: "chat_adspend", title: "Audit ad spend every Friday", at: "Yesterday", agentId: "ag_adspend" },
  { id: "chat_q3", title: "Help me think through Q3 pricing", at: "Mon" },
  { id: "chat_sales", title: "Daily sales recap to Discord", at: "Last week", agentId: "ag_sales" },
];

export interface MemorySection {
  title: string;
  items: { label: string; value: string }[];
}

export const memory: MemorySection[] = [
  {
    title: "About you",
    items: [
      { label: "Name", value: "Sebastian" },
      { label: "Role", value: "Founder & CEO" },
      { label: "Working hours", value: "Mon–Fri, mornings preferred for briefings" },
      { label: "Preferred channel", value: "Discord for results, Telegram for alerts" },
    ],
  },
  {
    title: "Your business",
    items: [
      { label: "Company", value: "Acme Inc — DTC menswear brand" },
      { label: "Stage", value: "Seed, ~$2.3M ARR, team of 9" },
      { label: "Stack", value: "Stripe, HubSpot, Zendesk, Notion, Google Workspace" },
      { label: "Top competitors", value: "Northwind, Vellum, Swoop, Coingate, LyfeFuel" },
    ],
  },
  {
    title: "Preferences",
    items: [
      { label: "Tone", value: "Concise, no fluff. Lead with the number." },
      { label: "Reports", value: "One page max. Wins first, then risks." },
      { label: "Autonomy", value: "Auto-run low-risk recaps; ask before anything that spends money." },
    ],
  },
];

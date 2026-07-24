// Sentrive - chat. The conversational way to create agents.
// The user talks to Claude; when they describe a recurring job, Claude calls the
// create_recurring_task tool and Sentrive spins up the agent. Authorized as the user.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Cron } from "npm:croner@9";

import { queueApproval } from "../_shared/approvals.ts";
import {
  composioEnabled,
  executeComposioTool,
  FACEBOOK_PUBLISH_DISABLED,
  isComposioTool,
  isWriteTool,
  LINKEDIN_PUBLISH_DISABLED,
  toolsForUser,
} from "../_shared/composio.ts";
import { autonomyMode, chatSystem, fetchWorkspaceContext } from "../_shared/marketing.ts";
import { resolveTeamId } from "../_shared/team.ts";
import { meter } from "../_shared/usage.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

const TOOL = {
  name: "propose_agent",
  description:
    "Propose a recurring task (an 'agent') that Sentrive would run automatically on a schedule. This does NOT create it: the user sees a card summarizing the agent and clicks Create to set it up. Use whenever the user asks you to take care of a recurring job, OR proactively when you notice something worth automating for them. You can propose more than one.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Short name for the agent, e.g. 'Daily sales recap'." },
      instructions: {
        type: "string",
        description: "Clear, self-contained description of what to do on each run.",
      },
      schedule_cron: {
        type: "string",
        description:
          "5-field cron expression (e.g. '0 12 * * *' for daily at noon). Omit for a one-time task.",
      },
      timezone: {
        type: "string",
        description: "IANA timezone, e.g. 'America/New_York'. Default 'UTC'.",
      },
      channel: {
        type: "string",
        enum: ["dashboard", "email"],
        description:
          "Where to deliver the result each run. 'email' sends it to the user's own inbox (their connected Gmail); 'dashboard' keeps it in the app. Default 'dashboard'; pick 'email' when they ask to be emailed / sent the result.",
      },
      kind: {
        type: "string",
        enum: [
          "content",
          "reddit_monitor",
          "linkedin_post",
          "seo_blog",
          "reddit_post",
          "facebook_post",
          "facebook_dm",
          "email_responder",
          "tiktok_slideshow",
          "ops_brief",
        ],
        description:
          "Capability. 'content' (default) produces a written deliverable delivered to the dashboard or email. 'reddit_monitor' watches Reddit for leads matching `keywords` and drafts replies, use this whenever the user wants to find leads/prospects or monitor Reddit. 'linkedin_post' writes an on-brand LinkedIn post from the business context and publishes it to the user's LinkedIn on each run, use this when the user wants recurring LinkedIn content or posts (needs LinkedIn connected). 'seo_blog' writes a complete, SEO-optimized blog article for the business's website and delivers the draft (it does not publish yet), use this when the user wants recurring blog posts or SEO content. 'reddit_post' writes a genuinely valuable, rule-aware post and submits it to the `subreddits` given, use this when the user wants to post content to Reddit (needs Reddit connected; posts wait for approval unless on auto). Warn briefly that Reddit is strict about self-promotion, so it posts value-first. 'facebook_post' writes an on-brand post and publishes it to the business's Facebook Page each run, use this when the user wants recurring Facebook content or posts (needs Facebook connected; posts wait for approval unless on auto). 'facebook_dm' reads the business's Facebook Page inbox and drafts replies to unanswered customer messages, sending them (approval-gated), use this when the user wants to auto-respond to their Facebook messages (needs Facebook connected). 'email_responder' reads the connected Gmail inbox and drafts replies to genuine emails that need one (customer questions, prospect inquiries), sending them in-thread (approval-gated), use this when the user wants help answering their email or triaging their inbox (needs Gmail connected). 'tiktok_slideshow' writes a swipeable TikTok photo slideshow about the business (a hook slide, value slides, and a CTA) plus a caption; the user uploads their own images and downloads the rendered slides to post, use this when the user wants TikTok slideshows or short-form visual content (no connection needed). 'ops_brief' reports on the user's own Sentrive workspace: what their agents did over a window, what is waiting on their approval, what failed, and what runs next, delivered to the dashboard or their inbox. Use this when the user wants a daily brief, a weekly report, a summary of what their agents have been doing, or to be kept in the loop (no connection needed; set config window_days 1 for a daily brief, 7 for a weekly report).",
      },
      keywords: {
        type: "array",
        items: { type: "string" },
        description:
          "For reddit_monitor: OPTIONAL seed search phrases. The agent auto-derives buyer-intent terms from the business context each run, so only pass this if the user explicitly names specific terms they want watched.",
      },
      subreddits: {
        type: "array",
        items: { type: "string" },
        description:
          "For reddit_monitor: optional subreddits to focus on (names without 'r/'), omit to search all of Reddit. For reddit_post: the subreddit(s) to post to (names without 'r/').",
      },
      role: {
        type: "string",
        description:
          "Which EMPLOYEE owns this agent. Every agent belongs to one, so always set this. Use a built-in slug (growth = Maya the Growth Marketer, social = Nova the Social Media Manager, content = Alex the Content Writer, support = Sam in Customer Support, ops = Theo the Operations Manager) or a custom employee's id from the roster list. Pick whoever the work belongs to: the employee the user names, the one whose chat you are in, or the one whose area it plainly is. Then say whose it becomes (\"I'll add this to Maya's agents\").",
      },
    },
    required: ["title", "instructions"],
  },
};

// A brand-new roster member plus its first skill, born from one description.
// Shares the skill fields with propose_agent (minus role: the new agent owns it).
const { role: _skillRole, ...SKILL_PROPS } = TOOL.input_schema.properties;
const NEW_AGENT_TOOL = {
  name: "propose_new_agent",
  description:
    "Propose hiring a brand-new named EMPLOYEE for the user's team, together with their first agent. The user sees a card and clicks to hire; nothing exists until then. Use when the user says hire/employee, wants someone to own a whole area, or no hired employee fits and a standalone agent would be too small for the job. For simple automations prefer propose_agent (with or without an owner).",
  input_schema: {
    type: "object",
    properties: {
      agent_name: {
        type: "string",
        description: "Short given name for the new agent, e.g. 'Kim'. Not a sentence.",
      },
      agent_emoji: { type: "string", description: "One emoji avatar, e.g. '🛠️'." },
      agent_title: {
        type: "string",
        description: "What they do in 2-4 words, e.g. 'Ads Watcher'.",
      },
      ...SKILL_PROPS,
    },
    required: ["agent_name", "agent_title", "title", "instructions"],
  },
};

const UPDATE_TOOL = {
  name: "update_agent",
  description:
    "Change an agent the user ALREADY created (from the current agents list), instead of making a new one. Use whenever they want to adjust, edit, rename, reschedule, refocus, or retarget an existing agent (e.g. 'make it run twice a day', 'also watch r/hvac', 'change the instructions to...'). This does NOT apply immediately: the user sees a card showing what changes and clicks Confirm. Only include the fields that should change; leave the rest out. If it is unclear which existing agent they mean, ask a brief question instead of guessing.",
  input_schema: {
    type: "object",
    properties: {
      agent_id: {
        type: "string",
        description: "The id of the existing agent to change, taken from the current agents list.",
      },
      title: { type: "string", description: "New name, only if renaming." },
      instructions: {
        type: "string",
        description: "Full replacement instructions, only if the user wants them changed.",
      },
      schedule_cron: {
        type: "string",
        description:
          "New 5-field cron, only if the schedule should change. Use 'once' for one-off.",
      },
      channel: {
        type: "string",
        enum: ["dashboard", "email"],
        description: "New delivery, only if it should change.",
      },
      keywords: {
        type: "array",
        items: { type: "string" },
        description:
          "reddit_monitor only: replacement search phrases, only if the user names them.",
      },
      subreddits: {
        type: "array",
        items: { type: "string" },
        description: "reddit_monitor only: replacement subreddits (no 'r/'), only if changing.",
      },
    },
    required: ["agent_id"],
  },
};

const SET_AUTONOMY_TOOL = {
  name: "set_autonomy_mode",
  description:
    "Change how much Sentrive does on its own for this workspace. Use when the user asks you to stop asking and just handle things ('auto'), or to always check with them before acting ('ask'). Affects the chat and all agents.",
  input_schema: {
    type: "object",
    properties: {
      mode: {
        type: "string",
        enum: ["ask", "auto"],
        description:
          "'ask' = high-stakes actions wait for the user's approval. 'auto' = Sentrive carries them out on its own.",
      },
    },
    required: ["mode"],
  },
};

const ANALYZE_TOOL = {
  name: "analyze_website",
  description:
    "Read the user's company website and update what Sentrive knows about their business (the business context that grounds every agent and reply). Use this whenever the user gives you a website URL, asks you to look at or read their site, or when you clearly do not know what their business does and a URL is available. It scrapes the site and saves the result. Afterwards, tell the user in one or two lines what you now understand about their business and that it's saved, do not dump raw fields.",
  input_schema: {
    type: "object",
    properties: {
      website_url: {
        type: "string",
        description: "The company website URL to read (e.g. 'https://acme.com').",
      },
    },
    required: ["website_url"],
  },
};

const ACTIVITY_TOOL = {
  name: "get_recent_activity",
  description:
    "Look up what this workspace's agents actually did recently: community posts published to Reddit (with links), posts that failed and why, replies and posts queued to go out, and each agent's latest runs. Use this whenever the user asks what has been posted, published, sent, or done today or recently, or wants a status update on their agents' output. Present it conversationally, lead with what actually went out (with links), and keep it short. Never say you have no access to past posts; call this instead.",
  input_schema: {
    type: "object",
    properties: {
      days: {
        type: "number",
        description: "How many days back to look. Default 1 (today), max 14.",
      },
    },
  },
};

/**
 * Compact digest of the workspace's own recent output for the chat model:
 * what published (with links), what failed, what's scheduled, and recent runs.
 * Read-only, scoped to the team through the user's own client (RLS).
 */
async function recentActivitySummary(
  // deno-lint-ignore no-explicit-any
  client: any,
  teamId: string,
  days: number,
): Promise<string> {
  const sinceMs = Date.now() - days * 24 * 3600_000;
  const since = new Date(sinceMs).toISOString();

  const [tasksRes, runsRes, draftsRes, queuedRes] = await Promise.all([
    client.from("tasks").select("id, title").eq("team_id", teamId),
    client
      .from("task_runs")
      .select("task_id, status, summary, created_at")
      .eq("team_id", teamId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(30),
    client
      .from("post_drafts")
      .select("title, posts")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .limit(15),
    client
      .from("leads")
      .select("subreddit, title, auto_post_at")
      .eq("team_id", teamId)
      .eq("status", "queued")
      .not("auto_post_at", "is", null)
      .order("auto_post_at", { ascending: true })
      .limit(10),
  ]);

  const titleOf = new Map<string, string>(
    ((tasksRes.data ?? []) as { id: string; title: string }[]).map((t) => [t.id, t.title]),
  );
  const lines: string[] = [`Workspace activity for the last ${days} day(s), times in UTC.`];

  // Community posts: published / failed inside the window, plus anything queued.
  const published: string[] = [];
  const failed: string[] = [];
  const scheduled: string[] = [];
  for (const d of (draftsRes.data ?? []) as { title: string; posts: unknown }[]) {
    const entries = Array.isArray(d.posts) ? d.posts : [];
    for (const e of entries as {
      subreddit?: string;
      status?: string;
      url?: string;
      at?: string;
      error?: string;
    }[]) {
      const atMs = e.at ? Date.parse(e.at) : NaN;
      if (e.status === "posted" && atMs >= sinceMs) {
        published.push(
          `- r/${e.subreddit}: "${d.title}" ${e.url ?? "(no link captured)"} at ${e.at}`,
        );
      } else if (e.status === "failed" && atMs >= sinceMs) {
        failed.push(`- r/${e.subreddit}: "${d.title}" failed: ${e.error ?? "unknown reason"}`);
      } else if (e.status === "queued" && atMs > Date.now() - 60_000) {
        scheduled.push(`- r/${e.subreddit}: "${d.title}" goes out at ${e.at}`);
      }
    }
  }
  if (published.length) lines.push(`\nCommunity posts published:\n${published.join("\n")}`);
  if (failed.length) lines.push(`\nCommunity posts that failed:\n${failed.join("\n")}`);
  if (scheduled.length) lines.push(`\nCommunity posts scheduled:\n${scheduled.join("\n")}`);

  const queued = (queuedRes.data ?? []) as {
    subreddit: string | null;
    title: string;
    auto_post_at: string;
  }[];
  if (queued.length) {
    lines.push(
      `\nReplies queued to auto-post:\n${queued
        .map((q) => `- r/${q.subreddit}: "${q.title}" at ${q.auto_post_at}`)
        .join("\n")}`,
    );
  }

  const runs = (runsRes.data ?? []) as {
    task_id: string;
    status: string;
    summary: string | null;
    created_at: string;
  }[];
  if (runs.length) {
    lines.push(
      `\nAgent runs:\n${runs
        .map(
          (r) =>
            `- ${titleOf.get(r.task_id) ?? "Agent"}: ${r.status}${r.summary ? `, ${r.summary}` : ""} (${r.created_at})`,
        )
        .join("\n")}`,
    );
  } else {
    lines.push("\nNo agent runs in this window.");
  }

  if (!published.length && !failed.length && !scheduled.length && !queued.length) {
    lines.push(
      "\nNothing was published or queued in this window. If the user expected posts, their posting agents may be scheduled later, paused, or in ask mode awaiting approval.",
    );
  }

  return lines.join("\n").slice(0, 12000);
}

interface Msg {
  role: "user" | "assistant";
  content: unknown;
}

/** A proposed agent the user confirms (client creates it on the "Create agent" button). */
interface AgentProposal {
  id: string;
  title: string;
  instructions: string;
  channel: string;
  schedule_cron: string | null;
  timezone: string;
  kind:
    | "content"
    | "reddit_monitor"
    | "linkedin_post"
    | "seo_blog"
    | "reddit_post"
    | "facebook_post"
    | "facebook_dm"
    | "email_responder"
    | "tiktok_slideshow"
    | "ops_brief";
  keywords: string[];
  subreddits: string[];
  /** Roster owner: built-in slug or a custom agent's id; the skill is pinned to them. */
  role?: string;
}

/** A brand-new roster agent plus its first skill, confirmed on a card. */
interface NewAgentProposal {
  id: string; // tool_use id, the card key
  name: string;
  emoji: string;
  agentTitle: string;
  skill: Omit<AgentProposal, "id" | "role">;
}

/** A proposed change to an existing agent the user confirms on a card. */
interface AgentUpdate {
  id: string; // tool_use id, used as the card key
  agentId: string;
  title: string; // the agent's name (new if renamed, else current), for the card
  kind:
    | "content"
    | "reddit_monitor"
    | "linkedin_post"
    | "seo_blog"
    | "reddit_post"
    | "facebook_post"
    | "facebook_dm"
    | "email_responder"
    | "tiktok_slideshow"
    | "ops_brief";
  changes: {
    title?: string;
    instructions?: string;
    schedule_cron?: string | null;
    channel?: string;
    keywords?: string[];
    subreddits?: string[];
  };
}

interface ExistingAgent {
  id: string;
  title: string;
  kind: string;
  instructions: string | null;
  schedule_cron: string | null;
  channel: string | null;
  status: string | null;
}

/** Compact list of the team's agents, so the model can reference and edit them. */
function existingAgentsBlock(agents: ExistingAgent[]): string {
  if (!agents.length) return "";
  const lines = agents.map(
    (a) =>
      `- id: ${a.id} | "${a.title}" | ${a.kind === "reddit_monitor" ? "Reddit leads" : a.kind === "linkedin_post" ? "LinkedIn posts" : a.kind === "seo_blog" ? "SEO blog" : "content"} | ` +
      `schedule: ${a.schedule_cron ?? "one-off"} | delivery: ${a.channel ?? "dashboard"} | ${a.status ?? "active"}`,
  );
  return (
    "\n\nTHIS WORKSPACE'S CURRENT AGENTS (use update_agent with the exact id to change one; " +
    "never propose a new agent when the user wants to change one of these):\n" +
    lines.join("\n")
  );
}

/** Friendly "what I'm doing" text for a tool call, shown live in the chat. */
function statusForTool(slug: string): string {
  const map: Record<string, string> = {
    GMAIL_FETCH_EMAILS: "Reading your inbox",
    GMAIL_FETCH_MESSAGE_BY_THREAD_ID: "Reading the thread",
    GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID: "Reading the email",
    GMAIL_LIST_THREADS: "Scanning your inbox",
    GMAIL_GET_PROFILE: "Checking your account",
    GMAIL_CREATE_EMAIL_DRAFT: "Drafting a reply",
    GMAIL_SEND_EMAIL: "Sending an email",
    GMAIL_SEARCH_PEOPLE: "Searching contacts",
    REDDIT_SEARCH_ACROSS_SUBREDDITS: "Searching Reddit",
    LINKEDIN_GET_MY_INFO: "Checking your LinkedIn",
    LINKEDIN_GET_COMPANY_INFO: "Checking your company pages",
    LINKEDIN_CREATE_LINKED_IN_POST: "Publishing to LinkedIn",
    FACEBOOK_GET_USER_PAGES: "Checking your Facebook pages",
    FACEBOOK_GET_PAGE_POSTS: "Reading your page posts",
    FACEBOOK_GET_PAGE_CONVERSATIONS: "Checking your page inbox",
    FACEBOOK_GET_CONVERSATION_MESSAGES: "Reading the conversation",
    FACEBOOK_CREATE_POST: "Publishing to Facebook",
    FACEBOOK_CREATE_COMMENT: "Replying to a comment",
    FACEBOOK_SEND_MESSAGE: "Sending a Messenger reply",
  };
  if (map[slug]) return map[slug];
  const toolkit = slug.split("_")[0] ?? "";
  return toolkit ? `Working in ${toolkit.charAt(0) + toolkit.slice(1).toLowerCase()}` : "Working";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { messages, attachments, team_id, speaking_as } = await req.json().catch(() => ({}));
    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: "messages array is required" }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const teamId = await resolveTeamId(userClient, team_id);
    if (!teamId) return json({ error: "no team for user" }, 403);

    // Server-side daily budget, so even a client bypassing the UI can't drain
    // the workspace's AI usage.
    const usage = await meter(teamId, "chat");
    if (!usage.ok) {
      return json(
        {
          error: `Daily chat limit reached (${usage.limit} messages). It resets over the next day.`,
        },
        429,
      );
    }

    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) {
      return json({
        reply:
          "I'm not fully connected yet - an Anthropic API key needs to be set on the server. Once it is, I can answer and spin up agents for you.",
        created: [],
      });
    }

    const ws = await fetchWorkspaceContext(userClient, teamId);

    // The team's existing agents, so the chat can edit them (update_agent) rather
    // than only ever creating new ones. RLS-scoped to this team.
    const { data: agentRows } = await userClient
      .from("tasks")
      .select("id, title, kind, instructions, schedule_cron, channel, status")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .limit(25);
    const agents = (agentRows ?? []) as ExistingAgent[];
    const agentsById = new Map(agents.map((a) => [a.id, a]));

    // The named roster, so proposals get assigned to the right agent and the
    // chat talks about the team the user actually sees on the Agents page.
    const { data: customAgents } = await userClient
      .from("team_agents")
      .select("id, name, title, duties")
      .eq("team_id", teamId)
      .order("created_at");
    const rosterBlock =
      "\n\nTHE USER'S NAMED AGENTS (every skill you propose belongs to one; set `role` and name them in your reply):\n" +
      "- Maya, Lead Finder (role: growth): finds leads, watches Reddit and competitors\n" +
      "- Nova, Social Media (role: social): LinkedIn/Reddit/Facebook posts, TikTok slideshows\n" +
      "- Alex, SEO & Content (role: content): articles, blogs, written deliverables\n" +
      "- Sam, Inbox Replies (role: support): Gmail and Messenger replies\n" +
      "- Theo, Operations Manager (role: ops): daily briefs and weekly reports on how the whole team is running\n" +
      (customAgents ?? [])
        .map(
          (c) =>
            `- ${c.name}, ${c.title} (role: ${c.id}), created by the user${c.duties ? `: ${c.duties.slice(0, 160)}` : ""}\n`,
        )
        .join("") +
      'These are EMPLOYEES, the only layer the user sees. Every agent belongs to one of them: there are no ownerless agents. How to decide: if the user says "hire" or "employee", or wants someone to own a whole area no one covers, use propose_new_agent (a new employee with their first agent). Otherwise use propose_agent and ALWAYS set `role` to whoever the work belongs to, naming them in your reply ("I have added this to Nova\'s agents"). When the user names an employee, or you are speaking as one, that is the owner.';

    // In an employee's own chat the assistant IS that employee: same brain and
    // tools, but they speak in the first person about their own area instead
    // of introducing themselves as Sentrive.
    const speaker =
      speaking_as && typeof speaking_as === "object"
        ? (speaking_as as { name?: string; title?: string; duties?: string; role?: string })
        : null;
    const identityBlock = speaker?.name
      ? `\n\nWHO YOU ARE IN THIS CONVERSATION: you are ${speaker.name}, the ${speaker.title ?? "team member"} on this user's team${
          speaker.duties ? `. Your area: ${speaker.duties}` : ""
        }. Speak as ${speaker.name} in the first person ("I watch Reddit for...", "I posted this morning"). Never introduce yourself as Sentrive or as an assistant, and never describe your teammates' work as your own: if the user asks for something outside your area, say plainly that it belongs to a teammate (or offer to set it up for them) instead of pretending it is yours. Work you set up here becomes YOUR agent.`
      : "";

    const system = chatSystem(ws) + identityBlock + existingAgentsBlock(agents) + rosterBlock;
    let mode = autonomyMode(ws);

    // The workspace's connected tools (Gmail, etc.) so the chat can do real work,
    // not just talk. Executed against this team's own accounts via Composio. Drop
    // the publish tools that are disabled upstream (LinkedIn, Facebook Page posts)
    // so chat drafts the post instead of attempting a doomed publish, matching the
    // runner.
    const FB_POST_TOOLS = new Set([
      "FACEBOOK_CREATE_POST",
      "FACEBOOK_CREATE_PHOTO_POST",
      "FACEBOOK_CREATE_VIDEO_POST",
    ]);
    const connectedTools = (
      composioEnabled() ? await toolsForUser(teamId).catch(() => []) : []
    ).filter((t) => {
      const name = (t as { name?: string }).name ?? "";
      if (LINKEDIN_PUBLISH_DISABLED && name === "LINKEDIN_CREATE_LINKED_IN_POST") return false;
      if (FACEBOOK_PUBLISH_DISABLED && FB_POST_TOOLS.has(name)) return false;
      return true;
    });

    // Only trust plain {role, content:string} turns from the client.
    const convo: Msg[] = messages
      .filter(
        (m: Msg) =>
          m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
      )
      .map((m: Msg) => ({ role: m.role, content: m.content }));

    // Attach uploaded files (images / PDFs) to the latest user turn so Claude can see them.
    if (Array.isArray(attachments) && attachments.length > 0 && convo.length > 0) {
      const last = convo[convo.length - 1];
      if (last.role === "user" && typeof last.content === "string") {
        // deno-lint-ignore no-explicit-any
        const blocks: any[] = [];
        for (const a of attachments) {
          if (!a?.data || typeof a.mediaType !== "string") continue;
          if (a.kind === "image") {
            blocks.push({
              type: "image",
              source: { type: "base64", media_type: a.mediaType, data: a.data },
            });
          } else if (a.kind === "document") {
            blocks.push({
              type: "document",
              source: { type: "base64", media_type: a.mediaType, data: a.data },
            });
          }
        }
        if (blocks.length > 0) {
          blocks.push({ type: "text", text: last.content });
          convo[convo.length - 1] = { role: "user", content: blocks };
        }
      }
    }

    // Stream "what I'm doing" status events as Sentrive works, then the final reply.
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (o: unknown) =>
          controller.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
        const working: Msg[] = [...convo];
        const created: Array<{ id: string; title: string }> = [];
        const proposals: AgentProposal[] = [];
        const newAgents: NewAgentProposal[] = [];
        const updates: AgentUpdate[] = [];
        let contextUpdated = false;
        let reply = "";
        try {
          for (let i = 0; i < 10; i++) {
            send({ type: "status", text: "Thinking" });
            const res = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
              },
              body: JSON.stringify({
                model: "claude-opus-4-8",
                max_tokens: 2048,
                system,
                tools: [
                  TOOL,
                  NEW_AGENT_TOOL,
                  UPDATE_TOOL,
                  ANALYZE_TOOL,
                  SET_AUTONOMY_TOOL,
                  ACTIVITY_TOOL,
                  ...connectedTools,
                ],
                messages: working,
              }),
            });
            if (!res.ok) {
              const body = await res.text();
              send({
                type: "error",
                error: `Claude API error ${res.status}: ${body.slice(0, 300)}`,
              });
              return;
            }
            const data = await res.json();

            if (data.stop_reason === "tool_use") {
              working.push({ role: "assistant", content: data.content });
              const toolResults: unknown[] = [];
              for (const block of data.content ?? []) {
                if (block.type !== "tool_use") continue;
                if (block.name === "propose_agent") {
                  send({ type: "status", text: "Designing an agent" });
                  const inp = block.input ?? {};
                  let cron: string | null =
                    typeof inp.schedule_cron === "string" && inp.schedule_cron.trim()
                      ? inp.schedule_cron.trim()
                      : null;
                  if (cron) {
                    try {
                      new Cron(cron);
                    } catch {
                      cron = null;
                    }
                  }
                  const kind:
                    | "content"
                    | "reddit_monitor"
                    | "linkedin_post"
                    | "seo_blog"
                    | "reddit_post"
                    | "facebook_post"
                    | "facebook_dm"
                    | "email_responder"
                    | "tiktok_slideshow"
                    | "ops_brief" =
                    inp.kind === "ops_brief"
                      ? "ops_brief"
                      : inp.kind === "reddit_monitor"
                        ? "reddit_monitor"
                        : inp.kind === "linkedin_post"
                          ? "linkedin_post"
                          : inp.kind === "seo_blog"
                            ? "seo_blog"
                            : inp.kind === "reddit_post"
                              ? "reddit_post"
                              : inp.kind === "facebook_post"
                                ? "facebook_post"
                                : inp.kind === "facebook_dm"
                                  ? "facebook_dm"
                                  : inp.kind === "email_responder"
                                    ? "email_responder"
                                    : inp.kind === "tiktok_slideshow"
                                      ? "tiktok_slideshow"
                                      : "content";
                  const proposal: AgentProposal = {
                    id: block.id,
                    title: String(inp.title ?? "Untitled agent").slice(0, 200),
                    instructions: String(inp.instructions ?? ""),
                    channel: typeof inp.channel === "string" ? inp.channel : "dashboard",
                    schedule_cron: cron,
                    timezone: typeof inp.timezone === "string" ? inp.timezone : "UTC",
                    kind,
                    keywords:
                      kind === "reddit_monitor" && Array.isArray(inp.keywords)
                        ? inp.keywords.map(String)
                        : [],
                    subreddits:
                      kind === "reddit_monitor" && Array.isArray(inp.subreddits)
                        ? inp.subreddits.map(String)
                        : [],
                    role:
                      typeof inp.role === "string" && inp.role.trim() ? inp.role.trim() : undefined,
                  };
                  proposals.push(proposal);
                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content:
                      `Proposed the agent "${proposal.title}" to the user. They now see a card and ` +
                      `click Create to set it up. Do not say it is created, active, or running; it ` +
                      `is only a proposal until they create it. Keep your reply to a short line.`,
                  });
                } else if (block.name === "propose_new_agent") {
                  send({ type: "status", text: "Designing a new agent" });
                  const inp = block.input ?? {};
                  let cron: string | null =
                    typeof inp.schedule_cron === "string" && inp.schedule_cron.trim()
                      ? inp.schedule_cron.trim()
                      : null;
                  if (cron) {
                    try {
                      new Cron(cron);
                    } catch {
                      cron = null;
                    }
                  }
                  const KINDS = [
                    "content",
                    "reddit_monitor",
                    "linkedin_post",
                    "seo_blog",
                    "reddit_post",
                    "facebook_post",
                    "facebook_dm",
                    "email_responder",
                    "tiktok_slideshow",
                    "ops_brief",
                  ] as const;
                  const kind = (KINDS as readonly string[]).includes(String(inp.kind))
                    ? (String(inp.kind) as (typeof KINDS)[number])
                    : "content";
                  const na: NewAgentProposal = {
                    id: block.id,
                    name: String(inp.agent_name ?? "New agent").slice(0, 40),
                    emoji: String(inp.agent_emoji ?? "🤖").slice(0, 8),
                    agentTitle: String(inp.agent_title ?? "Custom agent").slice(0, 60),
                    skill: {
                      title: String(inp.title ?? "Untitled skill").slice(0, 200),
                      instructions: String(inp.instructions ?? ""),
                      channel: typeof inp.channel === "string" ? inp.channel : "dashboard",
                      schedule_cron: cron,
                      timezone: typeof inp.timezone === "string" ? inp.timezone : "UTC",
                      kind,
                      keywords:
                        kind === "reddit_monitor" && Array.isArray(inp.keywords)
                          ? inp.keywords.map(String)
                          : [],
                      subreddits: Array.isArray(inp.subreddits) ? inp.subreddits.map(String) : [],
                    },
                  };
                  newAgents.push(na);
                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content:
                      `Proposed the new agent "${na.name}" (${na.agentTitle}) with the skill ` +
                      `"${na.skill.title}". The user sees a card and clicks Create to add them to ` +
                      `the roster. Do not say they exist yet. Keep your reply to a short line.`,
                  });
                } else if (block.name === "update_agent") {
                  send({ type: "status", text: "Updating the agent" });
                  const inp = block.input ?? {};
                  const target = agentsById.get(String(inp.agent_id ?? ""));
                  if (!target) {
                    toolResults.push({
                      type: "tool_result",
                      tool_use_id: block.id,
                      content:
                        "No agent with that id exists in this workspace. Check the current agents " +
                        "list and use the exact id, or ask the user which agent they mean.",
                      is_error: true,
                    });
                  } else {
                    const changes: AgentUpdate["changes"] = {};
                    if (typeof inp.title === "string" && inp.title.trim())
                      changes.title = inp.title.trim().slice(0, 200);
                    if (typeof inp.instructions === "string" && inp.instructions.trim())
                      changes.instructions = inp.instructions.trim();
                    if (
                      typeof inp.channel === "string" &&
                      ["dashboard", "email"].includes(inp.channel)
                    )
                      changes.channel = inp.channel;
                    if (typeof inp.schedule_cron === "string") {
                      const raw = inp.schedule_cron.trim();
                      if (raw === "once" || raw === "") {
                        changes.schedule_cron = null;
                      } else {
                        try {
                          new Cron(raw);
                          changes.schedule_cron = raw;
                        } catch {
                          // ignore an invalid cron rather than break the edit
                        }
                      }
                    }
                    if (target.kind === "reddit_monitor") {
                      if (Array.isArray(inp.keywords))
                        changes.keywords = inp.keywords.map(String).slice(0, 12);
                      if (Array.isArray(inp.subreddits))
                        changes.subreddits = inp.subreddits.map(String).slice(0, 12);
                    }

                    if (Object.keys(changes).length === 0) {
                      toolResults.push({
                        type: "tool_result",
                        tool_use_id: block.id,
                        content:
                          "Nothing to change was provided. Ask the user what they want adjusted.",
                        is_error: true,
                      });
                    } else {
                      updates.push({
                        id: block.id,
                        agentId: target.id,
                        title: changes.title ?? target.title,
                        kind:
                          target.kind === "reddit_monitor"
                            ? "reddit_monitor"
                            : target.kind === "linkedin_post"
                              ? "linkedin_post"
                              : target.kind === "seo_blog"
                                ? "seo_blog"
                                : "content",
                        changes,
                      });
                      toolResults.push({
                        type: "tool_result",
                        tool_use_id: block.id,
                        content:
                          `Proposed a change to "${target.title}". The user sees a card with what ` +
                          `changes and clicks Confirm to apply it. Do not say it is already changed; ` +
                          `it applies only when they confirm. Keep your reply to a short line.`,
                      });
                    }
                  }
                } else if (block.name === "set_autonomy_mode") {
                  const next = block.input?.mode === "auto" ? "auto" : "ask";
                  const { error } = await userClient
                    .from("teams")
                    .update({ autonomy_mode: next })
                    .eq("id", teamId);
                  if (error) {
                    toolResults.push({
                      type: "tool_result",
                      tool_use_id: block.id,
                      content: `Could not change the mode: ${error.message}`,
                      is_error: true,
                    });
                  } else {
                    mode = next; // honor the new mode for the rest of this turn
                    toolResults.push({
                      type: "tool_result",
                      tool_use_id: block.id,
                      content:
                        next === "auto"
                          ? "Autonomy set to auto. Sentrive will now carry out actions on its own."
                          : "Autonomy set to ask. Sentrive will queue actions for your approval.",
                    });
                  }
                } else if (block.name === "analyze_website") {
                  send({ type: "status", text: "Reading the website" });
                  const site = String(block.input?.website_url ?? "").trim();
                  if (!site) {
                    toolResults.push({
                      type: "tool_result",
                      tool_use_id: block.id,
                      content: "No URL was provided. Ask the user for their website URL.",
                      is_error: true,
                    });
                  } else {
                    try {
                      // Reuse the analyze-website function (scrape + extract + save),
                      // as the user, so it lands in their workspace context.
                      const res = await fetch(`${url}/functions/v1/analyze-website`, {
                        method: "POST",
                        headers: {
                          "content-type": "application/json",
                          Authorization: authHeader,
                          apikey: anon,
                        },
                        body: JSON.stringify({ website_url: site, team_id: teamId }),
                      });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok || data?.error) {
                        toolResults.push({
                          type: "tool_result",
                          tool_use_id: block.id,
                          content:
                            `Could not read ${site}: ${data?.error ?? `error ${res.status}`}. Ask the user ` +
                            "to double-check the URL, or they can paste a short description of the business instead.",
                          is_error: true,
                        });
                      } else {
                        contextUpdated = true;
                        toolResults.push({
                          type: "tool_result",
                          tool_use_id: block.id,
                          content:
                            `Read ${site} and saved the updated business context: ${JSON.stringify(data.context ?? {})}. ` +
                            "Tell the user in one or two lines what you now understand about their business and that it's saved. Do not paste the raw fields.",
                        });
                      }
                    } catch (e) {
                      toolResults.push({
                        type: "tool_result",
                        tool_use_id: block.id,
                        content:
                          `Error reading ${site}: ${e instanceof Error ? e.message : String(e)}. Ask the ` +
                          "user to paste a short description of their business instead.",
                        is_error: true,
                      });
                    }
                  }
                } else if (block.name === "get_recent_activity") {
                  send({ type: "status", text: "Checking what your agents did" });
                  try {
                    const days = Math.min(14, Math.max(1, Number(block.input?.days) || 1));
                    const summary = await recentActivitySummary(userClient, teamId, days);
                    toolResults.push({
                      type: "tool_result",
                      tool_use_id: block.id,
                      content: summary,
                    });
                  } catch (e) {
                    toolResults.push({
                      type: "tool_result",
                      tool_use_id: block.id,
                      content: `Could not load the activity: ${e instanceof Error ? e.message : String(e)}`,
                      is_error: true,
                    });
                  }
                } else if (
                  isComposioTool(block.name) &&
                  isWriteTool(block.name) &&
                  mode === "ask"
                ) {
                  // High-stakes action in ask mode: queue it for approval, never send now.
                  send({ type: "status", text: "Waiting for your approval" });
                  const { message } = await queueApproval(userClient, {
                    teamId,
                    toolSlug: block.name,
                    toolArgs: block.input ?? {},
                    source: "chat",
                    createdBy: user.id,
                  });
                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: message,
                  });
                } else if (isComposioTool(block.name)) {
                  send({ type: "status", text: statusForTool(block.name) });
                  try {
                    const out = await executeComposioTool(teamId, block.name, block.input ?? {});
                    toolResults.push({ type: "tool_result", tool_use_id: block.id, content: out });
                  } catch (e) {
                    toolResults.push({
                      type: "tool_result",
                      tool_use_id: block.id,
                      content: `Error: ${e instanceof Error ? e.message : String(e)}`,
                      is_error: true,
                    });
                  }
                } else {
                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: "Unknown tool.",
                    is_error: true,
                  });
                }
              }
              working.push({ role: "user", content: toolResults });
              continue;
            }

            reply = (data.content ?? [])
              .filter((b: { type: string }) => b.type === "text")
              .map((b: { text: string }) => b.text)
              .join("\n")
              .trim();
            break;
          }
          // Honor the no-em-dash rule regardless of the model.
          reply = reply.replace(/\s*—\s*/g, ", ");
          send({
            type: "done",
            reply: reply || "Done.",
            created,
            proposals,
            newAgents,
            updates,
            contextUpdated,
          });
        } catch (e) {
          send({ type: "error", error: e instanceof Error ? e.message : String(e) });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { ...cors, "content-type": "text/event-stream", "cache-control": "no-cache" },
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// Shared task-execution logic used by both the on-demand runner (run-task)
// and the scheduler (run-due-tasks), so the two paths can never drift.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { queueApproval } from "./approvals.ts";
import {
  composioEnabled,
  executeComposioTool,
  isComposioTool,
  isWriteTool,
  toolsForUser,
} from "./composio.ts";
import {
  fetchWorkspaceContext,
  runnerSystem,
  taskAutonomy,
  type WorkspaceContext,
} from "./marketing.ts";
import { createPostDraft, parsePostDraft, publishDraft } from "./reddit-post.ts";
import { runRedditMonitor } from "./reddit-monitor.ts";

export interface TaskRow {
  id: string;
  team_id: string;
  title: string;
  instructions: string;
  channel?: string;
  schedule_cron: string | null;
  timezone: string;
  status: string;
  kind?: string;
  config?: Record<string, unknown> | null;
  autonomy_mode?: string | null;
}

export interface RunResult {
  status: "succeeded" | "failed" | "skipped";
  run_id?: string;
  summary?: string;
  error?: string;
}

/** How to gate write actions: the client to record approvals with and the run they belong to. */
export interface ExecuteContext {
  client: SupabaseClient;
  runId?: string | null;
}

/**
 * A task's own recent finished outputs, most recent first, trimmed for prompt
 * use. Gives a posting agent real memory of what it already produced so it can
 * avoid repeating itself, without it having to invent a history it can't recall.
 */
async function recentTaskOutputs(client: SupabaseClient, taskId: string): Promise<string[]> {
  const { data } = await client
    .from("task_runs")
    .select("output")
    .eq("task_id", taskId)
    .eq("status", "succeeded")
    .order("created_at", { ascending: false })
    .limit(5);
  return (data ?? [])
    .map((r) => (typeof r.output === "string" ? r.output.trim() : ""))
    .filter(Boolean)
    .map((o) => o.slice(0, 600));
}

/** Produce the finished work for a task (real Claude call, or a preview when no key is set). */
export async function executeTask(
  task: TaskRow,
  ws: WorkspaceContext | null = null,
  ctx: ExecuteContext | null = null,
): Promise<{ summary: string; output: string }> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");

  if (!key) {
    return {
      summary: "Preview run - connect an AI key to make this real",
      output:
        `Sentrive received the task “${task.title}”.\n\n` +
        `It would now carry out:\n${task.instructions}\n\n` +
        `Add an ANTHROPIC_API_KEY to the function's secrets and this will return the real, finished result.`,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 150_000); // hard cap
  try {
    let system = runnerSystem(ws);

    // Tools available this run:
    //  - web_search: Anthropic-hosted (server-side); the API runs it and pauses
    //    the turn (stop_reason "pause_turn") while it works.
    //  - the workspace's connected tools (Gmail, etc.) via Composio: client-side
    //    tools we execute (stop_reason "tool_use"), scoped to this team's accounts.
    const connectedTools = composioEnabled()
      ? await toolsForUser(task.team_id).catch(() => [])
      : [];
    // Can this workspace actually publish to LinkedIn right now? A linkedin_post
    // agent with no live connection can only draft, and we must be honest about
    // that rather than let a green run imply the post went out.
    const linkedinConnected = connectedTools.some(
      (t) => t.name === "LINKEDIN_CREATE_LINKED_IN_POST",
    );
    const redditConnected = connectedTools.some((t) => t.name === "REDDIT_CREATE_REDDIT_POST");
    const facebookConnected = connectedTools.some((t) => t.name === "FACEBOOK_CREATE_POST");
    const gmailConnected = connectedTools.some((t) => t.name === "GMAIL_REPLY_TO_THREAD");

    // A LinkedIn poster publishes when it can (the autonomy gate decides whether
    // the post goes out now or waits for approval); with no connection it falls
    // back to an honest draft, flagged in the run output below.
    if (task.kind === "linkedin_post") {
      system += linkedinConnected
        ? "\n\nThis agent is a LinkedIn poster. Write ONE on-brand LinkedIn post grounded in the " +
          "business and aimed at its audience (a strong hook, real substance, a clear takeaway; no " +
          "hashtag spam, no em dashes), then PUBLISH it by calling the LinkedIn create-post tool. Do " +
          "not just draft it, actually call the tool."
        : "\n\nThis agent is a LinkedIn poster, but LinkedIn is NOT connected for this workspace, so " +
          "you cannot publish. Write ONE polished, on-brand LinkedIn post (a strong hook, real " +
          "substance, a clear takeaway; no hashtag spam, no em dashes) and deliver it as the result " +
          "for the user to review. Do not claim you posted, scheduled, or queued it.";
      // Real recency memory: hand the agent its own recent posts so it varies
      // topic and hook instead of repeating itself week to week, and so it never
      // has to invent an ongoing thread it can't actually remember.
      const recentPosts = ctx?.client ? await recentTaskOutputs(ctx.client, task.id) : [];
      if (recentPosts.length) {
        system +=
          "\n\nThese are the posts this agent has already produced, most recent first. Do NOT reuse " +
          "their topic, hook, or angle: deliberately pick a clearly different direction this time. " +
          "This list is your ONLY record of past posts, so do not reference or invent anything " +
          "beyond it.\n\n" +
          recentPosts.map((p, i) => `${i + 1}. ${p}`).join("\n\n");
      } else {
        system +=
          "\n\nThis is the first post for this agent and you have no record of earlier ones, so " +
          "write a strong standalone post and do not pretend to continue a prior thread.";
      }
    }
    // A Reddit poster is the highest ban-risk agent: Reddit removes overt
    // self-promotion and can ban the account. The directive forces a value-first,
    // rule-aware post, the autonomy gate still holds it for approval in Ask mode,
    // and with no connection it degrades to an honest draft.
    if (task.kind === "reddit_post") {
      const rawSubs = task.config?.subreddits;
      const subs = Array.isArray(rawSubs)
        ? rawSubs.map((s) => String(s).replace(/^r\//i, "")).filter(Boolean)
        : [];
      const target = subs.length
        ? `the subreddit(s) ${subs.map((s) => `r/${s}`).join(", ")}`
        : "a subreddit where this business's audience actually spends time";
      // Draft only. The model NEVER posts: the user reviews the draft and
      // publishes it in one click (or auto mode publishes it after the run), so
      // edits and subreddit choices are honored and each post is tracked.
      system +=
        "\n\nThis agent is a Reddit poster. Reddit is strict about self-promotion, so write ONE genuinely " +
        `valuable post for ${target} that stands on its own (a real insight, a useful resource, or an ` +
        "honest story), and mention the business only if the subreddit's rules allow it, with a brief " +
        "honest disclosure. FIRST use web_search to check that subreddit's rules and what posts do well " +
        "there; if self-promotion is banned, write a purely helpful post with no promotion. Do NOT post " +
        "it and do not call any posting tool: just write it. The user reviews the draft and posts it to " +
        "the subreddit(s) in one click. No clickbait, no hashtag spam, no em dashes.";
      // The post body is Reddit markdown, so let it use formatting where it aids
      // readability, without looking like an ad.
      system +=
        "\n\nThe body is Reddit markdown, so format it where it genuinely helps the reader: **bold** the " +
        "key point, keep paragraphs short, and use bullet or numbered lists for steps or comparisons. Do " +
        "not over-format or make it look like marketing; match how well-received posts in that subreddit " +
        "actually read.";
      // The output IS the deliverable the user reviews, so it must be just the
      // post (title + body), not the model narrating what it checked and why. We
      // parse this exact shape into a draft (title + body) after the run.
      system +=
        "\n\nYour reply is the deliverable the user reviews, so make it ONLY the post and nothing else. " +
        "Do not narrate what you checked, why you made choices, or whether you posted it. Format it " +
        "exactly as:\n\n**Title:** <the post title>\n\n<the post body in Reddit markdown>\n\nNo preamble " +
        'such as "Done" or "Here is what I wrote", and no commentary before or after the post.';
      const recentPosts = ctx?.client ? await recentTaskOutputs(ctx.client, task.id) : [];
      if (recentPosts.length) {
        system +=
          "\n\nThese are the posts this agent has already produced, most recent first. Do NOT reuse " +
          "their topic, angle, or subreddit framing: pick a clearly different direction this time. This " +
          "list is your ONLY record of past posts, so do not reference or invent anything beyond it.\n\n" +
          recentPosts.map((p, i) => `${i + 1}. ${p}`).join("\n\n");
      }
    }
    // A Facebook Page poster publishes to the business's own Page (low risk, no
    // ban dynamics), gated by autonomy like the other posters; with no connection
    // it degrades to an honest draft.
    if (task.kind === "facebook_post") {
      // The user may have attached their own image/video to go out with the post.
      const media = task.config?.media as { url?: string; type?: string } | undefined;
      const mediaUrl = typeof media?.url === "string" ? media.url : "";
      const mediaType = media?.type === "video" ? "video" : mediaUrl ? "image" : "";
      const publishStep =
        mediaType === "image"
          ? `then PUBLISH it to that Page WITH the attached image by calling the Facebook create-photo-post tool: pass the Page id, the image url ${mediaUrl}, and your post text as the message/caption.`
          : mediaType === "video"
            ? `then PUBLISH it to that Page WITH the attached video by calling the Facebook create-video-post tool: pass the Page id, the video url ${mediaUrl} as the file_url, and your post text as the description.`
            : "then PUBLISH the post to that Page by calling the Facebook create-post tool.";
      system += facebookConnected
        ? "\n\nThis agent is a Facebook Page poster. Write ONE on-brand Facebook post grounded in the " +
          "business and aimed at its audience (a clear hook, real value, a warm tone that fits Facebook; " +
          "no hashtag spam, no em dashes). FIRST call the Facebook get-pages tool to find the business's " +
          `Page and its id, ${publishStep} Do not just draft it, actually call the tool.` +
          (mediaType ? ` The user attached this ${mediaType} to include with the post.` : "")
        : "\n\nThis agent is a Facebook Page poster, but Facebook is NOT connected for this workspace, so " +
          "you cannot publish. Write ONE polished, on-brand Facebook post and deliver it as the result " +
          "for the user to review. Do not claim you posted, scheduled, or queued it.";
      const recentPosts = ctx?.client ? await recentTaskOutputs(ctx.client, task.id) : [];
      if (recentPosts.length) {
        system +=
          "\n\nThese are the posts this agent has already produced, most recent first. Do NOT reuse " +
          "their topic, hook, or angle: pick a clearly different direction this time. This list is your " +
          "ONLY record of past posts, so do not reference or invent anything beyond it.\n\n" +
          recentPosts.map((p, i) => `${i + 1}. ${p}`).join("\n\n");
      }
    }
    // A Facebook Messenger responder answers the Page's inbox: it reads live
    // conversations, drafts a reply to each unanswered customer message, and
    // sends it (approval-gated in Ask mode). No recency memory: it works from
    // the live conversation history.
    if (task.kind === "facebook_dm") {
      system += facebookConnected
        ? "\n\nThis agent answers the business's Facebook Page inbox. FIRST call the Facebook get-pages " +
          "tool to find the Page and its id, then read the Page's recent conversations and, for the ones " +
          "that need it, their messages. For each conversation whose LATEST message is from the customer " +
          "and has not yet been answered by the Page, draft a warm, on-brand reply that genuinely answers " +
          "them (concise, human, no canned corporate tone, no em dashes) and send it with the Facebook " +
          "send-message tool. Skip conversations the Page already replied to. When you are done, briefly " +
          "summarize which conversations you replied to (or that the inbox was already clear)."
        : "\n\nThis agent answers the business's Facebook Page inbox, but Facebook is NOT connected for " +
          "this workspace, so you cannot read or reply to messages. Tell the user to connect Facebook on " +
          "the Integrations page, and stop.";
    }
    // An email inbox responder triages the connected Gmail and drafts replies to
    // genuine messages that need one. The reply tool is approval-gated, so in Ask
    // mode each draft waits for the user before it sends.
    if (task.kind === "email_responder") {
      system += gmailConnected
        ? "\n\nThis agent triages the business's email inbox and replies. Fetch recent UNREAD emails from " +
          'the primary inbox (use a query like "is:unread in:inbox newer_than:2d" with a small limit and ' +
          "full content). For each email that is a GENUINE message from a real person that warrants a reply " +
          "(a customer question, a prospect or sales inquiry, a partnership ask), draft a helpful, on-brand " +
          "reply that actually answers them (warm, concise, human, no canned corporate tone, no em dashes) " +
          "and send it in that thread with the Gmail reply-to-thread tool. SKIP newsletters, notifications, " +
          "receipts, automated or no-reply emails, marketing, and anything already replied to. When done, " +
          "briefly summarize which emails you replied to (or that the inbox needed nothing)."
        : "\n\nThis agent answers the business's email inbox, but Gmail is NOT connected for this workspace, " +
          "so you cannot read or reply to email. Tell the user to connect Gmail on the Integrations page, " +
          "and stop.";
    }
    if (task.kind === "seo_blog") {
      system +=
        "\n\nThis agent is an SEO blog writer for the business's own website. Write ONE complete, " +
        "publish-ready article grounded in the business, its product, and its audience, targeting " +
        "real search intent: a compelling title, a one-line meta description, clear H2/H3 structure, " +
        "and 800 to 1500 words of genuinely useful content (no fluff, no em dashes). Use web_search " +
        "to check the topic, angles, and what already ranks. Return the full article as the result " +
        "(title, then meta description, then the body). Do not publish it anywhere, just deliver it.";
    }

    // A reddit_post agent only DRAFTS; the app publishes on the user's click, so
    // hide the Reddit posting tool from the model — it must never post directly.
    const usableTools =
      task.kind === "reddit_post"
        ? connectedTools.filter(
            (t) => (t as { name?: string }).name !== "REDDIT_CREATE_REDDIT_POST",
          )
        : connectedTools;
    const tools: unknown[] = [
      { type: "web_search_20260209", name: "web_search", max_uses: 5 },
      ...usableTools,
    ];

    const messages: { role: string; content: unknown }[] = [
      { role: "user", content: task.instructions },
    ];
    // deno-lint-ignore no-explicit-any
    let content: any[] = [];
    // web_search runs in a server-side container; once a turn pauses or a tool
    // use is pending, the API requires the same container id back on every
    // follow-up request. Capture it from each response and echo it below.
    let container: string | undefined;

    for (let i = 0; i < 12; i++) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-opus-4-8",
          max_tokens: 4096,
          system,
          tools,
          messages,
          ...(container ? { container } : {}),
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Claude API error ${res.status}: ${body.slice(0, 300)}`);
      }

      const data = await res.json();
      content = data.content ?? [];
      const cid = typeof data.container === "string" ? data.container : data.container?.id;
      if (cid) container = cid;

      // Server tool (web_search) in flight: resume the turn.
      if (data.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content });
        continue;
      }

      // Client tool calls (Composio): execute each against this team's accounts.
      if (data.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content });
        const results: unknown[] = [];
        for (const b of content) {
          if (b.type !== "tool_use") continue;
          if (!isComposioTool(b.name)) {
            results.push({
              type: "tool_result",
              tool_use_id: b.id,
              content: `Unknown tool: ${b.name}`,
              is_error: true,
            });
            continue;
          }
          // High-stakes actions: run unattended only in auto mode (this agent's
          // own setting, or the workspace default); otherwise queue for approval.
          if (isWriteTool(b.name) && taskAutonomy(task, ws) === "ask" && ctx?.client) {
            const { message } = await queueApproval(ctx.client, {
              teamId: task.team_id,
              toolSlug: b.name,
              toolArgs: b.input ?? {},
              source: "agent",
              agentTitle: task.title,
              taskId: task.id,
              runId: ctx.runId ?? null,
            });
            results.push({ type: "tool_result", tool_use_id: b.id, content: message });
            continue;
          }
          try {
            const out = await executeComposioTool(task.team_id, b.name, b.input ?? {});
            results.push({ type: "tool_result", tool_use_id: b.id, content: out });
          } catch (e) {
            results.push({
              type: "tool_result",
              tool_use_id: b.id,
              content: `Error: ${e instanceof Error ? e.message : String(e)}`,
              is_error: true,
            });
          }
        }
        messages.push({ role: "user", content: results });
        continue;
      }

      break;
    }

    // Keep only the text produced after the last tool activity - that's the
    // finished answer, without the interleaved "let me search..." narration.
    let lastToolIdx = -1;
    content.forEach((b, idx) => {
      if (b.type !== "text") lastToolIdx = idx;
    });
    const raw: string = content
      .slice(lastToolIdx + 1)
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n")
      .trim();
    // Deterministically honor the no-em-dash rule regardless of the model.
    const output = raw.replace(/\s*—\s*/g, ", ");

    // A LinkedIn agent that couldn't publish (no live connection) must not look
    // like a normal success: lead with a plain notice so the empty Approvals tab
    // makes sense, while still keeping the draft it produced.
    if (task.kind === "linkedin_post" && !linkedinConnected) {
      const notice =
        "LinkedIn isn't connected, so this post could not be published or sent for approval. " +
        "Connect LinkedIn on the Integrations page, then run this agent again to review and approve it.";
      return {
        summary: "Draft ready, connect LinkedIn to publish",
        output: `${notice}\n\nDraft:\n\n${output || "(empty response)"}`,
      };
    }
    // A reddit_post run produces a draft (title + body) for the user to review
    // and publish. We save it as a post_draft so it shows on the agent's Posts
    // tab with per-subreddit posting. In auto mode we also publish it now to the
    // agent's target subreddits.
    if (task.kind === "reddit_post" && ctx?.client) {
      const parsed = parsePostDraft(output || "");
      const rawSubs = (task.config as { subreddits?: unknown } | null)?.subreddits;
      const subs = Array.isArray(rawSubs)
        ? rawSubs.map((s) => String(s).replace(/^r\//i, "").trim()).filter(Boolean)
        : [];
      const draftId = await createPostDraft(ctx.client, task, parsed).catch(() => null);

      if (draftId && taskAutonomy(task, ws) === "auto" && redditConnected && subs.length) {
        const res = await publishDraft(
          ctx.client,
          draftId,
          task.team_id,
          subs,
          parsed.title,
          parsed.body,
        ).catch(() => null);
        if (res && res.posted > 0) {
          const where = res.results
            .filter((r) => r.status === "posted")
            .map((r) => `r/${r.subreddit}`)
            .join(", ");
          return { summary: `Posted to ${where}`.slice(0, 140), output: `Posted to ${where}.\n\n${output}` };
        }
      }
      const notice = redditConnected
        ? "Draft ready. Open the Posts tab to edit it, pick subreddits, and post in one click."
        : "Draft ready. Connect Reddit on the Integrations page to post it in one click.";
      return { summary: `Draft ready: ${parsed.title}`.slice(0, 140), output: `${notice}\n\n${output}` };
    }
    if (task.kind === "facebook_post" && !facebookConnected) {
      const notice =
        "Facebook isn't connected, so this post could not be published or sent for approval. " +
        "Connect Facebook on the Integrations page, then run this agent again to review and approve it.";
      return {
        summary: "Draft ready, connect Facebook to publish",
        output: `${notice}\n\nDraft:\n\n${output || "(empty response)"}`,
      };
    }
    if (task.kind === "facebook_dm" && !facebookConnected) {
      return {
        summary: "Connect Facebook to answer your inbox",
        output:
          "Facebook isn't connected, so this agent can't read or reply to your Page messages. " +
          "Connect Facebook on the Integrations page, then run it again.",
      };
    }
    if (task.kind === "email_responder" && !gmailConnected) {
      return {
        summary: "Connect Gmail to answer your inbox",
        output:
          "Gmail isn't connected, so this agent can't read or reply to your email. " +
          "Connect Gmail on the Integrations page, then run it again.",
      };
    }

    // Summary is the first real line, stripped of markdown markers so the run
    // list header reads clean (e.g. "Title: ..." not "**Title:** ...").
    const firstLine = (output.split("\n").find((l) => l.trim()) ?? "Done")
      .replace(/\*\*/g, "")
      .replace(/^#+\s*/, "")
      .replace(/^>\s*/, "");
    return { summary: firstLine.slice(0, 140), output: output || "(empty response)" };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Deliver a finished result to the user, per the agent's channel. "email"
 * sends the output to the team's own connected Gmail address (a self-send:
 * it is reporting to the user, not an outward-facing action, so it does not
 * go through the approval gate). Delivery failures never fail the run.
 */
async function deliverResult(task: TaskRow, summary: string, output: string): Promise<void> {
  if (task.channel !== "email" || !composioEnabled()) return;
  try {
    const profileRaw = await executeComposioTool(task.team_id, "GMAIL_GET_PROFILE", {});
    const email = profileRaw.match(/"emailAddress"\s*:\s*"([^"]+)"/)?.[1];
    if (!email) return;
    await executeComposioTool(task.team_id, "GMAIL_SEND_EMAIL", {
      recipient_email: email,
      subject: `${task.title}: ${summary}`.slice(0, 180),
      body: `${output}\n\n--\nSent by Sentrive, from your agent "${task.title}". Manage it on your Agents page.`,
    });
  } catch (e) {
    console.error("email delivery failed:", e instanceof Error ? e.message : String(e));
  }
}

/**
 * Run one task once: record a run row, execute, and persist the outcome.
 * `admin` must be a service-role client (writes bypass RLS). Authorization is
 * the caller's responsibility - this function trusts that the task is allowed.
 */
export async function runTaskOnce(admin: SupabaseClient, task: TaskRow): Promise<RunResult> {
  // Avoid piling up duplicate concurrent runs for the same task.
  const { count } = await admin
    .from("task_runs")
    .select("id", { count: "exact", head: true })
    .eq("task_id", task.id)
    .eq("status", "running");
  if ((count ?? 0) > 0) {
    return { status: "skipped", summary: "A run is already in progress" };
  }

  const { data: run, error: runErr } = await admin
    .from("task_runs")
    .insert({
      task_id: task.id,
      team_id: task.team_id,
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (runErr || !run) {
    return { status: "failed", error: runErr?.message ?? "Could not create run" };
  }

  try {
    const ws = await fetchWorkspaceContext(admin, task.team_id);
    const { summary, output } =
      task.kind === "reddit_monitor"
        ? await runRedditMonitor(admin, task, ws)
        : await executeTask(task, ws, { client: admin, runId: run.id });
    await admin
      .from("task_runs")
      .update({ status: "succeeded", summary, output, finished_at: new Date().toISOString() })
      .eq("id", run.id);
    await admin.from("tasks").update({ last_run_at: new Date().toISOString() }).eq("id", task.id);
    await deliverResult(task, summary, output);
    return { status: "succeeded", run_id: run.id, summary };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin
      .from("task_runs")
      .update({ status: "failed", error: msg, finished_at: new Date().toISOString() })
      .eq("id", run.id);
    return { status: "failed", run_id: run.id, error: msg };
  }
}

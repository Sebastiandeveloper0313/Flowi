// Shared task-execution logic used by both the on-demand runner (run-task)
// and the scheduler (run-due-tasks), so the two paths can never drift.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { queueApproval } from "./approvals.ts";
import {
  composioActionError,
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
import { runRedditMonitor } from "./reddit-monitor.ts";
import { createPostDraft, parsePostDraft, queueDraft } from "./reddit-post.ts";
import { createSlideshow, parseSlideshow } from "./slideshow.ts";

// Composio's LinkedIn connector hardcodes a deprecated LinkedIn-Version header,
// so every publish gets "426 Upgrade Required" from LinkedIn and nothing goes
// out (ComposioHQ/composio#3113; a version override does not fix it). Until they
// ship a supported version, LinkedIn posters draft the post for the user to copy
// in by hand instead of attempting a doomed publish. Flip back to false the
// moment Composio updates their connector.
const LINKEDIN_PUBLISH_DISABLED = true;

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
): Promise<{ summary: string; output: string; error?: string }> {
  // A slideshow renders text over the user's own images, so there's nothing to
  // make until they've added some. Skip the run (scheduled or manual) with a
  // clear nudge instead of generating blank slides, so it only ever produces a
  // real slideshow once images exist.
  if (task.kind === "tiktok_slideshow") {
    const imgs = (task.config as { images?: unknown } | null)?.images;
    if (!Array.isArray(imgs) || imgs.length === 0) {
      return {
        summary: "Add images first, then run this agent",
        output:
          "This agent turns your images into a swipeable TikTok slideshow. Add a few images to it " +
          "in the Images panel on the agent page, then run it and it will write the slides over them.",
      };
    }
  }

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
  // Hard cap comfortably under the platform's function wall-clock limit, so WE
  // abort and mark the run failed rather than getting killed mid-run (which
  // orphans it as "running").
  const timeout = setTimeout(() => controller.abort(), 110_000);
  try {
    let system = runnerSystem(ws, task.kind);

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
    // Publishing needs a live connection AND a working upstream connector; while
    // LinkedIn publishing is disabled (see LINKEDIN_PUBLISH_DISABLED) we only draft.
    const linkedinCanPublish = linkedinConnected && !LINKEDIN_PUBLISH_DISABLED;
    const redditConnected = connectedTools.some((t) => t.name === "REDDIT_CREATE_REDDIT_POST");
    const facebookConnected = connectedTools.some((t) => t.name === "FACEBOOK_CREATE_POST");
    const gmailConnected = connectedTools.some((t) => t.name === "GMAIL_REPLY_TO_THREAD");

    // A LinkedIn poster publishes when it can (the autonomy gate decides whether
    // the post goes out now or waits for approval); with no connection it falls
    // back to an honest draft, flagged in the run output below.
    if (task.kind === "linkedin_post") {
      system += linkedinCanPublish
        ? "\n\nThis agent is a LinkedIn poster. Write ONE on-brand LinkedIn post grounded in the " +
          "business and aimed at its audience (a strong hook, real substance, a clear takeaway; no " +
          "hashtag spam, no em dashes), then PUBLISH it by calling the LinkedIn create-post tool. Do " +
          "not just draft it, actually call the tool."
        : "\n\nThis agent is a LinkedIn poster, but publishing is not available right now, so you " +
          "cannot post. Write ONE polished, on-brand LinkedIn post (a strong hook, real substance, a " +
          "clear takeaway; no hashtag spam, no em dashes) and deliver it as the result for the user " +
          "to post themselves. Do not call any publish tool; do not claim you posted, scheduled, or " +
          "queued it.";
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
      // Whether the agent chooses its own subreddits (default) or posts only to
      // the user's fixed list (pick_subreddits === false).
      const pickSubs =
        (task.config as { pick_subreddits?: boolean } | null)?.pick_subreddits !== false;
      const list = subs.map((s) => `r/${s}`).join(", ");
      // Draft only. The model NEVER posts: it writes the post (and, when allowed,
      // picks the subreddits that fit), so the user reviews and posts in one click
      // (or auto mode queues them after the run).
      const intro =
        "\n\nThis agent is a Reddit poster. Write ONE genuinely valuable post that stands on its own (a " +
        "real insight, a useful resource, or an honest story), and mention the business only where a " +
        "subreddit's rules allow it, with a brief honest disclosure. ";
      if (pickSubs) {
        const seed = subs.length
          ? `The user suggested these subreddits: consider them first, but you may drop or swap any for a better fit: ${list}. `
          : "";
        system +=
          intro +
          seed +
          "Then CHOOSE 3 to 5 subreddits where THIS post genuinely fits and would be welcomed. You already " +
          "know Reddit's communities and their self-promotion norms, so choose from what you know and " +
          "avoid ones that ban this kind of post. Only if you are genuinely unsure about a specific " +
          "subreddit's rules, do ONE quick web_search to check it, do not research every subreddit. Prefer " +
          "active, relevant subreddits over the biggest ones. Do NOT post anything or call any posting " +
          "tool: just write the post and list the subreddits. The user reviews and posts to them in one " +
          "click. No clickbait, no hashtag spam, no em dashes.";
      } else {
        const targetList = subs.length ? list : "the subreddits the user set on this agent";
        system +=
          intro +
          `Post ONLY to these subreddits the user chose: ${targetList}. Tailor the post so it fits and is ` +
          "welcome there; keep it purely helpful with no promotion if a subreddit bans that. You may do " +
          "ONE quick web_search only if unsure of a subreddit's rules. Do NOT choose any other " +
          "subreddits, and do not post anything or call any posting tool: just write the post. The user " +
          "reviews and posts it in one click. No clickbait, no hashtag spam, no em dashes.";
      }
      // The post body is Reddit markdown, so let it use formatting where it aids
      // readability, without looking like an ad.
      system +=
        "\n\nThe body is Reddit markdown, so format it where it genuinely helps the reader: **bold** the " +
        "key point, keep paragraphs short, and use bullet or numbered lists for steps or comparisons. Do " +
        "not over-format or make it look like marketing; match how well-received posts actually read.";
      // The output IS the deliverable the user reviews: just the post plus the
      // chosen subreddits. We parse this exact shape into a draft afterward.
      system +=
        "\n\nYour reply is the deliverable the user reviews, so make it ONLY the post and its subreddits, " +
        "nothing else. Do not narrate what you checked or why. Format it EXACTLY as:\n\n" +
        "**Subreddits:** subreddit1, subreddit2, subreddit3\n**Title:** <the post title>\n\n<the post " +
        "body in Reddit markdown>\n\nList bare subreddit names, comma-separated (no r/ prefix needed). No " +
        'preamble such as "Done" or "Here is what I wrote", and no commentary before or after the post.';
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
        "and 800 to 1500 words of genuinely useful content (no fluff, no em dashes). You may use " +
        "web_search AT MOST TWICE to sanity-check the angle and what already ranks, then STOP " +
        "researching and write, you already know the business from the context above. Do not keep " +
        "searching; a finished article matters more than exhaustive research. Return the full article " +
        "as the result (title, then meta description, then the body). Do not publish it, just deliver it.";
    }
    if (task.kind === "tiktok_slideshow") {
      system +=
        "\n\nYou create a TikTok photo slideshow for this business. Produce 5 to 7 short slides a viewer " +
        "swipes through: slide 1 is a scroll-stopping HOOK, each middle slide delivers ONE crisp, " +
        "valuable, specific point about the business or product (relatable, not salesy), and the LAST " +
        "slide is a clear call to action. Each slide's on-screen text is SHORT and punchy, readable in " +
        "1 to 2 seconds (a few words up to one short sentence). Also write a caption for the post that " +
        "ends with the CTA. Output ONLY a JSON object and nothing else, in exactly this shape:\n" +
        '{"title": "<short internal name>", "slides": [{"text": "<on-screen line>"}], "caption": ' +
        '"<post caption ending with a call to action>"}\n' +
        'For the CTA, prefer "link in bio" (TikTok links aren\'t clickable in captions). If you name ' +
        "the website, use the business's EXACT url from the context above, never invent or change the " +
        "domain or TLD. No hashtag spam, no em dashes, no markdown, no commentary outside the JSON.";
    }

    // Hide tools the model must never call: a reddit_post agent only DRAFTS (the
    // app publishes on the user's click), and LinkedIn publishing is disabled
    // upstream, so drop its posting tool too rather than let a run 426.
    const usableTools = connectedTools.filter((t) => {
      const name = (t as { name?: string }).name;
      if (task.kind === "reddit_post" && name === "REDDIT_CREATE_REDDIT_POST") return false;
      if (LINKEDIN_PUBLISH_DISABLED && name === "LINKEDIN_CREATE_LINKED_IN_POST") return false;
      return true;
    });
    const tools: unknown[] = [
      { type: "web_search_20260209", name: "web_search", max_uses: 5 },
      ...usableTools,
    ];

    const messages: { role: string; content: unknown }[] = [
      { role: "user", content: task.instructions },
    ];
    // deno-lint-ignore no-explicit-any
    let content: any[] = [];
    // Track whether a real outward action (publish/send) actually landed. A
    // failed publish comes back as a normal tool result the agent narrates away,
    // so without this the run would look green when nothing went out. A later
    // successful call of a write tool clears an earlier failure (the agent retried).
    let publishFailed: string | undefined;
    let publishOk = false;
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
            // Composio returns 200 even when the provider rejected the action, so
            // inspect the payload rather than trusting the lack of a throw.
            if (isWriteTool(b.name)) {
              const actionErr = composioActionError(out);
              if (actionErr) publishFailed = actionErr;
              else {
                publishOk = true;
                publishFailed = undefined;
              }
            }
            results.push({ type: "tool_result", tool_use_id: b.id, content: out });
          } catch (e) {
            if (isWriteTool(b.name)) publishFailed = e instanceof Error ? e.message : String(e);
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

    // If the agent tried to publish/send and the action never went through, this
    // run failed no matter how gracefully it wrapped up: surface that so it shows
    // red with the real reason instead of a misleading green success.
    const publishError = publishFailed && !publishOk ? publishFailed : undefined;

    // A LinkedIn agent that couldn't publish (no live connection, or publishing
    // disabled upstream) must not look like a normal success: lead with a plain
    // notice so the empty Approvals tab makes sense, while keeping the draft.
    if (task.kind === "linkedin_post" && !linkedinCanPublish) {
      const post = output || "(empty response)";
      // Publishing paused upstream: deliver the CLEAN post so the agent page's
      // draft card shows and copies it verbatim; the paused context is the summary.
      if (LINKEDIN_PUBLISH_DISABLED) {
        return { summary: "Post ready to copy into LinkedIn", output: post };
      }
      const notice =
        "LinkedIn isn't connected, so this post could not be published or sent for approval. " +
        "Connect LinkedIn on the Integrations page, then run this agent again to review and approve it.";
      return {
        summary: "Draft ready, connect LinkedIn to publish",
        output: `${notice}\n\nDraft:\n\n${post}`,
      };
    }
    // A reddit_post run produces a draft (title + body) for the user to review
    // and publish. We save it as a post_draft so it shows on the agent's Posts
    // tab with per-subreddit posting. In auto mode we also publish it now to the
    // agent's target subreddits.
    if (task.kind === "reddit_post" && ctx?.client) {
      const parsed = parsePostDraft(output || "");
      const rawSubs = (task.config as { subreddits?: unknown } | null)?.subreddits;
      const configSubs = Array.isArray(rawSubs)
        ? rawSubs.map((s) => String(s).replace(/^r\//i, "").trim()).filter(Boolean)
        : [];
      const pickSubs =
        (task.config as { pick_subreddits?: boolean } | null)?.pick_subreddits !== false;
      // When the agent picks, use its choices (falling back to any pinned subs);
      // when the user turned picking off, post only to their fixed list.
      const subs = pickSubs
        ? parsed.subreddits.length
          ? parsed.subreddits
          : configSubs
        : configSubs;
      const draftId = await createPostDraft(ctx.client, task, parsed, subs).catch(() => null);

      // Draft couldn't be saved: keep the full post in run history so it isn't
      // lost. Otherwise the run is just a short log line - the post itself lives
      // on the Posts tab, so we don't duplicate it here.
      if (!draftId) {
        return { summary: `Draft ready: ${parsed.title}`.slice(0, 140), output };
      }

      // Auto mode QUEUES the chosen subs to post over the next hours (a cancel
      // window), rather than bursting them out now, which is a ban risk. The user
      // can cancel or edit any queued post on the Posts tab before it fires.
      if (taskAutonomy(task, ws) === "auto" && redditConnected && subs.length) {
        const n = await queueDraft(ctx.client, draftId, subs).catch(() => 0);
        if (n > 0) {
          const where = subs.map((s) => `r/${s}`).join(", ");
          return {
            summary: `Queued to post to ${n} subreddit${n === 1 ? "" : "s"}`.slice(0, 140),
            output: `Queued "${parsed.title}" to post to ${where} over the next few hours. Cancel or edit any on the Posts tab before it goes out.`,
          };
        }
      }
      const notice = redditConnected
        ? "Review, edit, pick subreddits, and post it from the Posts tab."
        : "Connect Reddit on the Integrations page, then post it from the Posts tab.";
      return {
        summary: `Draft ready: ${parsed.title}`.slice(0, 140),
        output: `Wrote a new post draft: "${parsed.title}".\n\n${notice}`,
      };
    }
    // A slideshow run parses the model's JSON into slides and saves it. The app
    // renders those over the user's images on the Slideshow tab and downloads
    // them to post to TikTok. Falls through to the raw output if parsing fails.
    if (task.kind === "tiktok_slideshow" && ctx?.client) {
      const show = parseSlideshow(output || "");
      if (show) {
        const id = await createSlideshow(ctx.client, task, show).catch(() => null);
        if (id) {
          return {
            summary: `Slideshow ready: ${show.title}`.slice(0, 140),
            output: `Made a ${show.slides.length}-slide TikTok slideshow. Open the Slideshow tab to preview and download it.`,
          };
        }
      }
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
    const summary = publishError
      ? `Couldn't publish: ${publishError}`.slice(0, 140)
      : firstLine.slice(0, 140);
    return { summary, output: output || "(empty response)", error: publishError };
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
  // Atomically claim a run slot. Two triggers firing within milliseconds (e.g.
  // an auto-run on agent creation firing twice) could otherwise both pass a
  // check-then-insert and each create a run, producing duplicate work and
  // duplicate approvals. claim_task_run serializes the check-and-insert per task
  // with an advisory lock, so only one caller gets a run id; the rest skip. It
  // uses the same 4-minute freshness window as the reaper, so an orphaned run
  // (function died) never wedges the agent.
  const { data: claimedId, error: claimErr } = await admin.rpc("claim_task_run", {
    p_task_id: task.id,
    p_team_id: task.team_id,
  });
  if (claimErr) {
    return { status: "failed", error: claimErr.message ?? "Could not create run" };
  }
  if (!claimedId) {
    return { status: "skipped", summary: "A run is already in progress" };
  }
  const run = { id: claimedId as string };

  try {
    const ws = await fetchWorkspaceContext(admin, task.team_id);
    const { summary, output, error } =
      task.kind === "reddit_monitor"
        ? await runRedditMonitor(admin, task, ws)
        : await executeTask(task, ws, { client: admin, runId: run.id });
    // A returned `error` means a real action (publish/send) failed even though the
    // agent finished: record it as failed, but keep the summary/output so the draft
    // it produced isn't lost. Don't email a failure as if it were a result.
    await admin
      .from("task_runs")
      .update({
        status: error ? "failed" : "succeeded",
        summary,
        output,
        error: error ?? null,
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    await admin.from("tasks").update({ last_run_at: new Date().toISOString() }).eq("id", task.id);
    if (!error) await deliverResult(task, summary, output);
    return error
      ? { status: "failed", run_id: run.id, error }
      : { status: "succeeded", run_id: run.id, summary };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin
      .from("task_runs")
      .update({ status: "failed", error: msg, finished_at: new Date().toISOString() })
      .eq("id", run.id);
    return { status: "failed", run_id: run.id, error: msg };
  }
}

// Which integrations an agent needs connected before a run can succeed. Kept
// exactly in sync with the runner: reddit_monitor refuses to run without
// Reddit; content agents draft with web search and need nothing connected
// (publishing happens later through approvals), so prompting for connections
// there would be noise, however chatty the instructions are about platforms.

export function requiredToolkits(task: { kind?: string | null }): string[] {
  if (task.kind === "reddit_monitor") return ["reddit"];
  if (task.kind === "reddit_post") return ["reddit"];
  if (task.kind === "linkedin_post") return ["linkedin"];
  if (task.kind === "facebook_post") return ["facebook"];
  if (task.kind === "facebook_dm") return ["facebook"];
  return [];
}

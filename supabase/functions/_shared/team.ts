// Resolve which workspace (team) a request acts on, safely. When the client
// sends a team_id (the active workspace), we verify membership through the
// user-scoped client: RLS only lets a user see their own team_members rows, so
// a team_id they don't belong to resolves to null and the caller rejects it.
// With no team_id we fall back to the user's first team (single-workspace
// callers and older clients).
// deno-lint-ignore no-explicit-any
export async function resolveTeamId(userClient: any, teamId?: unknown): Promise<string | null> {
  if (typeof teamId === "string" && teamId) {
    const { data } = await userClient
      .from("team_members")
      .select("team_id")
      .eq("team_id", teamId)
      .maybeSingle();
    return data?.team_id ?? null;
  }
  const { data } = await userClient.from("team_members").select("team_id").limit(1).maybeSingle();
  return data?.team_id ?? null;
}

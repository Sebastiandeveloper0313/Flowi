/**
 * supabase-js reports a failed Edge Function call with a generic message
 * ("Edge Function returned a non-2xx status code") and hides the real body on
 * `error.context` (the raw Response). Our functions return the actual reason as
 * `{ error: "..." }`, so pull it out and surface that instead of the generic line.
 */
export async function readFunctionError(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): Promise<string> {
  const ctx = (error as { context?: unknown } | null)?.context;
  if (ctx && typeof (ctx as Response).text === "function") {
    try {
      const raw = (await (ctx as Response).text()).trim();
      try {
        const body = JSON.parse(raw) as { error?: unknown; message?: unknown };
        const msg = body.error ?? body.message;
        if (typeof msg === "string" && msg.trim()) return msg.trim();
      } catch {
        // not JSON: use the raw body if it's a readable message
        if (raw && !raw.startsWith("<")) return raw.slice(0, 300);
      }
    } catch {
      // couldn't read the response body
    }
  }
  const msg = (error as { message?: unknown } | null)?.message;
  return typeof msg === "string" && msg && !/non-2xx status code/i.test(msg) ? msg : fallback;
}

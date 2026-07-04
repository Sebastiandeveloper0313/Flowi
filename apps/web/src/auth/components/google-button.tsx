import { Button } from "@workspace/ui/components/button";
import { useState } from "react";

import { signInWithGoogle } from "../mutations";

/** "Continue with Google" button with an "or" divider, shared by login and signup. */
export function GoogleButton() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onClick() {
    setError(null);
    setPending(true);
    try {
      await signInWithGoogle(); // navigates away on success
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start Google sign-in. Try again.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="bg-border h-px flex-1" />
        <span className="text-muted-foreground text-xs uppercase">or</span>
        <span className="bg-border h-px flex-1" />
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={onClick}
        disabled={pending}
      >
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M23.52 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.46a5.52 5.52 0 01-2.4 3.62v3h3.88c2.27-2.09 3.58-5.17 3.58-8.81z"
          />
          <path
            fill="#34A853"
            d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3.01c-1.07.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.11A12 12 0 0012 24z"
          />
          <path
            fill="#FBBC05"
            d="M5.28 14.28A7.2 7.2 0 014.9 12c0-.79.14-1.56.38-2.28V6.61H1.27a12 12 0 000 10.78l4.01-3.11z"
          />
          <path
            fill="#EA4335"
            d="M12 4.77c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 001.27 6.61l4.01 3.11C6.22 6.88 8.87 4.77 12 4.77z"
          />
        </svg>
        Continue with Google
      </Button>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}

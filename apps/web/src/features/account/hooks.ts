import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { updateProfileName } from "@/features/onboarding/mutations";
import { onboardingKeys } from "@/features/onboarding/queries";
import { supabase } from "@/integrations/supabase/client";

/** Save the user's display name to their profile. */
export function useUpdateProfileName() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (fullName: string) => updateProfileName(fullName.trim()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: onboardingKeys.profile }),
  });
}

/**
 * Permanently delete the account (server-side cancels billing and cascades all
 * data), then clear the local session and return to the landing page.
 */
export function useDeleteAccount() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("delete-account", { body: {} });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: async () => {
      await supabase.auth.signOut().catch(() => {});
      void navigate({ to: "/" });
    },
  });
}

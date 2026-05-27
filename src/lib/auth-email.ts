import { supabase } from "@/integrations/supabase/client";

export function getAuthEmailRedirectUrl() {
  return `${window.location.origin}/dashboard`;
}

export async function resendSignupConfirmation(email: string) {
  return supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: getAuthEmailRedirectUrl(),
    },
  });
}

export function isEmailConfirmationError(message?: string | null) {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return normalized.includes("email not confirmed") || normalized.includes("email_not_confirmed");
}
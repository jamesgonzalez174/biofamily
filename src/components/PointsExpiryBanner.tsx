import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export function PointsExpiryBanner() {
  const { user } = useAuth();

  const { data: settings } = useQuery({
    queryKey: ["settings-expiry"],
    queryFn: async () => {
      const { data } = await supabase
        .from("settings")
        .select("points_expire_at")
        .eq("id", 1)
        .single();
      return data;
    },
  });

  const { data: profile } = useQuery({
    queryKey: ["profile-balance", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("points_balance")
        .eq("id", user!.id)
        .single();
      return data;
    },
  });

  const expireAt = (settings as any)?.points_expire_at;
  const balance = profile?.points_balance ?? 0;

  if (!expireAt || balance <= 0) return null;

  const expiryDate = new Date(expireAt);
  const now = Date.now();
  const msLeft = expiryDate.getTime() - now;
  if (msLeft <= 0) return null;

  const daysLeft = Math.ceil(msLeft / 86_400_000);
  const urgent = daysLeft <= 30;

  const formatted = expiryDate.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-2xl border p-4 shadow-soft ${
        urgent
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-warning/40 bg-warning/10 text-warning"
      }`}
    >
      <div
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${
          urgent ? "bg-destructive/20" : "bg-warning/20"
        }`}
      >
        {urgent ? <AlertTriangle className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">
          {urgent
            ? `Your ${balance.toLocaleString()} points expire in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`
            : `Points expire on ${formatted}`}
        </div>
        <div className="text-xs opacity-90">
          {urgent
            ? `Redeem before ${formatted} or your balance resets to zero.`
            : `You have ${daysLeft} days to redeem your ${balance.toLocaleString()} points.`}
        </div>
      </div>
      <Link
        to="/catalog"
        className={`shrink-0 rounded-xl px-4 py-2 text-xs font-semibold shadow-soft ${
          urgent
            ? "bg-destructive text-destructive-foreground hover:opacity-90"
            : "bg-warning text-warning-foreground hover:opacity-90"
        }`}
      >
        Redeem now
      </Link>
    </div>
  );
}

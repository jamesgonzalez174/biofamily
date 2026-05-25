import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

/**
 * Subscribes to the current user's points_ledger inserts and shows a toast
 * whenever points are awarded (or deducted).
 */
export function PointsNotifier() {
  const { user } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`points-ledger-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "points_ledger",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as { delta: number; reason: string };
          if (!row || typeof row.delta !== "number") return;
          if (row.delta > 0) {
            toast.success(`+${row.delta} points!`, {
              description: row.reason,
              icon: <Sparkles className="h-4 w-4 text-primary" />,
              duration: 6000,
            });
          } else if (row.delta < 0) {
            toast(`${row.delta} points`, { description: row.reason });
          }
          qc.invalidateQueries({ queryKey: ["profile", user.id] });
          qc.invalidateQueries({ queryKey: ["history"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, qc]);

  return null;
}

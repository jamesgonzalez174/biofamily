import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { listSalesRepOptions } from "@/lib/pharmacy-directory.functions";

/** Asks signed-in members who haven't answered yet how they found the app. */
export function ReferralPrompt() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [source, setSource] = useState("");
  const [repId, setRepId] = useState("");
  const [reps, setReps] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const { data } = useQuery({
    queryKey: ["referral-source", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("referral_source").eq("id", user!.id).maybeSingle();
      return data;
    },
  });
  const needs = !!data && !data.referral_source && !dismissed;

  useEffect(() => {
    if (needs) listSalesRepOptions().then((r) => setReps(r?.reps ?? [])).catch(() => setReps([]));
  }, [needs]);

  if (!needs) return null;

  const save = async () => {
    if (!source) return toast.error("Please pick an option.");
    if (source === "sales_rep" && !repId) return toast.error("Please select your sales rep.");
    setSaving(true);
    const { error } = await supabase.from("profiles")
      .update({ referral_source: source, sales_rep_id: source === "sales_rep" ? repId : null })
      .eq("id", user!.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Thanks for letting us know!");
    qc.invalidateQueries({ queryKey: ["referral-source", user!.id] });
  };

  const cls = "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none ring-ring focus:ring-2";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 p-4 backdrop-blur-sm">
      <div role="dialog" aria-label="How did you find out about the app?" className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <h2 className="text-lg font-semibold">How did you find out about the app?</h2>
        <p className="mt-1 text-sm text-muted-foreground">Quick question — it helps us improve.</p>
        <div className="mt-4 space-y-3">
          <select value={source} onChange={(e) => { setSource(e.target.value); if (e.target.value !== "sales_rep") setRepId(""); }} className={cls}>
            <option value="">Select an option</option>
            <option value="email">Email</option>
            <option value="sales_rep">Sales rep</option>
            <option value="social_media">Social media</option>
            <option value="friend">Friend or colleague</option>
            <option value="pharmacy">At my pharmacy</option>
            <option value="other">Other</option>
          </select>
          {source === "sales_rep" && (
            <select value={repId} onChange={(e) => setRepId(e.target.value)} className={cls}>
              <option value="">{reps.length ? "Select your sales rep" : "No sales reps available yet"}</option>
              {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={() => setDismissed(true)} className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-accent">Later</button>
          <button onClick={save} disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

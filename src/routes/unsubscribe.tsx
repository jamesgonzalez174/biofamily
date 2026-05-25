import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/unsubscribe")({
  component: UnsubscribePage,
});

function UnsubscribePage() {
  const [state, setState] = useState<"loading" | "valid" | "done" | "already" | "error">("loading");
  const [submitting, setSubmitting] = useState(false);
  const token = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("token") : null;

  useEffect(() => {
    if (!token) { setState("error"); return; }
    fetch(`/email/unsubscribe?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.valid) setState("valid");
        else if (d.reason === "already_unsubscribed") setState("already");
        else setState("error");
      })
      .catch(() => setState("error"));
  }, [token]);

  const confirm = async () => {
    if (!token) return;
    setSubmitting(true);
    const res = await fetch("/email/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const d = await res.json();
    setSubmitting(false);
    if (d.success) setState("done");
    else if (d.reason === "already_unsubscribed") setState("already");
    else setState("error");
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-soft">
        <h1 className="text-2xl font-bold">Email preferences</h1>
        {state === "loading" && <p className="mt-3 text-muted-foreground">Checking your link…</p>}
        {state === "valid" && (
          <>
            <p className="mt-3 text-muted-foreground">Click below to unsubscribe from Biomed Family emails.</p>
            <button onClick={confirm} disabled={submitting}
              className="mt-6 rounded-lg bg-gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-soft hover:opacity-95 disabled:opacity-50">
              {submitting ? "Unsubscribing…" : "Confirm unsubscribe"}
            </button>
          </>
        )}
        {state === "done" && <p className="mt-3 text-muted-foreground">You've been unsubscribed. We won't email you again.</p>}
        {state === "already" && <p className="mt-3 text-muted-foreground">You're already unsubscribed.</p>}
        {state === "error" && <p className="mt-3 text-destructive">This link is invalid or has expired.</p>}
      </div>
    </div>
  );
}

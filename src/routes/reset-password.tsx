import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sparkles, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthScene } from "@/components/AuthScene";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase auto-creates a recovery session from the URL fragment.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("Password must be at least 8 characters.");
    if (password !== confirm) return toast.error("Passwords don't match.");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated. You're signed in.");
    navigate({ to: "/dashboard" });
  };

  return (
    <AuthScene>
      <Link to="/" className="auth-pop mb-8 flex items-center justify-center gap-2">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-primary shadow-glow">
          <Sparkles className="h-5 w-5 text-primary-foreground" />
        </div>
        <span className="text-lg font-semibold tracking-tight">Prizely</span>
      </Link>
      <div className="auth-glass auth-pop-sm rounded-2xl p-8">
        <h1 className="auth-pop text-2xl font-semibold tracking-tight">Set a new password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {ready ? "Choose a strong password you'll remember." : "Validating reset link…"}
        </p>
        <form onSubmit={submit} className="auth-pop-sm mt-6 space-y-4">
          <PasswordField label="New password" value={password} onChange={setPassword} />
          <PasswordField label="Confirm password" value={confirm} onChange={setConfirm} />
          <button
            disabled={loading || !ready}
            className="w-full rounded-xl bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-glow transition hover:opacity-95 hover:-translate-y-0.5 disabled:opacity-60"
          >
            {loading ? "Updating…" : "Update password"}
          </button>
        </form>
      </div>
    </AuthScene>
  );
}

function PasswordField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          minLength={8}
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 pr-10 text-sm outline-none ring-ring focus:ring-2"
        />
        <button type="button" onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground hover:text-foreground">
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </label>
  );
}

import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sparkles, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthScene } from "@/components/AuthScene";
import { lovable } from "@/integrations/lovable";

async function signInWithGoogle() {
  const result = await lovable.auth.signInWithOAuth("google", {
    redirect_uri: `${window.location.origin}/dashboard`,
  });
  if (result.error) toast.error(result.error.message ?? "Google sign-in failed");
}

export const Route = createFileRoute("/signup")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) throw redirect({ to: "/dashboard" });
  },
  component: SignupPage,
});

type Pharmacy = { id: string; name: string; address: string | null };

function SignupPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [pharmacyId, setPharmacyId] = useState("");
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from("pharmacies").select("id, name, address").eq("is_active", true).order("name")
      .then(({ data }) => setPharmacies((data ?? []) as Pharmacy[]));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return toast.error("Password must be at least 6 characters.");
    if (!phone.trim()) return toast.error("Phone number is required.");
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: {
        data: { full_name: fullName, phone: phone.trim() },
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });
    if (error) { setLoading(false); return toast.error(error.message); }
    if (pharmacyId && data.user) {
      await supabase.from("profiles").update({ pharmacy_id: pharmacyId }).eq("id", data.user.id);
    }
    setLoading(false);
    toast.success("Account created!");
    navigate({ to: "/dashboard" });
  };

  return (
    <AuthScene>
      <Link to="/" className="auth-pop mb-8 flex items-center justify-center gap-2">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-primary shadow-glow">
          <Sparkles className="h-5 w-5 text-primary-foreground" />
        </div>
        <span className="text-lg font-semibold tracking-tight">Biomed Family</span>
      </Link>
      <div className="auth-glass auth-pop-sm rounded-2xl p-8">
        <h1 className="auth-pop text-2xl font-semibold tracking-tight">Create account</h1>
        <p className="mt-1 text-sm text-muted-foreground">Start earning points on every purchase.</p>
        <form onSubmit={submit} className="auth-pop-sm mt-6 space-y-4">
          <Field label="Full name" value={fullName} onChange={setFullName} />
          <Field label="Email" type="email" value={email} onChange={setEmail} required />
          <Field label="Phone number" type="tel" value={phone} onChange={setPhone} required />
          <Field label="Password" type="password" value={password} onChange={setPassword} required />
          {pharmacies.length > 0 && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium">Pharmacy</span>
              <select
                value={pharmacyId}
                onChange={(e) => setPharmacyId(e.target.value)}
                className="w-full rounded-lg border border-input bg-background/60 px-3 py-2.5 text-sm outline-none ring-ring focus:ring-2"
              >
                <option value="">Select your pharmacy (optional)</option>
                {pharmacies.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{p.address ? ` — ${p.address}` : ""}</option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-muted-foreground">You can change this later from your dashboard.</span>
            </label>
          )}
          <button disabled={loading} className="w-full rounded-xl bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-glow transition hover:opacity-95 hover:-translate-y-0.5 disabled:opacity-60">
            {loading ? "Creating…" : "Create account"}
          </button>
        </form>
        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>
        <button
          type="button"
          onClick={signInWithGoogle}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-input bg-background py-2.5 text-sm font-semibold transition hover:-translate-y-0.5 hover:bg-accent"
        >
          <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.6 6.4 29 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.3-.3-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.6 6.4 29 4.5 24 4.5 16.4 4.5 9.8 8.8 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 43.5c5 0 9.5-1.9 12.9-5l-6-5.1c-2 1.5-4.4 2.4-6.9 2.4-5.3 0-9.7-3.1-11.3-7.5l-6.5 5C9.7 39.1 16.3 43.5 24 43.5z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.4 5.4l6 5.1c-.4.4 6.6-4.8 6.6-14.5 0-1.2-.1-2.3-.3-3.5z"/>
          </svg>
          Continue with Google
        </button>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have one? <Link to="/login" className="font-medium text-primary hover:underline">Sign in</Link>
        </p>
      </div>
    </AuthScene>
  );
}

function Field({ label, type = "text", value, onChange, required }: { label: string; type?: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword && show ? "text" : type;
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <div className="relative">
        <input type={inputType} value={value} onChange={(e) => onChange(e.target.value)} required={required}
          className={`w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none ring-ring focus:ring-2 ${isPassword ? "pr-10" : ""}`} />
        {isPassword && (
          <button type="button" onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground hover:text-foreground">
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
    </label>
  );
}

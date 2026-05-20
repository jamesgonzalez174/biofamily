import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthScene } from "@/components/AuthScene";

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
  const [password, setPassword] = useState("");
  const [pharmacyId, setPharmacyId] = useState("");
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // public-safe via RLS once authed, but for signup we need them visible.
    // Pharmacies are not sensitive, so we use a server-side fetched static list via supabase anon — RLS blocks anon.
    // Workaround: fetch after sign-up; here we just allow free-text fallback if list empty.
    supabase.from("pharmacies").select("id, name, address").eq("is_active", true).order("name")
      .then(({ data }) => setPharmacies((data ?? []) as Pharmacy[]));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return toast.error("Password must be at least 6 characters.");
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });
    if (error) { setLoading(false); return toast.error(error.message); }
    // Best-effort pharmacy attach (user is auto-signed-in when confirmations are off)
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
        <span className="text-lg font-semibold tracking-tight">Prizely</span>
      </Link>
      <div className="auth-glass auth-pop-sm rounded-2xl p-8">
        <h1 className="auth-pop text-2xl font-semibold tracking-tight">Create account</h1>
        <p className="mt-1 text-sm text-muted-foreground">Start earning points on every purchase.</p>
        <form onSubmit={submit} className="auth-pop-sm mt-6 space-y-4">
          <Field label="Full name" value={fullName} onChange={setFullName} />
          <Field label="Email" type="email" value={email} onChange={setEmail} required />
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
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have one? <Link to="/login" className="font-medium text-primary hover:underline">Sign in</Link>
        </p>
      </div>
    </AuthScene>
  );
}

function Field({ label, type = "text", value, onChange, required }: { label: string; type?: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required}
        className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none ring-ring focus:ring-2" />
    </label>
  );
}

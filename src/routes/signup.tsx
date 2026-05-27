import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sparkles, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthScene } from "@/components/AuthScene";
import { getAuthEmailRedirectUrl } from "@/lib/auth-email";


export const Route = createFileRoute("/signup")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) throw redirect({ to: "/dashboard" });
  },
  component: SignupPage,
});

type Pharmacy = { id: string; name: string; address: string | null };

function SignupPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [pharmacyId, setPharmacyId] = useState("");
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

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
        emailRedirectTo: getAuthEmailRedirectUrl(),
      },
    });
    if (error) { setLoading(false); return toast.error(error.message); }
    if (pharmacyId && data.user) {
      await supabase.from("profiles").update({ pharmacy_id: pharmacyId }).eq("id", data.user.id);
    }
    setLoading(false);
    setConfirmationSent(true);
    setPassword("");
    toast.success("Account created. Please confirm your email before signing in.");
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
        {confirmationSent && (
          <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
            We sent a confirmation link to <span className="font-medium text-foreground">{email}</span>. Verify your email, then sign in.
          </div>
        )}
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

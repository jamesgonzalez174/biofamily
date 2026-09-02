import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sparkles, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { AuthScene } from "@/components/AuthScene";
import { getAuthEmailRedirectUrl } from "@/lib/auth-email";
import { listPharmacyOptions } from "@/lib/pharmacy-directory.functions";


function safeNext(n: unknown): string | null {
  if (typeof n !== "string" || !n.startsWith("/") || n.startsWith("//")) return null;
  return n;
}

export const Route = createFileRoute("/signup")({
  validateSearch: (s: Record<string, unknown>): { next?: string } => {
    const next = typeof s.next === "string" ? s.next : undefined;
    return next ? { next } : {};
  },
  beforeLoad: async ({ search }) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const next = safeNext(search.next);
      if (next) throw redirect({ href: next });
      throw redirect({ to: "/dashboard" });
    }
  },
  head: () => ({
    meta: [
      { title: "Create account — Biomed Family" },
      { name: "description", content: "Create your Biomed Family member account, pick your pharmacy, and start earning points on every qualifying purchase." },
      { property: "og:title", content: "Create account — Biomed Family" },
      { property: "og:description", content: "Create your Biomed Family member account, pick your pharmacy, and start earning points on every qualifying purchase." },
      { property: "og:url", content: "https://myprizepoint.com/signup" },
      { name: "twitter:title", content: "Create account — Biomed Family" },
      { name: "twitter:description", content: "Create your Biomed Family member account, pick your pharmacy, and start earning points on every qualifying purchase." },
    ],
    links: [{ rel: "canonical", href: "https://myprizepoint.com/signup" }],
  }),
  component: SignupPage,
});

type Pharmacy = { id: string; name: string; address: string | null };

function SignupPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const nextSafe = safeNext(next);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [pharmacyId, setPharmacyId] = useState("");
  const [pharmacySearch, setPharmacySearch] = useState("");
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    listPharmacyOptions()
      .then((res) => setPharmacies((res?.pharmacies ?? []) as Pharmacy[]))
      .catch(() => setPharmacies([]));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return toast.error("Password must be at least 6 characters.");
    const phoneDigits = phone.replace(/\D/g, "");
    if (phoneDigits.length < 7) return toast.error("A valid phone number is required.");
    setLoading(true);

    const emailRedirect = nextSafe
      ? `${window.location.origin}${nextSafe}`
      : getAuthEmailRedirectUrl();
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: {
        data: { full_name: fullName, phone: phone.trim() },
        emailRedirectTo: emailRedirect,
      },
    });
    if (error) { setLoading(false); return toast.error(error.message); }
    if (pharmacyId && data.user) {
      await supabase.from("profiles").update({ pharmacy_id: pharmacyId }).eq("id", data.user.id);
    }
    setLoading(false);
    toast.success("Welcome! Your account is ready.");
    if (nextSafe) { window.location.href = nextSafe; return; }
    navigate({ to: "/dashboard" });
  };

  const signInWithApple = async () => {
    setLoading(true);
    const redirect_uri = nextSafe
      ? `${window.location.origin}/signup?next=${encodeURIComponent(nextSafe)}`
      : window.location.origin;
    const result = await lovable.auth.signInWithOAuth("apple", { redirect_uri });
    if (result.error) {
      setLoading(false);
      return toast.error(result.error.message);
    }
    if (result.redirected) return;
    if (nextSafe) { window.location.href = nextSafe; return; }
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
          <Field label="Phone number" type="tel" value={phone} onChange={setPhone} required pattern="[\d\s()+\-]{7,}" title="Enter at least 7 digits" placeholder="e.g. +1 809 555 0100" />
          <Field label="Password" type="password" value={password} onChange={setPassword} required />
          {pharmacies.length > 0 && (() => {
            const q = pharmacySearch.trim().toLowerCase();
            const filtered = q
              ? pharmacies.filter((p) => p.name.toLowerCase().includes(q) || (p.address ?? "").toLowerCase().includes(q))
              : pharmacies;
            return (
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Pharmacy</span>
                <input
                  type="text"
                  value={pharmacySearch}
                  onChange={(e) => setPharmacySearch(e.target.value)}
                  placeholder="Search pharmacies by name or address…"
                  className="mb-2 w-full rounded-lg border border-input bg-background/60 px-3 py-2.5 text-sm outline-none ring-ring focus:ring-2"
                />
                <select
                  value={pharmacyId}
                  onChange={(e) => setPharmacyId(e.target.value)}
                  size={Math.min(6, Math.max(3, filtered.length + 1))}
                  className="w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
                >
                  <option value="">Select your pharmacy (optional)</option>
                  {filtered.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}{p.address ? ` — ${p.address}` : ""}</option>
                  ))}
                  {filtered.length === 0 && <option value="" disabled>No matches</option>}
                </select>
                <span className="mt-1 block text-xs text-muted-foreground">You can change this later from your dashboard.</span>
              </label>
            );
          })()}
          <button disabled={loading} className="w-full rounded-xl bg-gradient-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-glow transition hover:opacity-95 hover:-translate-y-0.5 disabled:opacity-60">
            {loading ? "Creating…" : "Create account"}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          <span>OR</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <button
          type="button"
          onClick={signInWithApple}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-input bg-background py-2.5 text-sm font-medium transition hover:bg-accent disabled:opacity-60"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
            <path d="M17.05 20.28c-.98 1.67-2.16 3.23-3.87 3.25-1.04.02-1.37-.62-2.56-.62-1.18 0-1.55.6-2.53.63-1.92.07-3.38-1.95-4.36-3.62-2.37-3.83-2.09-9.37.94-12.04 1.46-1.27 3.24-1.92 4.97-1.92 1.07 0 2.35.7 3.09.7.74 0 2.1-.86 3.54-.73.6.03 2.3.24 3.39 1.84-.09.06-2 1.17-1.99 3.48.02 2.78 2.43 3.71 2.45 3.72-.02.1-.38 1.31-1.12 2.6zm-5.13-15.3c.74-.9 1.24-2.14 1.1-3.38-1.07.04-2.36.72-3.13 1.62-.68.78-1.28 2.04-1.12 3.32 1.19.09 2.41-.6 3.15-1.56z"/>
          </svg>
          Continue with Apple
        </button>

        <p className="mt-6 text-center text-sm text-muted-foreground">

          Already have one? <Link to="/login" search={nextSafe ? { next: nextSafe } : undefined} className="font-medium text-primary hover:underline">Sign in</Link>
        </p>
      </div>
    </AuthScene>
  );
}

function Field({ label, type = "text", value, onChange, required, pattern, title, placeholder }: { label: string; type?: string; value: string; onChange: (v: string) => void; required?: boolean; pattern?: string; title?: string; placeholder?: string }) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword && show ? "text" : type;
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <div className="relative">
        <input type={inputType} value={value} onChange={(e) => onChange(e.target.value)} required={required} pattern={pattern} title={title} placeholder={placeholder}
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


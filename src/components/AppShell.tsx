import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Sparkles, LayoutDashboard, Gift, History, ShieldCheck, LogOut, Menu, X, MapPin } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function AppShell({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);

  const nav = admin
    ? [
        { to: "/admin", label: "Overview", icon: LayoutDashboard },
        { to: "/admin/prizes", label: "Prizes", icon: Gift },
        { to: "/admin/fulfillment", label: "Fulfillment", icon: History },
        { to: "/admin/users", label: "Users", icon: ShieldCheck },
        { to: "/admin/pharmacies", label: "Pharmacies", icon: MapPin },
        { to: "/admin/skus", label: "SKU mapping", icon: Sparkles },
        { to: "/admin/settings", label: "Settings", icon: ShieldCheck },
      ]
    : [
        { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { to: "/catalog", label: "Prizes", icon: Gift },
        { to: "/history", label: "History", icon: History },
      ];

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link to={admin ? "/admin" : "/dashboard"} className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-primary shadow-glow">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold tracking-tight">Prizely{admin ? " · Admin" : ""}</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((n) => {
              const active = loc.pathname === n.to || (n.to !== "/admin" && loc.pathname.startsWith(n.to));
              return (
                <Link key={n.to} to={n.to} className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition ${active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                  <n.icon className="h-4 w-4" />{n.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            {isAdmin && !admin && (
              <Link to="/admin" className="hidden rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted md:inline-flex">Admin</Link>
            )}
            {admin && (
              <Link to="/dashboard" className="hidden rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted md:inline-flex">User view</Link>
            )}
            <button onClick={signOut} className="hidden items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground md:inline-flex">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
            <button onClick={() => setOpen(!open)} className="rounded-lg p-2 hover:bg-muted md:hidden">
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {open && (
          <div className="border-t border-border md:hidden">
            <nav className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-3">
              {nav.map((n) => (
                <Link key={n.to} to={n.to} onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted">
                  <n.icon className="h-4 w-4" />{n.label}
                </Link>
              ))}
              <button onClick={signOut} className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </nav>
          </div>
        )}
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 md:py-10">{children}</main>
    </div>
  );
}

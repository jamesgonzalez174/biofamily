import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Sparkles, LayoutDashboard, Gift, History, ShieldCheck, LogOut, Menu, X, MapPin, Eye } from "lucide-react";
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
        { to: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
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

  const isActive = (to: string, exact?: boolean) =>
    exact ? loc.pathname === to : loc.pathname === to || loc.pathname.startsWith(to + "/");

  const SidebarInner = () => (
    <div className="flex h-full flex-col bg-gradient-to-b from-primary/15 via-primary/5 to-primary-glow/10">
      <Link to={admin ? "/admin" : "/dashboard"} className="flex items-center gap-2 px-5 py-5">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-primary shadow-glow">
          <Sparkles className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="font-semibold tracking-tight leading-tight">
          Prizely{admin ? <span className="block text-xs font-normal text-muted-foreground">Admin</span> : ""}
        </span>
      </Link>

      <nav className="flex-1 space-y-1 px-3">
        {nav.map((n) => {
          const active = isActive(n.to, (n as any).exact);
          return (
            <Link
              key={n.to}
              to={n.to}
              onClick={() => setOpen(false)}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-gradient-primary text-primary-foreground shadow-glow"
                  : "text-foreground/70 hover:bg-white/60 hover:text-foreground"
              }`}
            >
              <n.icon className={`h-4 w-4 shrink-0 ${active ? "" : "text-primary"}`} />
              <span className="truncate">{n.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-primary/15 p-3">
        {isAdmin && !admin && (
          <Link to="/admin" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-white/60 hover:text-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" /> Admin
          </Link>
        )}
        {admin && (
          <Link to="/dashboard" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-foreground/70 hover:bg-white/60 hover:text-foreground">
            <Eye className="h-4 w-4 text-primary" /> User view
          </Link>
        )}
        <button onClick={signOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-foreground/70 hover:bg-destructive/10 hover:text-destructive">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </div>
  );


  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-border bg-card/50 backdrop-blur md:block">
        <SidebarInner />
      </aside>

      {/* Mobile header */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-background/80 px-4 py-3 backdrop-blur md:hidden">
        <Link to={admin ? "/admin" : "/dashboard"} className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-primary shadow-glow">
            <Sparkles className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold tracking-tight">Prizely{admin ? " · Admin" : ""}</span>
        </Link>
        <button onClick={() => setOpen(!open)} className="rounded-lg p-2 hover:bg-muted">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>

      {/* Mobile drawer */}
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setOpen(false)} />
          <aside className="fixed inset-y-0 left-0 z-50 w-64 border-r border-border bg-card md:hidden">
            <SidebarInner />
          </aside>
        </>
      )}

      <main className="px-4 py-6 md:ml-64 md:px-8 md:py-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}

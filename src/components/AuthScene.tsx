import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";

/** Immersive 3D backdrop + tilting glass card for auth screens. */
export function AuthScene({ children }: { children: ReactNode }) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty("--rx", `${(-y * 10).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${(x * 14).toFixed(2)}deg`);
      el.style.setProperty("--mx", `${(x * 20).toFixed(2)}px`);
      el.style.setProperty("--my", `${(y * 20).toFixed(2)}px`);
    };
    const onLeave = () => {
      el.style.setProperty("--rx", `0deg`);
      el.style.setProperty("--ry", `0deg`);
      el.style.setProperty("--mx", `0px`);
      el.style.setProperty("--my", `0px`);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return (
    <div className="auth-scene relative grid min-h-screen place-items-center overflow-hidden bg-background px-4">
      {/* ambient gradient orbs */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 -left-24 h-[28rem] w-[28rem] rounded-full bg-gradient-primary opacity-30 blur-3xl" />
        <div className="absolute -bottom-32 -right-24 h-[32rem] w-[32rem] rounded-full bg-primary/30 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,hsl(var(--background))_85%)]" />
      </div>

      {/* 3D floating shapes */}
      <div className="auth-stage pointer-events-none absolute inset-0 -z-10">
        <div className="shape shape-cube shape-a">
          <span /><span /><span /><span /><span /><span />
        </div>
        <div className="shape shape-cube shape-b">
          <span /><span /><span /><span /><span /><span />
        </div>
        <div className="shape shape-ring shape-c" />
        <div className="shape shape-ring shape-d" />
        <div className="shape shape-pyramid shape-e">
          <span /><span /><span /><span />
        </div>
      </div>

      <div className="auth-card-wrap relative">
        <div ref={cardRef} className="auth-card-3d w-full max-w-md">
          {children}
        </div>
      </div>

      <footer className="absolute bottom-4 left-0 right-0 z-10 flex justify-center px-4 text-center text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <span>© {new Date().getFullYear()} Biomed Family</span>
          <span aria-hidden>·</span>
          <Link to="/privacy-policy" className="hover:text-foreground hover:underline">Privacy Policy</Link>
        </div>
      </footer>
    </div>
  );
}

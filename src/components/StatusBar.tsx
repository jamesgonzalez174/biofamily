import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Status = {
  id: string;
  image_url: string;
  caption: string | null;
  created_at: string;
};

export function StatusBar() {
  const [open, setOpen] = useState(false);

  const { data: statuses } = useQuery({
    queryKey: ["statuses-active"],
    queryFn: async () => {
      const { data } = await supabase
        .from("statuses")
        .select("id, image_url, caption, created_at")
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: true });
      return (data ?? []) as Status[];
    },
    refetchInterval: 60_000,
  });

  if (!statuses || statuses.length === 0) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-3 pr-5 text-left shadow-soft transition hover:shadow-glow"
      >
        <div className="relative">
          <div className="rounded-full bg-gradient-to-tr from-primary via-primary-glow to-primary p-[2.5px]">
            <div className="rounded-full bg-card p-[2px]">
              <img
                src={statuses[0].image_url}
                alt="status"
                className="h-12 w-12 rounded-full object-cover"
              />
            </div>
          </div>
          {statuses.length > 1 && (
            <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground ring-2 ring-card">
              {statuses.length}
            </span>
          )}
        </div>
        <div>
          <div className="text-sm font-semibold">News & updates</div>
          <div className="text-xs text-muted-foreground">
            Tap to view {statuses.length === 1 ? "status" : `${statuses.length} statuses`}
          </div>
        </div>
      </button>

      {open && <StatusViewer items={statuses} onClose={() => setOpen(false)} />}
    </>
  );
}

function StatusViewer({ items, onClose }: { items: Status[]; onClose: () => void }) {
  const [idx, setIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const DURATION = 5000;

  useEffect(() => {
    setProgress(0);
    const start = Date.now();
    const t = setInterval(() => {
      const p = Math.min(100, ((Date.now() - start) / DURATION) * 100);
      setProgress(p);
      if (p >= 100) {
        clearInterval(t);
        if (idx < items.length - 1) setIdx(idx + 1);
        else onClose();
      }
    }, 50);
    return () => clearInterval(t);
  }, [idx, items.length, onClose]);

  const next = () => (idx < items.length - 1 ? setIdx(idx + 1) : onClose());
  const prev = () => idx > 0 && setIdx(idx - 1);

  const current = items[idx];

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black">
      {/* progress bars */}
      <div className="absolute left-0 right-0 top-0 z-10 flex gap-1 p-3">
        {items.map((_, i) => (
          <div key={i} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/30">
            <div
              className="h-full bg-white transition-[width] duration-75"
              style={{ width: `${i < idx ? 100 : i === idx ? progress : 0}%` }}
            />
          </div>
        ))}
      </div>

      <button
        onClick={onClose}
        className="absolute right-3 top-6 z-20 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>

      {/* tap zones */}
      <div className="absolute inset-0 z-[5] flex">
        <button onClick={prev} className="h-full w-1/3" aria-label="Previous" />
        <button onClick={next} className="h-full w-2/3" aria-label="Next" />
      </div>

      <div className="relative max-h-[100dvh] w-full max-w-md">
        <img
          src={current.image_url}
          alt={current.caption ?? "status"}
          className="mx-auto max-h-[100dvh] w-full object-contain"
        />
        {current.caption && (
          <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/80 to-transparent p-6 pt-16 text-center text-white">
            <p className="text-sm">{current.caption}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export const StatusUploadIcon = Plus;

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Ticket, ChevronDown, ChevronRight, Download } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { toCSV, downloadCSV } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/admin/ticket-audit")({
  head: () => ({
    meta: [
      { title: "Ticket audit — Admin" },
      { name: "description", content: "Trace credited raffle tickets back to Zoho invoices and members." },
      { property: "og:title", content: "Ticket audit — Admin" },
      { property: "og:description", content: "Trace credited raffle tickets back to Zoho invoices and members." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TicketAuditPage,
});

type Row = {
  invoiceId: string;
  number: string;
  zohoId: string;
  date: string | null;
  pharmacy: string;
  zohoTickets: number;
  credited: number;
  distributedAt: string | null;
  members: { name: string; email: string; tickets: number; backfill: boolean }[];
};

function TicketAuditPage() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ["ticket-audit"],
    queryFn: async (): Promise<Row[]> => {
      const { data: inv, error: e1 } = await supabase
        .from("invoices")
        .select("id, invoice_number, zoho_invoice_id, invoice_date, zoho_tickets, total_tickets, tickets_distributed_at, pharmacy:pharmacies(name)")
        .not("tickets_distributed_at", "is", null)
        .order("tickets_distributed_at", { ascending: false })
        .limit(1000);
      if (e1) throw e1;
      const ids = (inv ?? []).map((i) => i.id);
      const { data: led, error: e2 } = ids.length
        ? await supabase.from("ticket_ledger").select("invoice_id, user_id, tickets, is_backfill").in("invoice_id", ids)
        : { data: [], error: null };
      if (e2) throw e2;
      const uids = [...new Set((led ?? []).map((l) => l.user_id))];
      const { data: profs } = uids.length
        ? await supabase.from("profiles").select("id, full_name, email").in("id", uids)
        : { data: [] };
      const pm = new Map((profs ?? []).map((p) => [p.id, p]));
      return (inv ?? []).map((i) => ({
        invoiceId: i.id,
        number: i.invoice_number ?? "—",
        zohoId: i.zoho_invoice_id,
        date: i.invoice_date,
        pharmacy: (i.pharmacy as { name?: string } | null)?.name ?? "—",
        zohoTickets: i.zoho_tickets ?? 0,
        credited: i.total_tickets ?? 0,
        distributedAt: i.tickets_distributed_at,
        members: (led ?? [])
          .filter((l) => l.invoice_id === i.id)
          .map((l) => ({
            name: pm.get(l.user_id)?.full_name || "—",
            email: pm.get(l.user_id)?.email || l.user_id.slice(0, 8),
            tickets: l.tickets,
            backfill: l.is_backfill,
          })),
      }));
    },
  });

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return data ?? [];
    return (data ?? []).filter(
      (r) =>
        r.number.toLowerCase().includes(s) ||
        r.pharmacy.toLowerCase().includes(s) ||
        r.members.some((m) => m.name.toLowerCase().includes(s) || m.email.toLowerCase().includes(s)),
    );
  }, [data, q]);

  const totalCredited = rows.reduce((a, r) => a + r.credited, 0);

  const exportCsv = () => {
    const out = rows.flatMap((r) =>
      (r.members.length ? r.members : [{ name: "", email: "", tickets: 0, backfill: false }]).map((m) => ({
        invoice: r.number,
        zoho_invoice_id: r.zohoId,
        invoice_date: r.date ?? "",
        pharmacy: r.pharmacy,
        zoho_tickets: r.zohoTickets,
        credited_total: r.credited,
        member: m.name,
        email: m.email,
        member_tickets: m.tickets,
        reconstructed: m.backfill ? "yes" : "no",
        distributed_at: r.distributedAt ?? "",
      })),
    );
    downloadCSV(`ticket-audit-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(out));
  };

  return (
    <AppShell admin>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold"><Ticket className="h-6 w-6" /> Ticket audit</h1>
            <p className="text-sm text-muted-foreground">Every credited ticket total, its Zoho invoice, and the members who received it.</p>
          </div>
          <div className="flex gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search invoice, pharmacy, member…" className="h-9 w-64 rounded-md border border-input bg-background px-3 text-sm" />
            <button onClick={exportCsv} className="inline-flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm hover:bg-muted">
              <Download className="h-4 w-4" /> CSV
            </button>
          </div>
        </div>

        <div className="text-sm text-muted-foreground">{rows.length} invoices · {totalCredited} tickets credited</div>

        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="w-8 p-3"></th>
                <th className="p-3">Invoice</th>
                <th className="p-3">Pharmacy</th>
                <th className="p-3 text-right">Zoho tickets</th>
                <th className="p-3 text-right">Credited</th>
                <th className="p-3 text-right">Members</th>
                <th className="p-3">Distributed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const sum = r.members.reduce((a, m) => a + m.tickets, 0);
                const mismatch = r.members.length > 0 && sum !== r.credited;
                const isOpen = !!open[r.invoiceId];
                return (
                  <>
                    <tr key={r.invoiceId} className="cursor-pointer border-t border-border hover:bg-muted/30" onClick={() => setOpen((o) => ({ ...o, [r.invoiceId]: !isOpen }))}>
                      <td className="p-3">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                      <td className="p-3 font-medium">{r.number}<div className="text-xs text-muted-foreground">{r.date ?? ""} · Zoho {r.zohoId}</div></td>
                      <td className="p-3">{r.pharmacy}</td>
                      <td className="p-3 text-right">{r.zohoTickets}</td>
                      <td className="p-3 text-right font-semibold">{r.credited}{mismatch && <span className="ml-1 text-xs text-destructive">(Σ {sum})</span>}</td>
                      <td className="p-3 text-right">{r.members.length}</td>
                      <td className="p-3 text-xs text-muted-foreground">{r.distributedAt ? new Date(r.distributedAt).toLocaleString() : "—"}</td>
                    </tr>
                    {isOpen && (
                      <tr key={r.invoiceId + "-m"} className="bg-muted/20">
                        <td></td>
                        <td colSpan={6} className="p-3">
                          {r.members.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No member records for this invoice.</p>
                          ) : (
                            <ul className="space-y-1">
                              {r.members.map((m, i) => (
                                <li key={i} className="flex justify-between gap-4 text-xs">
                                  <span>{m.name} <span className="text-muted-foreground">{m.email}</span>{m.backfill && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-muted-foreground">reconstructed</span>}</span>
                                  <span className="font-medium">+{m.tickets}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}

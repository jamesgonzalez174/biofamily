import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Receipt, ChevronDown, ChevronUp, RefreshCw, ExternalLink } from "lucide-react";
import { getPharmacyInvoiceDetails, type InvoiceDetail } from "@/lib/invoices.functions";

function formatMoney(total: number | null, currency: string | null): string {
  if (total === null || Number.isNaN(total)) return "—";
  const cur = (currency ?? "").toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, {
      style: cur ? "currency" : "decimal",
      currency: cur || undefined,
      minimumFractionDigits: 2,
    }).format(total);
  } catch {
    return `${total.toFixed(2)}${cur ? " " + cur : ""}`;
  }
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function statusPill(status: string | null): { label: string; className: string } {
  const s = (status ?? "").toLowerCase();
  const label = status ? status.replace(/_/g, " ") : "unknown";
  if (s === "paid") return { label, className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" };
  if (s === "overdue") return { label, className: "bg-red-500/10 text-red-600 border-red-500/30" };
  if (s === "partially_paid" || s === "partiallypaid") return { label, className: "bg-amber-500/10 text-amber-600 border-amber-500/30" };
  if (s === "sent" || s === "viewed") return { label, className: "bg-blue-500/10 text-blue-600 border-blue-500/30" };
  if (s === "draft") return { label, className: "bg-muted text-muted-foreground border-border" };
  if (s === "void") return { label, className: "bg-muted text-muted-foreground line-through border-border" };
  return { label, className: "bg-muted text-muted-foreground border-border" };
}

export function InvoiceDetailsDrawer({
  pharmacyId,
  pharmacyName,
  references,
  defaultOpen = false,
  className = "",
}: {
  pharmacyId: string;
  pharmacyName?: string;
  references: string[];
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const fetchDetails = useServerFn(getPharmacyInvoiceDetails);
  const count = references.length;

  const { data, isFetching, refetch, error } = useQuery({
    queryKey: ["invoice-details", pharmacyId, count],
    enabled: open && count > 0,
    staleTime: 60_000,
    queryFn: () => fetchDetails({ data: { pharmacyId } }),
  });

  if (count === 0) return null;

  const invoices: InvoiceDetail[] = data?.invoices ?? [];
  // Sort newest first when we have dates
  const sorted = [...invoices].sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });

  const totalSum = sorted.reduce((acc, inv) => acc + (inv.total ?? 0), 0);
  const currency = sorted.find((i) => i.currencyCode)?.currencyCode ?? null;

  return (
    <div className={`rounded-xl border border-border bg-card shadow-soft ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Receipt className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {pharmacyName ? `${pharmacyName} — ` : ""}Invoice details
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
            {count}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {open && data?.ok && sorted.length > 0 && (
            <span className="hidden tabular-nums sm:inline">
              Total: {formatMoney(totalSum, currency)}
            </span>
          )}
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-border px-4 py-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {isFetching
                ? "Loading from Zoho…"
                : data?.ok
                  ? `Showing ${sorted.length} of ${count}`
                  : "Failed to load"}
            </span>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="inline-flex items-center gap-1 rounded-lg border border-input bg-background px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-600">
              {(error as Error)?.message ?? "Failed to load invoice details"}
            </p>
          )}
          {data && !data.ok && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-600">
              {data.error ?? "Zoho is not reachable"}
            </p>
          )}

          {isFetching && sorted.length === 0 && (
            <div className="space-y-2">
              {references.slice(0, Math.min(count, 4)).map((r) => (
                <div key={r} className="h-10 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          )}

          {sorted.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="hidden grid-cols-[minmax(0,1.2fr)_100px_110px_90px_100px] items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
                <div>Invoice #</div>
                <div>Date</div>
                <div className="text-right">Total</div>
                <div className="text-right">Points</div>
                <div className="text-right">Status</div>
              </div>
              <ul className="divide-y divide-border">
                {sorted.map((inv) => {
                  const pill = statusPill(inv.status);
                  return (
                    <li
                      key={inv.number + (inv.invoiceId ?? "")}
                      className="grid gap-1 px-3 py-2.5 text-sm sm:grid-cols-[minmax(0,1.2fr)_100px_110px_90px_100px] sm:items-center sm:gap-2"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-mono text-xs sm:text-sm">{inv.number}</span>
                        {inv.error && (
                          <span
                            title={inv.error}
                            className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-600"
                          >
                            {inv.error}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground sm:text-sm">
                        <span className="sm:hidden text-muted-foreground">Date: </span>
                        {formatDate(inv.date)}
                      </div>
                      <div className="text-xs tabular-nums sm:text-right sm:text-sm">
                        <span className="sm:hidden text-muted-foreground">Total: </span>
                        {formatMoney(inv.total, inv.currencyCode)}
                        {inv.balance !== null && inv.balance > 0 && inv.total !== null && inv.balance < inv.total && (
                          <div className="hidden text-[10px] uppercase tracking-wide text-muted-foreground sm:block">
                            {formatMoney(inv.balance, inv.currencyCode)} due
                          </div>
                        )}
                      </div>
                      <div className="text-xs tabular-nums sm:text-right sm:text-sm">
                        <span className="sm:hidden text-muted-foreground">Points: </span>
                        <span className="font-semibold text-primary">{inv.points.toLocaleString()}</span>
                        {inv.memberCount > 0 && inv.points > 0 && (
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {inv.pointsPerMember.toLocaleString()} × {inv.memberCount}
                          </div>
                        )}
                      </div>
                      <div className="sm:text-right">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${pill.className}`}
                        >
                          {pill.label}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {data?.ok && sorted.length === 0 && !isFetching && (
            <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              No matching invoices found in Zoho.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Re-export the icon for callers that want to render just a chip
export { ExternalLink };

import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Upload, FileText, CheckCircle2, XCircle, Play, Eye } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { bulkImportPoints } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin/import")({
  component: ImportPage,
});

type ParsedRow = { identifier: string; delta: number; reason: string };
type ResultRow = { row: number; identifier: string; ok: boolean; message: string; delta?: number; newBalance?: number };

function parseCSV(text: string): { rows: ParsedRow[]; errors: string[] } {
  const errors: string[] = [];
  const rows: ParsedRow[] = [];
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { rows, errors: ["Empty file"] };
  const first = lines[0].toLowerCase();
  const hasHeader = first.includes("identifier") || first.includes("email") || first.includes("user");
  const start = hasHeader ? 1 : 0;
  for (let i = start; i < lines.length; i++) {
    const raw = lines[i];
    // simple CSV split (no quoted commas)
    const parts = raw.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
    if (parts.length < 3) {
      errors.push(`Line ${i + 1}: expected 3 columns, got ${parts.length}`);
      continue;
    }
    const [identifier, deltaStr, ...reasonParts] = parts;
    const delta = Number(deltaStr);
    if (!identifier || !Number.isFinite(delta) || !Number.isInteger(delta)) {
      errors.push(`Line ${i + 1}: invalid identifier or delta`);
      continue;
    }
    const reason = reasonParts.join(",").trim() || "Bulk import";
    rows.push({ identifier, delta, reason });
  }
  return { rows, errors };
}

function ImportPage() {
  const importFn = useServerFn(bulkImportPoints);
  const [csvText, setCsvText] = useState("");
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [results, setResults] = useState<ResultRow[] | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [dryRun, setDryRun] = useState(true);

  const onFile = async (file: File) => {
    const text = await file.text();
    setCsvText(text);
    const { rows, errors } = parseCSV(text);
    setParsed(rows);
    setParseErrors(errors);
    setResults(null);
    setStats(null);
  };

  const onTextChange = (text: string) => {
    setCsvText(text);
    const { rows, errors } = parseCSV(text);
    setParsed(rows);
    setParseErrors(errors);
    setResults(null);
    setStats(null);
  };

  const run = async (isDry: boolean) => {
    if (!parsed.length) return;
    setBusy(true);
    setDryRun(isDry);
    try {
      const res: any = await importFn({ data: { rows: parsed, dryRun: isDry } });
      setResults(res.results);
      setStats(res.stats);
      toast[res.stats.failed > 0 ? "warning" : "success"](
        isDry
          ? `Preview: ${res.stats.succeeded} would apply, ${res.stats.failed} would fail`
          : `Imported: ${res.stats.succeeded} succeeded, ${res.stats.failed} failed`,
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const loadSample = () => {
    onTextChange(
      "identifier,delta,reason\njane@example.com,100,Q3 bonus\njohn@example.com,50,Referral reward\n",
    );
  };

  return (
    <AppShell admin>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2">
          <Upload className="h-6 w-6 text-primary" /> Bulk points import
        </h1>
        <p className="text-sm text-muted-foreground">
          CSV columns: <code className="rounded bg-muted px-1">identifier</code> (email or user id),{" "}
          <code className="rounded bg-muted px-1">delta</code> (integer, negative deducts),{" "}
          <code className="rounded bg-muted px-1">reason</code>. Header row optional. Max 2000 rows.
        </p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <label className="text-sm font-medium">Upload CSV</label>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            className="mt-2 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:opacity-90"
          />
          <button onClick={loadSample} className="mt-3 text-xs text-primary hover:underline">
            Load sample data
          </button>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <label className="text-sm font-medium flex items-center gap-2">
            <FileText className="h-4 w-4" /> Or paste CSV
          </label>
          <textarea
            value={csvText}
            onChange={(e) => onTextChange(e.target.value)}
            rows={6}
            placeholder="identifier,delta,reason&#10;jane@example.com,100,Q3 bonus"
            className="mt-2 w-full rounded-xl border border-border bg-background p-2 font-mono text-xs"
          />
        </div>
      </div>

      {parseErrors.length > 0 && (
        <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <div className="font-semibold">Parse errors ({parseErrors.length})</div>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {parseErrors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {parsed.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
          <div className="text-sm">
            <span className="font-semibold">{parsed.length}</span> valid row{parsed.length === 1 ? "" : "s"} ready.{" "}
            Net delta:{" "}
            <span className="tabular-nums font-semibold">
              {parsed.reduce((a, r) => a + r.delta, 0).toLocaleString()}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => run(true)}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
            >
              <Eye className="h-4 w-4" /> Preview (dry run)
            </button>
            <button
              onClick={() => {
                if (!confirm(`Apply ${parsed.length} points changes? This cannot be undone.`)) return;
                run(false);
              }}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-50"
            >
              <Play className="h-4 w-4" /> {busy ? "Working…" : "Apply import"}
            </button>
          </div>
        </div>
      )}

      {stats && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">
              {dryRun ? "Preview results" : "Import results"}
            </h2>
            <div className="text-xs text-muted-foreground tabular-nums">
              {stats.succeeded} ok · {stats.failed} failed · net {stats.netDelta.toLocaleString()}
            </div>
          </div>
          <div className="max-h-96 overflow-auto rounded-xl border border-border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/70 text-left uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Identifier</th>
                  <th className="px-3 py-2">Delta</th>
                  <th className="px-3 py-2">New balance</th>
                  <th className="px-3 py-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {results?.map((r) => (
                  <tr key={r.row} className="border-t border-border/60">
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">{r.row}</td>
                    <td className="px-3 py-2">{r.identifier}</td>
                    <td className="px-3 py-2 tabular-nums">{r.delta ?? "—"}</td>
                    <td className="px-3 py-2 tabular-nums">{r.newBalance ?? "—"}</td>
                    <td className="px-3 py-2">
                      {r.ok ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" /> {r.message}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-destructive">
                          <XCircle className="h-3 w-3" /> {r.message}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AppShell>
  );
}

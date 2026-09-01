import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type TicketHolder = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  tickets?: number | null;
  pharmacy_name?: string | null;
};

const BRAND = "BIOMED FAMILY";
// Christmas palette: pine green, holly red, warm gold
const PURPLE: [number, number, number] = [178, 34, 34];
const DEEP: [number, number, number] = [20, 83, 45];
const GOLD: [number, number, number] = [201, 162, 39];
const INK: [number, number, number] = [20, 30, 24];
const MUTED: [number, number, number] = [107, 114, 128];

function splitName(full?: string | null) {
  const parts = String(full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "Member", last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function serial(userId: string, index: number) {
  const short = userId.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `BF-${short}-${String(index).padStart(4, "0")}`;
}

/**
 * Renders one professional ticket card.
 * Layout: gold-edged purple stub on the left with the ticket number,
 * holder first/last name in the middle, serial + raffle info on the right.
 */
function drawTicket(
  doc: jsPDF,
  opts: {
    x: number;
    y: number;
    w: number;
    h: number;
    first: string;
    last: string;
    serialCode: string;
    ticketNo: number;
    ticketTotal: number;
    pharmacy?: string | null;
    raffleDate: string;
  },
) {
  const { x, y, w, h } = opts;
  const stubW = 96;

  // card
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...PURPLE);
  doc.setLineWidth(1);
  doc.roundedRect(x, y, w, h, 8, 8, "FD");

  // stub
  doc.setFillColor(...DEEP);
  doc.roundedRect(x, y, stubW, h, 8, 8, "F");
  doc.setFillColor(...DEEP);
  doc.rect(x + stubW - 10, y, 10, h, "F");

  // perforation
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.8);
  doc.setLineDashPattern([2, 3], 0);
  doc.line(x + stubW, y + 8, x + stubW, y + h - 8);
  doc.setLineDashPattern([], 0);

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("TICKET", x + stubW / 2, y + 24, { align: "center" });
  doc.setFontSize(24);
  doc.text(String(opts.ticketNo), x + stubW / 2, y + 50, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(`of ${opts.ticketTotal}`, x + stubW / 2, y + 64, { align: "center" });

  // body
  const bx = x + stubW + 16;
  doc.setTextColor(...PURPLE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(`${BRAND}  ·  CHRISTMAS RAFFLE`, bx, y + 20);

  doc.setTextColor(...INK);
  doc.setFontSize(15);
  const nameW = w - stubW - 150;
  const first = doc.splitTextToSize(opts.first.toUpperCase(), nameW)[0];
  const last = doc.splitTextToSize((opts.last || "—").toUpperCase(), nameW)[0];
  doc.text(first, bx, y + 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(last, bx, y + 58);

  doc.setTextColor(...MUTED);
  doc.setFontSize(8);
  doc.text(opts.pharmacy ? `Pharmacy: ${opts.pharmacy}` : "Pharmacy: —", bx, y + 74);

  // right rail
  const rx = x + w - 16;
  doc.setTextColor(...GOLD);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("DRAW DATE", rx, y + 20, { align: "right" });
  doc.setTextColor(...INK);
  doc.setFontSize(11);
  doc.text(opts.raffleDate, rx, y + 34, { align: "right" });

  doc.setFont("courier", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...DEEP);
  doc.text(opts.serialCode, rx, y + 58, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text("Serial · non-transferable", rx, y + 72, { align: "right" });
}

export async function downloadTicketsPdf(
  holders: TicketHolder[],
  opts: { raffleDate?: string; filename?: string } = {},
) {
  const raffleDate = opts.raffleDate ?? "December 18";
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 36;
  const generated = new Date().toLocaleString();

  const rows = holders
    .map((h) => ({ ...h, count: Math.max(0, Math.floor(Number(h.tickets ?? 0))) }))
    .filter((h) => h.count > 0)
    .sort((a, b) => b.count - a.count || String(a.full_name ?? "").localeCompare(String(b.full_name ?? "")));

  const totalTickets = rows.reduce((s, r) => s + r.count, 0);

  // ---- Cover / summary ----
  doc.setFillColor(...DEEP);
  doc.rect(0, 0, pageW, 120, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("Raffle Tickets", margin, 58);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`${BRAND} · Christmas raffle draw ${raffleDate}`, margin, 78);
  doc.setFontSize(9);
  doc.text(`Generated ${generated}`, margin, 96);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...GOLD);
  doc.text(`${totalTickets} tickets · ${rows.length} holders`, pageW - margin, 96, { align: "right" });

  autoTable(doc, {
    startY: 150,
    head: [["Holder", "Email", "Pharmacy", "Tickets"]],
    body: rows.map((r) => [
      r.full_name ?? "—",
      r.email ?? "—",
      r.pharmacy_name ?? "—",
      String(r.count),
    ]),
    styles: { fontSize: 9, cellPadding: 5, textColor: INK },
    headStyles: { fillColor: PURPLE, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 243, 255] },
    columnStyles: { 3: { halign: "right", cellWidth: 60 } },
    margin: { left: margin, right: margin },
  });

  // ---- Ticket sheets ----
  const cardW = pageW - margin * 2;
  const cardH = 92;
  const gap = 14;
  const headerH = 46;
  const perPage = Math.floor((pageH - margin * 2 - headerH + gap) / (cardH + gap));

  let slot = perPage; // force a new page on first ticket
  let pageHolder = "";

  const newSheet = (holderLabel: string) => {
    doc.addPage();
    doc.setFillColor(...DEEP);
    doc.rect(0, 0, pageW, 34, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`${BRAND} · RAFFLE TICKETS`, margin, 22);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(holderLabel, pageW - margin, 22, { align: "right" });
    slot = 0;
  };

  for (const r of rows) {
    const { first, last } = splitName(r.full_name);
    const label = `${first} ${last}`.trim();
    pageHolder = label;
    // each holder starts on a fresh sheet
    newSheet(label);
    for (let i = 1; i <= r.count; i++) {
      if (slot >= perPage) newSheet(pageHolder);
      const y = margin + headerH + slot * (cardH + gap);
      drawTicket(doc, {
        x: margin,
        y,
        w: cardW,
        h: cardH,
        first,
        last,
        serialCode: serial(r.id, i),
        ticketNo: i,
        ticketTotal: r.count,
        pharmacy: r.pharmacy_name ?? null,
        raffleDate,
      });
      slot++;
    }
  }

  // footer page numbers
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`Page ${p} of ${pages}`, pageW / 2, pageH - 18, { align: "center" });
  }

  doc.save(opts.filename ?? "raffle-tickets.pdf");
}

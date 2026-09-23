import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type FulfillmentPdfRow = {
  created_at: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  prize_name: string;
  points_spent: number;
  status: string;
  shipping_address: string;
  contact_phone: string;
  tracking_info: string;
};

const PRIMARY: [number, number, number] = [30, 64, 175];
const MUTED: [number, number, number] = [100, 116, 139];

export function downloadFulfillmentPdf(
  rows: FulfillmentPdfRow[],
  filename = "fulfillment.pdf",
) {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });

  doc.setFontSize(18);
  doc.text("Fulfillment", 40, 46);
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(
    `${rows.length} redemption${rows.length === 1 ? "" : "s"} · ${new Date().toLocaleDateString()}`,
    40,
    62,
  );
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 80,
    head: [["Date", "Customer", "Email", "Phone", "Prize", "Pts", "Status", "Ship to", "Contact", "Tracking"]],
    body: rows.map((r) => [
      new Date(r.created_at).toLocaleDateString(),
      r.customer_name || "—",
      r.customer_email || "—",
      r.customer_phone || "—",
      r.prize_name,
      String(r.points_spent),
      r.status,
      r.shipping_address || "—",
      r.contact_phone || "—",
      r.tracking_info || "—",
    ]),
    styles: { fontSize: 7.5, cellPadding: 4, valign: "top", overflow: "linebreak" },
    headStyles: { fillColor: PRIMARY, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [239, 246, 255] },
    columnStyles: {
      0: { cellWidth: 62 },
      3: { cellWidth: 70 },
      5: { cellWidth: 34, halign: "right" },
      6: { cellWidth: 52 },
      7: { cellWidth: 130 },
      8: { cellWidth: 70 },
      9: { cellWidth: 90 },
    },
    margin: { left: 36, right: 36 },
  });

  doc.save(filename);
}

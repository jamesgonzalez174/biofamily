import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export type ProductPdfRow = {
  sku: string;
  name?: string | null;
  points_per_unit: number;
  image_url?: string | null;
};

async function loadImage(url: string): Promise<{ data: string; format: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const format = blob.type.includes("png") ? "PNG" : blob.type.includes("webp") ? "WEBP" : "JPEG";
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return { data, format };
  } catch {
    return null;
  }
}

export async function downloadProductsPdf(rows: ProductPdfRow[], filename = "products-with-points.pdf") {
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const images = new Map<number, { data: string; format: string }>();
  await Promise.all(
    rows.map(async (r, i) => {
      if (!r.image_url) return;
      const img = await loadImage(r.image_url);
      if (img) images.set(i, img);
    }),
  );

  doc.setFontSize(18);
  doc.text("Products with points", 40, 46);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(
    `${rows.length} product${rows.length === 1 ? "" : "s"} · ${new Date().toLocaleDateString()}`,
    40,
    62,
  );
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 80,
    head: [["", "SKU", "Product", "Points / unit"]],
    body: rows.map((r) => ["", r.sku, r.name || "—", r.points_per_unit.toLocaleString()]),
    styles: { fontSize: 9, cellPadding: 6, valign: "middle" },
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [246, 246, 250] },
    columnStyles: {
      0: { cellWidth: 44, minCellHeight: 44 },
      1: { cellWidth: 110 },
      3: { cellWidth: 80, halign: "right" },
    },
    didDrawCell: (data) => {
      if (data.section !== "body" || data.column.index !== 0) return;
      const img = images.get(data.row.index);
      if (!img) return;
      const size = 32;
      const x = data.cell.x + (data.cell.width - size) / 2;
      const y = data.cell.y + (data.cell.height - size) / 2;
      try {
        doc.addImage(img.data, img.format, x, y, size, size);
      } catch {}
    },
  });

  doc.save(filename);
}

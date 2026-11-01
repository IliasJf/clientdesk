import type { Invoice, Payment } from "./desk-types";
import { invoiceTotals, lineTotal, dateLabel } from "./desk-domain.ts";

export async function createInvoicePdf(
  invoice: Invoice,
  payments: Payment[] = [],
) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: false });
  const left = 20,
    right = 190;
  let y = 22;
  const amount = (n: number) =>
    `${invoice.currency} ${(n / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = (
    s: string,
    x: number,
    yy: number,
    size = 10,
    bold = false,
    align: "left" | "right" = "left",
  ) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(28, 32, 38);
    doc.text(s, x, yy, { align });
  };
  const ensure = (height: number) => {
    if (y + height > 268) {
      doc.addPage();
      y = 23;
      text(invoice.number + " / continued", left, y, 10, true);
      y += 12;
    }
  };
  const paragraph = (s: string, x: number, maxWidth: number, size = 10) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(s, maxWidth) as string[];
    for (const line of lines) {
      ensure(6);
      text(line, x, y, size);
      y += 5;
    }
    return lines.length * 5;
  };
  text(invoice.seller.name, left, y, 18, true);
  text(
    invoice.stage === "draft"
      ? "DRAFT INVOICE"
      : invoice.stage === "void"
        ? "VOID INVOICE"
        : "INVOICE",
    right,
    y,
    13,
    true,
    "right",
  );
  y += 9;
  text(invoice.seller.email, left, y, 10);
  text(invoice.number, right, y, 11, true, "right");
  y += 9;
  if (invoice.seller.address) paragraph(invoice.seller.address, left, 100, 9);
  y = Math.max(y, 62);
  text("Bill to", left, y, 9);
  text("Invoice date", 132, y, 9);
  text("Due date", 165, y, 9);
  y += 7;
  text(invoice.billTo.company || invoice.billTo.name, left, y, 12, true);
  text(dateLabel(invoice.date), 132, y, 9);
  text(dateLabel(invoice.dueDate), 165, y, 9);
  y += 6;
  text(invoice.billTo.name, left, y, 10);
  y += 6;
  text(invoice.billTo.email, left, y, 9);
  y += 6;
  if (invoice.billTo.address) paragraph(invoice.billTo.address, left, 105, 9);
  y += 10;
  const headings = () => {
    ensure(16);
    doc.setDrawColor(220, 223, 227);
    doc.line(left, y, right, y);
    y += 7;
    text("Description", left, y, 9, true);
    text("Qty", 128, y, 9, true, "right");
    text("Rate", 156, y, 9, true, "right");
    text("Amount", right, y, 9, true, "right");
    y += 5;
    doc.line(left, y, right, y);
    y += 7;
  };
  headings();
  for (const line of invoice.items) {
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(line.description, 90) as string[];
    let index = 0;
    while (index < lines.length) {
      const remaining = 268 - y;
      let count = Math.max(0, Math.floor((remaining - 8) / 5));
      if (!count) {
        doc.addPage();
        y = 23;
        text(invoice.number + " / continued", left, y, 10, true);
        y += 12;
        headings();
        count = Math.floor((268 - y - 8) / 5);
      }
      const chunk = lines.slice(index, index + count);
      for (let j = 0; j < chunk.length; j++) text(chunk[j], left, y + j * 5);
      if (index === 0) {
        text((line.quantity / 100).toFixed(2), 128, y, 9, false, "right");
        text(amount(line.rate), 156, y, 9, false, "right");
        text(amount(lineTotal(line)), right, y, 9, false, "right");
      }
      index += chunk.length;
      y += chunk.length * 5 + 5;
    }
  }
  const totals = invoiceTotals(invoice, payments);
  ensure(62);
  y += 5;
  const totalRow = (label: string, n: number, bold = false) => {
    text(label, 125, y, 10, bold);
    text(amount(n), right, y, 10, bold, "right");
    y += 7;
  };
  totalRow("Subtotal", totals.subtotal);
  if (totals.discount) totalRow("Discount", -totals.discount);
  if (invoice.taxBps)
    totalRow(`Tax (${(invoice.taxBps / 100).toFixed(2)}%)`, totals.tax);
  totalRow("Invoice total", totals.total, true);
  if (totals.paid) totalRow("Payments recorded", -totals.paid);
  totalRow("Balance due", invoice.stage === "void" ? 0 : totals.balance, true);
  y += 10;
  if (invoice.notes) {
    ensure(15);
    text("Notes", left, y, 10, true);
    y += 7;
    paragraph(invoice.notes, left, 170, 9);
    y += 7;
  }
  if (invoice.seller.instructions) {
    ensure(15);
    text("Payment instructions", left, y, 10, true);
    y += 7;
    paragraph(invoice.seller.instructions, left, 170, 9);
  }
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setDrawColor(225, 228, 232);
    doc.line(left, 281, right, 281);
    text("Created with ClientDesk", left, 288, 8);
    text(
      `${invoice.number} / ${page} of ${pages}`,
      right,
      288,
      8,
      false,
      "right",
    );
  }
  doc.setProperties({
    title: invoice.number + " — " + invoice.billTo.company,
    subject: "Invoice",
    author: invoice.seller.name,
    creator: "ClientDesk",
  });
  return doc;
}
export async function downloadInvoicePdf(
  invoice: Invoice,
  payments: Payment[],
) {
  const doc = await createInvoicePdf(invoice, payments);
  doc.save(invoice.number.replace(/[^a-zA-Z0-9_-]/g, "-") + ".pdf");
}

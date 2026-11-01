import test from "node:test";
import assert from "node:assert/strict";
import { createDemo } from "../lib/desk-domain.ts";
import { createInvoicePdf } from "../lib/invoice-pdf.ts";
test("invoice PDF is a real document with matching totals and multiple pages for long invoices", async () => {
  const w = createDemo("2026-10-29"),
    invoice = w.invoices[1];
  const pdf = await createInvoicePdf(invoice, w.payments),
    text = pdf.output();
  assert.ok(text.startsWith("%PDF-"));
  assert.ok(text.includes("INV-2026-002"));
  assert.ok(text.includes("USD 1,400.00"));
  assert.ok(text.includes("Lumen Coffee"));
  assert.equal(pdf.getNumberOfPages(), 1);
  const long = {
    ...invoice,
    items: Array.from({ length: 70 }, (_, n) => ({
      ...invoice.items[0],
      id: "long" + n,
      description: "Detailed design work, review and implementation. ".repeat(
        5,
      ),
      rate: 12345,
    })),
  };
  const document = await createInvoicePdf(long, []);
  assert.ok(document.getNumberOfPages() > 2);
  assert.ok(document.output().includes("Payment instructions"));
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  applyCommand,
  createDemo,
  decimalUnits,
  invoiceStatus,
  invoiceTotals,
  projectProgress,
  validateCommand,
} from "../lib/desk-domain.ts";
const day = "2026-10-29";
const command = (type, payload, expectedRevision = 0) => ({
  type,
  payload,
  expectedRevision,
});
test("decimal inputs and line rounding preserve cents, then discount precedes tax", () => {
  assert.equal(decimalUnits("12.05"), 1205);
  assert.equal(decimalUnits("0.1"), 10);
  assert.throws(() => decimalUnits("1.005"));
  const i = {
    id: "t",
    items: [
      { quantity: 150, rate: 199 },
      { quantity: 100, rate: 500 },
    ],
    discount: 99,
    taxBps: 850,
  };
  assert.deepEqual(invoiceTotals(i, [{ invoiceId: "t", amount: 200 }]), {
    subtotal: 799,
    discount: 99,
    tax: 60,
    total: 760,
    paid: 200,
    balance: 560,
  });
});
test("sample invoice totals reconcile and currencies stay attached to each invoice", () => {
  const w = createDemo(day);
  const issued = w.invoices.filter((i) => i.stage === "issued");
  assert.equal(
    issued.reduce((s, i) => s + invoiceTotals(i, w.payments).total, 0),
    700000,
  );
  assert.equal(
    issued.reduce((s, i) => s + invoiceTotals(i, w.payments).balance, 0),
    460000,
  );
  assert.equal(
    w.payments.reduce((s, p) => s + p.amount, 0),
    240000,
  );
  assert.equal(projectProgress(w.projects[0]), 60);
  assert.equal(
    issued.every((i) => i.currency === "USD"),
    true,
  );
});
test("invoice state derives from issue stage, due dates and payment balance", () => {
  const w = createDemo(day),
    i = w.invoices[0];
  assert.equal(invoiceStatus(i, [], day), "Overdue");
  assert.equal(invoiceStatus({ ...i, dueDate: day }, [], day), "Issued");
  assert.equal(
    invoiceStatus(
      { ...i, dueDate: "2026-11-01" },
      [{ invoiceId: i.id, amount: 1 }],
      day,
    ),
    "Partial",
  );
  assert.equal(
    invoiceStatus(i, [{ invoiceId: i.id, amount: 320000 }], day),
    "Paid",
  );
  assert.equal(invoiceStatus({ ...i, stage: "draft" }, [], day), "Draft");
  assert.equal(invoiceStatus({ ...i, stage: "void" }, [], day), "Void");
});
test("client references and snapshots preserve issued invoices when clients change", () => {
  const source = createDemo(day),
    client = source.clients[0];
  const w = applyCommand(
    source,
    command("client.update", {
      ...client,
      name: "Updated client",
      email: "updated@example.com",
    }),
    day,
  );
  assert.equal(w.clients[0].name, "Updated client");
  assert.equal(w.invoices[0].billTo.name, "Maya Chen");
  assert.equal(source.clients[0].name, "Maya Chen");
  assert.throws(
    () => applyCommand(source, command("client.delete", { id: "c1" }), day),
    /preserve/,
  );
  assert.throws(
    () =>
      applyCommand(
        source,
        command("project.create", { clientId: "other" }),
        day,
      ),
    /existing client/,
  );
  assert.throws(
    () =>
      applyCommand(
        source,
        command("project.update", { ...source.projects[0], clientId: "c2" }),
        day,
      ),
    /another client/,
  );
});
test("drafts validate client and project ownership, dates, totals and currency", () => {
  const w = createDemo(day),
    draft = w.invoices[3];
  const payload = {
    ...draft,
    items: [{ description: "Service", quantity: 100, rate: 2000 }],
  };
  const result = applyCommand(w, command("invoice.create", payload), day);
  assert.equal(result.invoices.at(-1).number, "INV-2026-005");
  assert.throws(
    () =>
      applyCommand(
        w,
        command("invoice.create", { ...payload, projectId: "p1" }),
        day,
      ),
    /belonging/,
  );
  assert.throws(
    () =>
      applyCommand(
        w,
        command("invoice.create", { ...payload, discount: 2001 }),
        day,
      ),
    /discount/,
  );
  assert.throws(
    () =>
      applyCommand(
        w,
        command("invoice.create", { ...payload, dueDate: "2026-02-30" }),
        day,
      ),
    /valid date/,
  );
  assert.throws(
    () =>
      applyCommand(
        w,
        command("invoice.create", { ...payload, currency: "BTC" }),
        day,
      ),
    /USD/,
  );
  assert.throws(
    () =>
      applyCommand(
        w,
        command("invoice.create", { ...payload, items: [] }),
        day,
      ),
    /invoice lines/,
  );
});
test("issued and paid records cannot be silently edited or voided", () => {
  const w = createDemo(day);
  assert.throws(
    () => applyCommand(w, command("invoice.update", w.invoices[0]), day),
    /cannot be edited/,
  );
  assert.throws(
    () => applyCommand(w, command("invoice.void", { id: "i3" }), day),
    /recorded payments/,
  );
  const issued = applyCommand(w, command("invoice.issue", { id: "i4" }), day);
  assert.equal(issued.invoices[3].stage, "issued");
  assert.equal(w.invoices[3].stage, "draft");
});
test("issuing a draft records the current seller and client details", () => {
  const source = createDemo(day);
  const renamed = applyCommand(
    applyCommand(
      source,
      command("business.save", { ...source.business, name: "Morgan Studio" }),
      day,
    ),
    command("client.update", { ...source.clients[3], name: "Noah K." }),
    day,
  );
  const issued = applyCommand(
    renamed,
    command("invoice.issue", { id: "i4" }),
    day,
  );
  assert.equal(issued.invoices[3].seller.name, "Morgan Studio");
  assert.equal(issued.invoices[3].billTo.name, "Noah K.");
  assert.equal(renamed.invoices[3].seller.name, "Morgan Creative");
});
test("payments reject overpayment, invalid dates, and drafts", () => {
  const w = createDemo(day),
    payload = {
      invoiceId: "i1",
      amount: 10000,
      date: day,
      method: "Bank transfer",
      note: "",
      requestId: "payment-one",
    };
  assert.throws(
    () =>
      applyCommand(
        w,
        command("payment.record", { ...payload, amount: 320001 }),
        day,
      ),
    /exceeds/,
  );
  assert.throws(
    () =>
      applyCommand(
        w,
        command("payment.record", { ...payload, date: "2026-11-01" }),
        day,
      ),
    /future/,
  );
  assert.throws(
    () =>
      applyCommand(
        w,
        command("payment.record", { ...payload, invoiceId: "i4" }),
        day,
      ),
    /issued invoices/,
  );
  const next = applyCommand(w, command("payment.record", payload), day);
  assert.equal(invoiceTotals(next.invoices[0], next.payments).balance, 310000);
});
test("payment request IDs prevent duplicate recording even after a stale retry", () => {
  const w = createDemo(day),
    payload = {
      invoiceId: "i1",
      amount: 10000,
      date: day,
      method: "Bank transfer",
      note: "",
      requestId: "stable-request",
    };
  const next = applyCommand(w, command("payment.record", payload), day);
  next.revision = 1;
  assert.strictEqual(
    applyCommand(next, command("payment.record", payload, 0), day),
    next,
  );
  assert.throws(
    () =>
      applyCommand(
        next,
        command("payment.record", { ...payload, amount: 20000 }, 0),
        day,
      ),
    (e) => e.status === 409,
  );
});
test("stale edits and unknown or owner-selecting request fields are rejected", () => {
  const w = createDemo(day);
  w.revision = 2;
  assert.throws(
    () =>
      applyCommand(
        w,
        command("task.toggle", { projectId: "p1", id: "p1-t0", done: false }),
        day,
      ),
    (e) => e.status === 409,
  );
  assert.throws(
    () =>
      validateCommand({
        ...command("client.create", {}),
        ownerId: "someone-else",
      }),
    /Unexpected/,
  );
  assert.throws(
    () => applyCommand(createDemo(day), command("unknown", {}), day),
    /Unknown action/,
  );
});

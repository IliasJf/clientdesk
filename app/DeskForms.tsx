"use client";
import { useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type {
  Business,
  Client,
  Invoice,
  Project,
  Workspace,
} from "../lib/desk-types";
import {
  decimalUnits,
  invoiceTotals,
  money,
  shiftDay,
  today,
} from "../lib/desk-domain";

export type Execute = (
  type: string,
  payload: Record<string, unknown>,
) => Promise<Workspace | null>;
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function ClientForm({
  client,
  execute,
  busy,
  onDone,
}: {
  client?: Client;
  execute: Execute;
  busy: boolean;
  onDone: (w: Workspace) => void;
}) {
  const [form, setForm] = useState({
    name: client?.name || "",
    company: client?.company || "",
    email: client?.email || "",
    address: client?.address || "",
  });
  const change = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const w = await execute(client ? "client.update" : "client.create", {
          ...form,
          ...(client ? { id: client.id } : {}),
        });
        if (w) onDone(w);
      }}
      className="editor-form"
    >
      <p className="form-intro">
        Keep the details you need for thoughtful work and accurate invoices.
      </p>
      <Field label="Contact name">
        <input
          required
          maxLength={120}
          autoComplete="name"
          value={form.name}
          onChange={(e) => change("name", e.target.value)}
          placeholder="For example, Maya Chen"
        />
      </Field>
      <Field label="Company or studio">
        <input
          maxLength={120}
          value={form.company}
          onChange={(e) => change("company", e.target.value)}
          placeholder="Optional"
        />
      </Field>
      <Field label="Email">
        <input
          required
          type="email"
          maxLength={200}
          autoComplete="email"
          value={form.email}
          onChange={(e) => change("email", e.target.value)}
          // taste-skill-ignore: illustrative email input hint, not seeded user data.
          placeholder="Client email address"
        />
      </Field>
      <Field label="Billing address">
        <textarea
          maxLength={500}
          rows={3}
          value={form.address}
          onChange={(e) => change("address", e.target.value)}
          placeholder="Street, city, country"
        />
      </Field>
      <div className="form-footer">
        <span className="muted">Only saved to your workspace.</span>
        <button className="button primary" disabled={busy}>
          {busy ? "Saving…" : client ? "Save client" : "Create client"}
        </button>
      </div>
    </form>
  );
}
export function ProjectForm({
  project,
  clientId,
  workspace: w,
  execute,
  busy,
  onDone,
}: {
  project?: Project;
  clientId?: string;
  workspace: Workspace;
  execute: Execute;
  busy: boolean;
  onDone: (w: Workspace) => void;
}) {
  const [form, setForm] = useState({
      name: project?.name || "",
      clientId: project?.clientId || clientId || w.clients[0]?.id || "",
      description: project?.description || "",
      budget: ((project?.budget || 0) / 100).toFixed(2),
      currency: project?.currency || w.business.currency,
      dueDate: project?.dueDate || shiftDay(today(), 14),
      status: project?.status || "active",
    }),
    [error, setError] = useState("");
  const change = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));
  return (
    <form
      className="editor-form"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          setError("");
          const result = await execute(
            project ? "project.update" : "project.create",
            {
              ...form,
              budget: decimalUnits(form.budget),
              ...(project ? { id: project.id } : {}),
            },
          );
          if (result) onDone(result);
        } catch (cause) {
          setError((cause as Error).message);
        }
      }}
    >
      <Field label="Project name">
        <input
          required
          maxLength={150}
          value={form.name}
          onChange={(e) => change("name", e.target.value)}
          placeholder="Website refresh"
        />
      </Field>
      <Field label="Client">
        <select
          required
          value={form.clientId}
          onChange={(e) => change("clientId", e.target.value)}
        >
          <option value="" disabled>
            Choose a client
          </option>
          {w.clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.company || c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Project brief">
        <textarea
          maxLength={1500}
          rows={4}
          value={form.description}
          onChange={(e) => change("description", e.target.value)}
          placeholder="A few words about the work, scope, and deliverables."
        />
      </Field>
      <div className="field-pair">
        <Field label="Budget">
          <input
            required
            inputMode="decimal"
            value={form.budget}
            onChange={(e) => change("budget", e.target.value)}
          />
        </Field>
        <Field label="Currency">
          <select
            value={form.currency}
            onChange={(e) => change("currency", e.target.value)}
          >
            {["USD", "EUR", "MAD"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="field-pair">
        <Field label="Due date">
          <input
            required
            type="date"
            value={form.dueDate}
            onChange={(e) => change("dueDate", e.target.value)}
          />
        </Field>
        <Field label="Status">
          <select
            value={form.status}
            onChange={(e) => change("status", e.target.value)}
          >
            <option value="active">Active</option>
            <option value="on-hold">On hold</option>
            <option value="completed">Completed</option>
          </select>
        </Field>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-footer">
        <span className="muted">Add milestones after saving.</span>
        <button disabled={busy || !w.clients.length} className="button primary">
          {busy ? "Saving…" : project ? "Save project" : "Create project"}
        </button>
      </div>
    </form>
  );
}
export function InvoiceForm({
  invoice,
  clientId,
  projectId,
  workspace: w,
  execute,
  busy,
  onDone,
}: {
  invoice?: Invoice;
  clientId?: string;
  projectId?: string;
  workspace: Workspace;
  execute: Execute;
  busy: boolean;
  onDone: (w: Workspace) => void;
}) {
  const project = w.projects.find((p) => p.id === projectId);
  const [form, setForm] = useState({
    clientId:
      invoice?.clientId ||
      project?.clientId ||
      clientId ||
      w.clients[0]?.id ||
      "",
    projectId: invoice?.projectId || projectId || "",
    currency: invoice?.currency || project?.currency || w.business.currency,
    date: invoice?.date || today(),
    dueDate: invoice?.dueDate || shiftDay(today(), 14),
    tax: ((invoice?.taxBps || 0) / 100).toFixed(2),
    discount: ((invoice?.discount || 0) / 100).toFixed(2),
    notes: invoice?.notes || "Thank you for the opportunity to work together.",
  });
  const [lines, setLines] = useState(
      invoice
        ? invoice.items.map((l) => ({
            key: l.id,
            description: l.description,
            quantity: (l.quantity / 100).toString(),
            rate: (l.rate / 100).toFixed(2),
          }))
        : [
            {
              key: crypto.randomUUID(),
              description: project ? project.name + " — services" : "",
              quantity: "1",
              rate: "0.00",
            },
          ],
    ),
    [error, setError] = useState("");
  const update = (key: keyof typeof form, value: string) =>
    setForm((f) => ({
      ...f,
      [key]: value,
      ...(key === "clientId" ? { projectId: "" } : {}),
    }));
  let preview = { subtotal: 0, tax: 0, total: 0 };
  try {
    const items = lines.map((l) => ({
      id: l.key,
      description: l.description,
      quantity: decimalUnits(l.quantity),
      rate: decimalUnits(l.rate),
    }));
    preview = invoiceTotals({
      items,
      taxBps: decimalUnits(form.tax),
      discount: decimalUnits(form.discount),
    } as Invoice);
  } catch {}
  return (
    <form
      className="editor-form invoice-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          setError("");
          const items = lines.map((l) => ({
            description: l.description,
            quantity: decimalUnits(l.quantity),
            rate: decimalUnits(l.rate),
          }));
          const result = await execute(
            invoice ? "invoice.update" : "invoice.create",
            {
              ...form,
              items,
              taxBps: decimalUnits(form.tax),
              discount: decimalUnits(form.discount),
              ...(invoice ? { id: invoice.id } : {}),
            },
          );
          if (result) onDone(result);
        } catch (cause) {
          setError((cause as Error).message);
        }
      }}
    >
      <p className="form-intro">
        Save a draft, review the PDF, then issue it when it’s ready. You’ll send
        the invoice yourself.
      </p>
      <div className="field-pair">
        <Field label="Bill to">
          <select
            required
            value={form.clientId}
            onChange={(e) => update("clientId", e.target.value)}
          >
            <option value="" disabled>
              Choose a client
            </option>
            {w.clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company || c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Related project">
          <select
            value={form.projectId}
            onChange={(e) => update("projectId", e.target.value)}
          >
            <option value="">No project</option>
            {w.projects
              .filter((p) => p.clientId === form.clientId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </Field>
      </div>
      <div className="field-trio">
        <Field label="Invoice date">
          <input
            required
            type="date"
            value={form.date}
            onChange={(e) => update("date", e.target.value)}
          />
        </Field>
        <Field label="Due date">
          <input
            required
            type="date"
            min={form.date}
            value={form.dueDate}
            onChange={(e) => update("dueDate", e.target.value)}
          />
        </Field>
        <Field label="Currency">
          <select
            value={form.currency}
            onChange={(e) => update("currency", e.target.value)}
          >
            {["USD", "EUR", "MAD"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="invoice-lines-heading">
        <span>Description</span>
        <span>Qty</span>
        <span>Rate</span>
        <span />
      </div>
      {lines.map((line, index) => (
        <div className="invoice-edit-line" key={line.key}>
          <input
            required
            maxLength={500}
            aria-label={`Line ${index + 1} description`}
            placeholder="Design services"
            value={line.description}
            onChange={(e) =>
              setLines((ls) =>
                ls.map((l) =>
                  l.key === line.key
                    ? { ...l, description: e.target.value }
                    : l,
                ),
              )
            }
          />
          <input
            required
            inputMode="decimal"
            aria-label={`Line ${index + 1} quantity`}
            value={line.quantity}
            onChange={(e) =>
              setLines((ls) =>
                ls.map((l) =>
                  l.key === line.key ? { ...l, quantity: e.target.value } : l,
                ),
              )
            }
          />
          <input
            required
            inputMode="decimal"
            aria-label={`Line ${index + 1} rate`}
            value={line.rate}
            onChange={(e) =>
              setLines((ls) =>
                ls.map((l) =>
                  l.key === line.key ? { ...l, rate: e.target.value } : l,
                ),
              )
            }
          />
          <button
            type="button"
            className="icon-button"
            aria-label={`Remove line ${index + 1}`}
            disabled={lines.length === 1}
            onClick={() =>
              setLines((ls) => ls.filter((l) => l.key !== line.key))
            }
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-button"
        disabled={lines.length >= 100}
        onClick={() =>
          setLines((ls) => [
            ...ls,
            {
              key: crypto.randomUUID(),
              description: "",
              quantity: "1",
              rate: "0.00",
            },
          ])
        }
      >
        <Plus size={16} />
        Add a line
      </button>
      <div className="invoice-adjustments">
        <div className="field-pair">
          <Field label="Tax (%)">
            <input
              required
              inputMode="decimal"
              value={form.tax}
              onChange={(e) => update("tax", e.target.value)}
            />
          </Field>
          <Field label={`Discount (${form.currency})`}>
            <input
              required
              inputMode="decimal"
              value={form.discount}
              onChange={(e) => update("discount", e.target.value)}
            />
          </Field>
        </div>
        <div className="editor-total">
          <span>Draft total</span>
          <strong>{money(preview.total, form.currency)}</strong>
        </div>
      </div>
      <Field label="Notes">
        <textarea
          maxLength={2000}
          rows={3}
          value={form.notes}
          onChange={(e) => update("notes", e.target.value)}
        />
      </Field>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-footer">
        <span className="muted">Line amounts round to the nearest cent.</span>
        <button className="button primary" disabled={busy || !w.clients.length}>
          {busy ? "Saving…" : "Save draft"}
        </button>
      </div>
    </form>
  );
}
export function PaymentForm({
  invoice,
  workspace: w,
  execute,
  busy,
  onDone,
}: {
  invoice: Invoice;
  workspace: Workspace;
  execute: Execute;
  busy: boolean;
  onDone: (w: Workspace) => void;
}) {
  const totals = invoiceTotals(invoice, w.payments),
    requestId = useRef(crypto.randomUUID());
  const [form, setForm] = useState({
      amount: (totals.balance / 100).toFixed(2),
      date: today(),
      method: "Bank transfer",
      note: "",
    }),
    [error, setError] = useState("");
  return (
    <form
      className="editor-form"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          setError("");
          const result = await execute("payment.record", {
            ...form,
            amount: decimalUnits(form.amount),
            invoiceId: invoice.id,
            requestId: requestId.current,
          });
          if (result) onDone(result);
        } catch (cause) {
          setError((cause as Error).message);
        }
      }}
    >
      <p className="form-intro">
        Record a payment you already received for{" "}
        <strong>{invoice.number}</strong>. This does not charge your client.
      </p>
      <div className="balance-callout">
        <span>Remaining balance</span>
        <strong>{money(totals.balance, invoice.currency)}</strong>
      </div>
      <div className="field-pair">
        <Field label={`Amount (${invoice.currency})`}>
          <input
            required
            inputMode="decimal"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
          />
        </Field>
        <Field label="Received on">
          <input
            required
            type="date"
            min={invoice.date}
            max={today()}
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
          />
        </Field>
      </div>
      <Field label="Method">
        <select
          value={form.method}
          onChange={(e) => setForm((f) => ({ ...f, method: e.target.value }))}
        >
          {["Bank transfer", "Cash", "Check", "Other"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </Field>
      <Field label="Reference or note">
        <input
          maxLength={500}
          value={form.note}
          onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
          placeholder="Optional payment reference"
        />
      </Field>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-footer">
        <span className="muted">A payment record, not a transaction.</span>
        <button className="button primary" disabled={busy}>
          {busy ? "Saving…" : "Record payment"}
        </button>
      </div>
    </form>
  );
}
export function BusinessForm({
  business,
  execute,
  busy,
}: {
  business: Business;
  execute: Execute;
  busy: boolean;
}) {
  const [form, setForm] = useState(business);
  const change = (key: keyof Business, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));
  return (
    <form
      className="settings-form"
      onSubmit={async (e) => {
        e.preventDefault();
        await execute("business.save", { ...form });
      }}
    >
      <section className="settings-row">
        <div>
          <h2>Your business</h2>
          <p>
            These details appear on new invoice drafts. Existing invoices keep
            their original snapshot.
          </p>
        </div>
        <div className="settings-fields">
          <Field label="Business or studio name">
            <input
              required
              maxLength={120}
              value={form.name}
              onChange={(e) => change("name", e.target.value)}
            />
          </Field>
          <Field label="Your name">
            <input
              required
              maxLength={120}
              value={form.contact}
              onChange={(e) => change("contact", e.target.value)}
            />
          </Field>
          <Field label="Business email">
            <input
              required
              type="email"
              maxLength={200}
              value={form.email}
              onChange={(e) => change("email", e.target.value)}
            />
          </Field>
          <Field label="Address">
            <textarea
              rows={3}
              maxLength={500}
              value={form.address}
              onChange={(e) => change("address", e.target.value)}
            />
          </Field>
        </div>
      </section>
      <section className="settings-row">
        <div>
          <h2>Invoice defaults</h2>
          <p>
            Choose your default currency and a short prefix. Each invoice has
            its own currency; totals are shown separately.
          </p>
        </div>
        <div className="settings-fields">
          <div className="field-pair">
            <Field label="Default currency">
              <select
                value={form.currency}
                onChange={(e) => change("currency", e.target.value)}
              >
                {["USD", "EUR", "MAD"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Invoice prefix">
              <input
                required
                maxLength={10}
                pattern="[A-Z0-9-]+"
                value={form.prefix}
                onChange={(e) => change("prefix", e.target.value.toUpperCase())}
              />
            </Field>
          </div>
          <Field
            label="Payment instructions"
            hint="Add your own payment details. Never store card numbers or passwords here."
          >
            <textarea
              rows={5}
              maxLength={1500}
              value={form.instructions}
              onChange={(e) => change("instructions", e.target.value)}
            />
          </Field>
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Save business details"}
          </button>
        </div>
      </section>
    </form>
  );
}


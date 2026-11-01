import type {
  Business,
  Client,
  Command,
  Currency,
  Invoice,
  Line,
  Payment,
  Project,
  Workspace,
} from "./desk-types";

export class DeskError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export const today = () => new Date().toISOString().slice(0, 10);
export function shiftDay(day: string, amount: number) {
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
export function money(amount: number, currency: Currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount / 100);
}
export function dateLabel(day: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(day + "T12:00:00Z"));
}
export function decimalUnits(value: string): number {
  if (!/^\d{1,8}(\.\d{0,2})?$/.test(value.trim()))
    throw new DeskError("Use a positive number with up to two decimal places.");
  const [whole, decimal = ""] = value.trim().split(".");
  return Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
}
export function lineTotal(line: Line) {
  return Math.floor((line.quantity * line.rate + 50) / 100);
}
export function invoiceTotals(invoice: Invoice, payments: Payment[] = []) {
  const subtotal = invoice.items.reduce((s, l) => s + lineTotal(l), 0);
  const taxable = subtotal - invoice.discount;
  const tax = Math.floor((taxable * invoice.taxBps + 5000) / 10000);
  const total = taxable + tax;
  const paid = payments
    .filter((p) => p.invoiceId === invoice.id)
    .reduce((s, p) => s + p.amount, 0);
  return {
    subtotal,
    discount: invoice.discount,
    tax,
    total,
    paid,
    balance: Math.max(0, total - paid),
  };
}
export function invoiceStatus(
  invoice: Invoice,
  payments: Payment[],
  day = today(),
) {
  if (invoice.stage === "draft") return "Draft";
  if (invoice.stage === "void") return "Void";
  const t = invoiceTotals(invoice, payments);
  if (t.balance === 0) return "Paid";
  if (invoice.dueDate < day) return "Overdue";
  if (t.paid > 0) return "Partial";
  return "Issued";
}
export function projectProgress(project: Project) {
  return project.tasks.length
    ? Math.round(
        (project.tasks.filter((t) => t.done).length / project.tasks.length) *
          100,
      )
    : 0;
}

const obj = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new DeskError("Invalid request.");
  return v as Record<string, unknown>;
};
const str = (v: unknown, label: string, max = 200, empty = false) => {
  if (
    typeof v !== "string" ||
    v.length > max ||
    (!empty && !v.trim()) ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)
  )
    throw new DeskError(
      `Check ${label}${empty ? "" : ": this field is required"}.`,
    );
  return v.trim();
};
const int = (v: unknown, label: string, max = 100_000_000, min = 0) => {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min || v > max)
    throw new DeskError(`Check ${label}.`);
  return v;
};
const email = (v: unknown) => {
  const value = str(v, "email", 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
    throw new DeskError("Enter a valid email address.");
  return value;
};
const currency = (v: unknown): Currency => {
  if (!["USD", "EUR", "MAD"].includes(v as string))
    throw new DeskError("Choose USD, EUR, or MAD.");
  return v as Currency;
};
const date = (v: unknown) => {
  const value = str(v, "date", 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value + "T12:00:00Z")) ||
    new Date(value + "T12:00:00Z").toISOString().slice(0, 10) !== value
  )
    throw new DeskError("Choose a valid date.");
  return value;
};
function business(v: unknown): Business {
  const p = obj(v);
  const prefix = str(p.prefix, "invoice prefix", 10);
  if (!/^[A-Z0-9-]+$/.test(prefix))
    throw new DeskError(
      "Invoice prefix must contain uppercase letters, numbers, or hyphens.",
    );
  return {
    name: str(p.name, "business name", 120),
    contact: str(p.contact, "contact name", 120),
    email: email(p.email),
    address: str(p.address, "business address", 500, true),
    currency: currency(p.currency),
    instructions: str(p.instructions, "payment instructions", 1500, true),
    prefix,
  };
}
function client(
  p: Record<string, unknown>,
  id: string,
  createdAt: string,
  color: number,
): Client {
  return {
    id,
    name: str(p.name, "client name", 120),
    company: str(p.company, "company", 120, true),
    email: email(p.email),
    address: str(p.address, "address", 500, true),
    color,
    createdAt,
  };
}
export function validateCommand(v: unknown): Command {
  const p = obj(v);
  if (
    Object.keys(p).some(
      (k) => !["type", "expectedRevision", "payload"].includes(k),
    )
  )
    throw new DeskError("Unexpected request field.");
  return {
    type: str(p.type, "action", 40),
    expectedRevision: int(p.expectedRevision, "workspace revision"),
    payload: obj(p.payload),
  };
}
export function applyCommand(
  source: Workspace,
  command: Command,
  day = today(),
  newId = () => crypto.randomUUID(),
): Workspace {
  if (command.type === "payment.record") {
    const prior = source.payments.find(
      (v) => v.requestId === command.payload.requestId,
    );
    if (prior) {
      if (
        prior.invoiceId !== command.payload.invoiceId ||
        prior.amount !== command.payload.amount ||
        prior.date !== command.payload.date ||
        prior.method !== command.payload.method ||
        prior.note !== String(command.payload.note || "").trim()
      )
        throw new DeskError(
          "This payment request was already used for a different payment.",
          409,
        );
      return source;
    }
  }
  if (command.expectedRevision !== source.revision)
    throw new DeskError(
      "Your workspace changed in another tab. Reload before saving; your form is still here.",
      409,
    );
  const w = structuredClone(source),
    p = command.payload,
    stamp = day;
  const findClient = (id: unknown) => {
    const row = w.clients.find((c) => c.id === id);
    if (!row) throw new DeskError("Choose an existing client.");
    return row;
  };
  const findProject = (id: unknown) => {
    const row = w.projects.find((c) => c.id === id);
    if (!row) throw new DeskError("Project not found.", 404);
    return row;
  };
  const findInvoice = (id: unknown) => {
    const row = w.invoices.find((c) => c.id === id);
    if (!row) throw new DeskError("Invoice not found.", 404);
    return row;
  };
  let title = "",
    detail = "";
  switch (command.type) {
    case "business.save":
      w.business = business(p);
      title = "Business details updated";
      detail = w.business.name;
      break;
    case "client.create": {
      if (w.clients.length >= 500)
        throw new DeskError("This workspace supports up to 500 clients.");
      const c = client(p, newId(), stamp, w.clients.length % 6);
      w.clients.push(c);
      title = "New client added";
      detail = c.company || c.name;
      break;
    }
    case "client.update": {
      const c = findClient(p.id),
        updated = client(p, c.id, c.createdAt, c.color);
      w.clients = w.clients.map((row) => (row.id === c.id ? updated : row));
      title = "Client details updated";
      detail = updated.company || updated.name;
      break;
    }
    case "client.delete": {
      const c = findClient(p.id);
      if (
        w.projects.some((v) => v.clientId === c.id) ||
        w.invoices.some((v) => v.clientId === c.id)
      )
        throw new DeskError(
          "This client has projects or invoices. Keep the client to preserve your records.",
        );
      w.clients = w.clients.filter((v) => v.id !== c.id);
      title = "Client removed";
      detail = c.name;
      break;
    }
    case "project.create":
    case "project.update": {
      const existing =
        command.type === "project.update" ? findProject(p.id) : null;
      const c = findClient(p.clientId);
      if (
        existing &&
        existing.clientId !== c.id &&
        w.invoices.some((i) => i.projectId === existing.id)
      )
        throw new DeskError(
          "An invoiced project cannot move to another client.",
        );
      if (!["active", "on-hold", "completed"].includes(p.status as string))
        throw new DeskError("Choose a project status.");
      const row: Project = {
        id: existing?.id || newId(),
        createdAt: existing?.createdAt || stamp,
        clientId: c.id,
        name: str(p.name, "project name", 150),
        description: str(p.description, "project description", 1500, true),
        status: p.status as Project["status"],
        budget: int(p.budget, "project budget"),
        currency: currency(p.currency),
        dueDate: date(p.dueDate),
        tasks: existing?.tasks || [],
      };
      if (existing)
        w.projects = w.projects.map((v) => (v.id === row.id ? row : v));
      else {
        if (w.projects.length >= 500)
          throw new DeskError("Workspace project limit reached.");
        w.projects.push(row);
      }
      title = existing ? "Project updated" : "New project started";
      detail = row.name;
      break;
    }
    case "task.add": {
      const project = findProject(p.projectId);
      if (project.tasks.length >= 100)
        throw new DeskError("A project supports up to 100 tasks.");
      project.tasks.push({
        id: newId(),
        title: str(p.title, "task title", 200),
        done: false,
      });
      title = "Task added";
      detail = project.name;
      break;
    }
    case "task.toggle":
    case "task.delete": {
      const project = findProject(p.projectId),
        task = project.tasks.find((t) => t.id === p.id);
      if (!task) throw new DeskError("Task not found.", 404);
      if (command.type === "task.toggle") {
        if (typeof p.done !== "boolean")
          throw new DeskError("Choose a task state.");
        task.done = p.done;
        title = task.done ? "Task completed" : "Task reopened";
      } else {
        project.tasks = project.tasks.filter((t) => t.id !== task.id);
        title = "Task removed";
      }
      detail = task.title;
      break;
    }
    case "invoice.create":
    case "invoice.update": {
      const existing =
        command.type === "invoice.update" ? findInvoice(p.id) : null;
      if (existing && existing.stage !== "draft")
        throw new DeskError(
          "Issued and void invoices cannot be edited. Create a new draft.",
        );
      if (w.invoices.length >= 1000 && !existing)
        throw new DeskError("Workspace invoice limit reached.");
      const c = findClient(p.clientId);
      const projectId = str(p.projectId, "project", 100, true);
      if (projectId && findProject(projectId).clientId !== c.id)
        throw new DeskError("Choose a project belonging to this client.");
      if (!Array.isArray(p.items) || p.items.length < 1 || p.items.length > 100)
        throw new DeskError("Add between 1 and 100 invoice lines.");
      const items: Line[] = p.items.map((v) => {
        const row = obj(v);
        return {
          id: newId(),
          description: str(row.description, "line description", 500),
          quantity: int(row.quantity, "quantity", 1_000_000, 1),
          rate: int(row.rate, "unit price"),
        };
      });
      const issuedDate = date(p.date),
        dueDate = date(p.dueDate);
      if (dueDate < issuedDate)
        throw new DeskError(
          "The due date must be on or after the invoice date.",
        );
      const row: Invoice = {
        id: existing?.id || newId(),
        clientId: c.id,
        projectId,
        number:
          existing?.number ||
          `${w.business.prefix}-${day.slice(0, 4)}-${String(w.invoices.length + 1).padStart(3, "0")}`,
        date: issuedDate,
        dueDate,
        currency: currency(p.currency),
        items,
        taxBps: int(p.taxBps, "tax rate", 10000),
        discount: int(p.discount, "discount"),
        notes: str(p.notes, "invoice notes", 2000, true),
        stage: "draft",
        seller: structuredClone(w.business),
        billTo: structuredClone(c),
        createdAt: existing?.createdAt || stamp,
      };
      if (row.discount > row.items.reduce((s, l) => s + lineTotal(l), 0))
        throw new DeskError("The discount cannot exceed the subtotal.");
      if (invoiceTotals(row).total > 1_000_000_000)
        throw new DeskError("Invoice total exceeds the workspace limit.");
      if (existing)
        w.invoices = w.invoices.map((v) => (v.id === row.id ? row : v));
      else w.invoices.push(row);
      title = existing ? "Invoice draft updated" : "Invoice draft created";
      detail = row.number;
      break;
    }
    case "invoice.issue": {
      const i = findInvoice(p.id);
      if (i.stage !== "draft")
        throw new DeskError("Only drafts can be issued.");
      if (invoiceTotals(i).total <= 0)
        throw new DeskError("Add a positive invoice total before issuing.");
      // Freeze the seller and client details as they are now, not as they
      // were when the draft was last saved.
      i.seller = structuredClone(w.business);
      i.billTo = structuredClone(findClient(i.clientId));
      i.stage = "issued";
      title = "Invoice issued";
      detail = `${i.number} · Ready to download and send`;
      break;
    }
    case "invoice.void": {
      const i = findInvoice(p.id);
      if (w.payments.some((v) => v.invoiceId === i.id))
        throw new DeskError(
          "An invoice with recorded payments cannot be voided.",
        );
      if (i.stage === "void")
        throw new DeskError("This invoice is already void.");
      i.stage = "void";
      title = "Invoice voided";
      detail = i.number;
      break;
    }
    case "payment.record": {
      const i = findInvoice(p.invoiceId);
      if (i.stage !== "issued")
        throw new DeskError(
          "Payments can only be recorded against issued invoices.",
        );
      const requestId = str(p.requestId, "payment request ID", 100);
      const prior = w.payments.find((v) => v.requestId === requestId);
      if (prior) {
        if (prior.invoiceId !== i.id || prior.amount !== p.amount)
          throw new DeskError(
            "This payment request was already used for a different payment.",
            409,
          );
        return source;
      }
      const amount = int(p.amount, "payment amount", 1_000_000_000, 1),
        paymentDate = date(p.date);
      if (paymentDate > day)
        throw new DeskError(
          "A received payment cannot be dated in the future.",
        );
      if (paymentDate < i.date)
        throw new DeskError(
          "The payment date cannot be before the invoice date.",
        );
      if (amount > invoiceTotals(i, w.payments).balance)
        throw new DeskError("The payment exceeds the remaining balance.");
      const method = str(p.method, "payment method", 80);
      w.payments.push({
        id: newId(),
        invoiceId: i.id,
        amount,
        date: paymentDate,
        method,
        note: str(p.note, "payment note", 500, true),
        requestId,
      });
      title = "Payment recorded";
      detail = `${i.number} · ${money(amount, i.currency)}`;
      break;
    }
    default:
      throw new DeskError("Unknown action.");
  }
  w.activity.unshift({ id: newId(), title, detail, date: day });
  w.activity = w.activity.slice(0, 80);
  return w;
}

export function createDemo(day = today()): Workspace {
  const b: Business = {
    name: "Morgan Creative",
    contact: "Alex Morgan",
    email: "hello@example.com",
    address: "Freelance design & development\nPortland, Oregon",
    currency: "USD",
    instructions:
      "Payment by bank transfer. Please include the invoice number as your reference. Replace these sample instructions with your own.",
    prefix: "INV",
  };
  const clients: Client[] = [
    [
      "c1",
      "Maya Chen",
      "Northstar Studio",
      "maya@example.com",
      "Portland, Oregon",
    ],
    ["c2", "Omar Haddad", "Lumen Coffee", "omar@example.com", "Austin, Texas"],
    [
      "c3",
      "Elena Rossi",
      "Forma Architecture",
      "elena@example.com",
      "New York, New York",
    ],
    ["c4", "Noah Kim", "Sora Goods", "noah@example.com", "Seattle, Washington"],
  ].map(([id, name, company, email, address], color) => ({
    id,
    name,
    company,
    email,
    address,
    color,
    createdAt: shiftDay(day, -30),
  }));
  const project = (
    id: string,
    clientId: string,
    name: string,
    budget: number,
    due: number,
    titles: string[],
    done: number,
    status: Project["status"] = "active",
  ): Project => ({
    id,
    clientId,
    name,
    budget,
    currency: "USD",
    dueDate: shiftDay(day, due),
    description:
      "A considered, collaborative project from the first idea to final delivery.",
    status,
    createdAt: shiftDay(day, -22),
    tasks: titles.map((title, index) => ({
      id: `${id}-t${index}`,
      title,
      done: index < done,
    })),
  });
  const projects = [
    project(
      "p1",
      "c1",
      "Website refresh",
      480000,
      6,
      [
        "Discovery & direction",
        "Wireframes",
        "Visual design",
        "Development",
        "Launch & handoff",
      ],
      3,
    ),
    project(
      "p2",
      "c2",
      "Brand identity",
      420000,
      12,
      [
        "Brand workshop",
        "Identity concepts",
        "Refine selected direction",
        "Brand guidelines",
      ],
      2,
    ),
    project(
      "p3",
      "c3",
      "Portfolio website",
      320000,
      -7,
      ["Content planning", "Design system", "Website build", "Handoff"],
      4,
      "completed",
    ),
    project(
      "p4",
      "c4",
      "Online store",
      560000,
      19,
      [
        "Store strategy",
        "Product architecture",
        "Storefront design",
        "Build & test",
        "Launch",
      ],
      1,
    ),
  ];
  const inv = (
    id: string,
    cid: string,
    pid: string,
    n: number,
    total: number,
    due: number,
    stage: Invoice["stage"] = "issued",
  ): Invoice => ({
    id,
    clientId: cid,
    projectId: pid,
    number: `INV-${day.slice(0, 4)}-${String(n).padStart(3, "0")}`,
    date: shiftDay(day, -20),
    dueDate: shiftDay(day, due),
    currency: "USD",
    items: [
      {
        id: `${id}-line`,
        description:
          projects.find((p) => p.id === pid)!.name + " — design services",
        quantity: 100,
        rate: total,
      },
    ],
    taxBps: 0,
    discount: 0,
    notes: "Thank you for the opportunity to work together.",
    stage,
    seller: structuredClone(b),
    billTo: structuredClone(clients.find((c) => c.id === cid)!),
    createdAt: shiftDay(day, -20),
  });
  return {
    version: 1,
    revision: 0,
    business: b,
    clients,
    projects,
    invoices: [
      inv("i1", "c1", "p1", 1, 320000, -4),
      inv("i2", "c2", "p2", 2, 240000, 7),
      inv("i3", "c3", "p3", 3, 140000, -8),
      inv("i4", "c4", "p4", 4, 180000, 14, "draft"),
    ],
    payments: [
      {
        id: "pay1",
        invoiceId: "i3",
        amount: 140000,
        date: shiftDay(day, -10),
        method: "Bank transfer",
        note: "Sample payment",
        requestId: "seed-paid",
      },
      {
        id: "pay2",
        invoiceId: "i2",
        amount: 100000,
        date: shiftDay(day, -3),
        method: "Bank transfer",
        note: "Sample deposit",
        requestId: "seed-deposit",
      },
    ],
    activity: [
      {
        id: "a1",
        title: "Deposit received",
        detail: "Lumen Coffee · $1,000.00",
        date: shiftDay(day, -3),
      },
      {
        id: "a2",
        title: "Project completed",
        detail: "Forma Architecture · Portfolio website",
        date: shiftDay(day, -7),
      },
      {
        id: "a3",
        title: "Invoice paid",
        detail: "Forma Architecture · $1,400.00",
        date: shiftDay(day, -10),
      },
    ],
  };
}

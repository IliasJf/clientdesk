"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  Users,
  X,
} from "lucide-react";
import type {
  Client,
  Currency,
  Invoice,
  Project,
  Session,
  Workspace,
} from "../lib/desk-types";
import {
  createDemo,
  dateLabel,
  invoiceStatus,
  invoiceTotals,
  money,
  projectProgress,
  shiftDay,
  today,
} from "../lib/desk-domain";
import {
  BusinessForm,
  ClientForm,
  InvoiceForm,
  PaymentForm,
  ProjectForm,
} from "./DeskForms";
import type { Execute } from "./DeskForms";
import InvoiceView from "./InvoiceView";

type View = "overview" | "clients" | "projects" | "invoices" | "settings";
type DialogState = {
  kind:
    | "client"
    | "clientEdit"
    | "project"
    | "projectEdit"
    | "invoice"
    | "invoiceEdit"
    | "payment";
  id?: string;
  clientId?: string;
  projectId?: string;
} | null;
const navigation = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "clients", label: "Clients", icon: Users },
  { id: "projects", label: "Projects", icon: BriefcaseBusiness },
  { id: "invoices", label: "Invoices", icon: FileText },
] as const;
function Logo() {
  return (
    <>
      <svg
        viewBox="0 0 32 32"
        width="30"
        height="30"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M7 5h13l6 6v17H7z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path
          d="M20 5v7h6M12 17h9M12 22h6"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
      <span>
        ClientDesk<span className="logo-dot">.</span>
      </span>
    </>
  );
}
function Avatar({
  client,
  small = false,
}: {
  client: Client;
  small?: boolean;
}) {
  return (
    <span
      className={`avatar avatar-${client.color % 6} ${small ? "small" : ""}`}
      aria-hidden="true"
    >
      {(client.company || client.name)
        .split(/\s+/)
        .map((v) => v[0])
        .slice(0, 2)
        .join("")}
    </span>
  );
}
function Badge({ label }: { label: string }) {
  return (
    <span className={`badge ${label.toLowerCase().replaceAll(" ", "-")}`}>
      {label === "Paid" && <Check size={11} />}
      {label}
    </span>
  );
}
function Progress({ project }: { project: Project }) {
  const value = projectProgress(project);
  return (
    <div className="progress-wrap">
      <div
        className="progress-track"
        role="progressbar"
        aria-label={`${project.name} progress`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
      >
        <span style={{ width: `${value}%` }} />
      </div>
      <span>{value}%</span>
    </div>
  );
}
function Empty({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p>{children || "Try another search or create your first record."}</p>
    </div>
  );
}
function Modal({
  state,
  onClose,
  children,
  title,
  wide = false,
}: {
  state: DialogState;
  onClose: () => void;
  children: React.ReactNode;
  title: string;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    isOpen = !!state;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (isOpen && !el.open) el.showModal();
    else if (!isOpen && el.open) el.close();
    if (isOpen) {
      const previous = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previous;
      };
    }
  }, [isOpen]);
  return (
    <dialog
      className={`desk-dialog ${wide ? "wide" : ""}`}
      aria-label={title}
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-header">
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export default function Desk() {
  const [session, setSession] = useState<Session>(() => ({
      workspace: createDemo(),
      user: null,
      mode: "hosted",
      today: today(),
    })),
    [view, setView] = useState<View>("overview"),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [menuOpen, setMenuOpen] = useState(false),
    [query, setQuery] = useState(""),
    [currency, setCurrency] = useState<Currency>("USD"),
    [projectFilter, setProjectFilter] = useState("All"),
    [invoiceFilter, setInvoiceFilter] = useState("All invoices"),
    [dialog, setDialog] = useState<DialogState>(null),
    [pdfBusy, setPdfBusy] = useState(false),
    [taskTitle, setTaskTitle] = useState("");
  const busyRef = useRef(false),
    w = session.workspace,
    canEdit = !!session.user,
    day = session.today;
  const load = useCallback(async (initial = false) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      const data = (await response.json()) as Session & { error?: string };
      if (!response.ok)
        throw new Error(data.error || "Your workspace could not be loaded.");
      setSession(data);
      if (initial) setCurrency(data.workspace.business.currency);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    // Start the first load one microtask later, so no state is set during the effect itself.
    const start = async () => {
      await Promise.resolve();
      await load(true);
    };
    void start();
    const read = () => {
      const v = location.hash.replace("#/", "");
      if (
        ["overview", "clients", "projects", "invoices", "settings"].includes(v)
      )
        setView(v as View);
      setDialog(null);
    };
    read();
    addEventListener("hashchange", read);
    return () => removeEventListener("hashchange", read);
  }, [load]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  const go = (next: View) => {
    setView(next);
    setQuery("");
    setMenuOpen(false);
    history.replaceState(null, "", `#/${next}`);
  };
  const execute: Execute = async (type, payload) => {
    if (busyRef.current) return null;
    if (!canEdit) {
      setError("Open a workspace to save your changes.");
      return null;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, payload, expectedRevision: w.revision }),
      });
      const result = (await response.json()) as {
        workspace: Workspace;
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error || "Your change could not be saved.");
      setSession((s) => ({ ...s, workspace: result.workspace }));
      setNotice(
        type === "payment.record"
          ? "Payment recorded. Balance updated."
          : "Saved to your workspace.",
      );
      return result.workspace;
    } catch (cause) {
      setError((cause as Error).message);
      return null;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const clientFor = (id: string) => w.clients.find((c) => c.id === id)!;
  const active = w.projects.filter((p) => p.status === "active"),
    invoices = w.invoices.filter((i) => i.currency === currency),
    issued = invoices.filter((i) => i.stage === "issued");
  const outstanding = issued.reduce(
      (s, i) => s + invoiceTotals(i, w.payments).balance,
      0,
    ),
    overdue = issued.filter(
      (i) => invoiceStatus(i, w.payments, day) === "Overdue",
    ),
    collected = issued.reduce(
      (s, i) => s + invoiceTotals(i, w.payments).paid,
      0,
    );
  const received = w.payments
    .filter(
      (p) =>
        p.date.slice(0, 7) === day.slice(0, 7) &&
        w.invoices.find((i) => i.id === p.invoiceId)?.currency === currency,
    )
    .reduce((s, p) => s + p.amount, 0);
  const lastMonth = shiftDay(day.slice(0, 8) + "01", -1).slice(0, 7),
    receivedLastMonth = w.payments
      .filter(
        (p) =>
          p.date.slice(0, 7) === lastMonth &&
          w.invoices.find((i) => i.id === p.invoiceId)?.currency === currency,
      )
      .reduce((s, p) => s + p.amount, 0),
    unpaid = issued.filter((i) => invoiceTotals(i, w.payments).balance > 0),
    clientsOwing = new Set(unpaid.map((i) => i.clientId)).size,
    completedCount = w.projects.filter((p) => p.status === "completed").length;
  const draftTotal = invoices
      .filter((i) => i.stage === "draft")
      .reduce((s, i) => s + invoiceTotals(i).total, 0),
    totalIssued = outstanding + collected;
  const selectedClient = dialog?.id
      ? w.clients.find((c) => c.id === dialog.id)
      : undefined,
    selectedProject = dialog?.id
      ? w.projects.find((p) => p.id === dialog.id)
      : undefined,
    selectedInvoice = dialog?.id
      ? w.invoices.find((i) => i.id === dialog.id)
      : undefined;
  const matches = (...values: string[]) =>
    values
      .join(" ")
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase().trim());
  const filteredClients = w.clients.filter((c) =>
    matches(c.name, c.company, c.email),
  );
  const filteredProjects = w.projects.filter(
    (p) =>
      (projectFilter === "All" ||
        p.status === projectFilter.toLowerCase().replaceAll(" ", "-")) &&
      matches(
        p.name,
        clientFor(p.clientId).name,
        clientFor(p.clientId).company,
      ),
  );
  const filteredInvoices = invoices.filter((i) => {
    const status = invoiceStatus(i, w.payments, day);
    return (
      (invoiceFilter === "All invoices" ||
        invoiceFilter === status ||
        (invoiceFilter === "Outstanding" &&
          i.stage === "issued" &&
          invoiceTotals(i, w.payments).balance > 0)) &&
      matches(i.number, i.billTo.name, i.billTo.company)
    );
  });
  const titles = {
      overview: "Overview",
      clients: "Clients",
      projects: "Projects",
      invoices: "Invoices",
      settings: "Business settings",
    },
    subtitles = {
      overview: "A little clarity for your workday.",
      clients: "Good work starts with good relationships.",
      projects: "From the first idea to the final handoff.",
      invoices: "Keep the work and the paperwork moving.",
      settings: "The details that make this workspace yours.",
    };
  async function download(i: Invoice) {
    setPdfBusy(true);
    setError("");
    try {
      const { downloadInvoicePdf } = await import("../lib/invoice-pdf");
      await downloadInvoicePdf(i, w.payments);
      setNotice("Invoice PDF downloaded.");
    } catch {
      setError("The PDF could not be created. Please try again.");
    } finally {
      setPdfBusy(false);
    }
  }
  function newInvoice(clientId?: string, projectId?: string) {
    setError("");
    setDialog({ kind: "invoiceEdit", clientId, projectId });
  }
  const modalTitle =
    dialog?.kind === "clientEdit"
      ? selectedClient
        ? "Edit client"
        : "New client"
      : dialog?.kind === "projectEdit"
        ? selectedProject
          ? "Edit project"
          : "New project"
        : dialog?.kind === "invoiceEdit"
          ? selectedInvoice
            ? "Edit invoice draft"
            : "New invoice"
          : dialog?.kind === "payment"
            ? "Record a payment"
            : dialog?.kind === "client"
              ? selectedClient?.company || selectedClient?.name || "Client"
              : dialog?.kind === "project"
                ? selectedProject?.name || "Project"
                : selectedInvoice?.number || "Invoice";
  const close = () => {
    if (!busy) {
      setDialog(null);
      setTaskTitle("");
      setError("");
    }
  };

  return (
    <div className="desk-app">
      <a className="skip" href="#workspace">
        Skip to workspace
      </a>
      <div className="mobile-bar">
        <button
          className="icon-button"
          aria-label="Open navigation"
          onClick={() => setMenuOpen(true)}
        >
          <Menu size={21} />
        </button>
        <span>ClientDesk</span>
        <span>{titles[view]}</span>
      </div>
      {menuOpen && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <a className="logo" href="#/overview" onClick={() => go("overview")}>
          <Logo />
        </a>
        <button className="workspace-switch" onClick={() => go("settings")}>
          <span className="workspace-avatar">
            {w.business.name
              .split(" ")
              .map((v) => v[0])
              .slice(0, 2)
              .join("")}
          </span>
          <span>
            <strong>{w.business.name}</strong>
            <small>Freelance workspace</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <span className="nav-label">Workspace</span>
        <nav aria-label="Workspace navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button
              className={view === id ? "active" : ""}
              aria-current={view === id ? "page" : undefined}
              key={id}
              onClick={() => go(id)}
            >
              <Icon size={18} strokeWidth={1.6} />
              {label}
              {id === "invoices" && overdue.length > 0 && (
                <span
                  className="nav-count"
                  title={`${overdue.length} overdue`}
                  aria-label={`${overdue.length} overdue`}
                >
                  {overdue.length}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={view === "settings" ? "active" : ""}
            onClick={() => go("settings")}
          >
            <Settings2 size={18} strokeWidth={1.6} />
            Business settings
          </button>
          <div className="sidebar-tip">
            <FileText size={20} strokeWidth={1.4} />
            <p>
              Less admin.
              <br />
              More of your best work.
            </p>
          </div>
          <div className="account">
            <span className="account-avatar">
              {(session.user?.name || w.business.contact).slice(0, 1)}
            </span>
            <div>
              <strong>{session.user?.name || w.business.contact}</strong>
              <small>
                {session.mode === "local"
                  ? "Local demo workspace"
                  : canEdit
                    ? "Private workspace"
                    : "Sample workspace"}
              </small>
            </div>
            {canEdit && (
              <a
                href="/signout-with-chatgpt?return_to=/"
                target="_top"
                aria-label="Sign out"
              >
                <LogOut size={16} />
              </a>
            )}
          </div>
        </div>
      </aside>
      <main className="workspace" id="workspace">
        <div className="breadcrumb">
          <span>{w.business.name}</span>
          <ChevronRight size={13} />
          <span>{titles[view]}</span>
          <span className="workspace-date">{dateLabel(day)}</span>
        </div>
        <header className="page-header">
          <div>
            <h1>{titles[view]}</h1>
            <p>{subtitles[view]}</p>
          </div>
          <div className="header-controls">
            {(view === "overview" || view === "invoices") && (
              <label className="currency-select">
                <span className="sr-only">Display currency</span>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value as Currency)}
                >
                  {["USD", "EUR", "MAD"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            )}
            {view !== "settings" && (
              <button
                className="button primary"
                disabled={!canEdit || loading}
                onClick={() => {
                  setError("");
                  if (view === "clients") setDialog({ kind: "clientEdit" });
                  else if (view === "projects")
                    setDialog({ kind: "projectEdit" });
                  else newInvoice();
                }}
              >
                <Plus size={16} />
                {view === "clients"
                  ? "New client"
                  : view === "projects"
                    ? "New project"
                    : "New invoice"}
              </button>
            )}
          </div>
        </header>
        {!loading && !canEdit && (
          <div className="demo-banner">
            <span>
              <strong>A working preview.</strong> Explore the sample data, then
              open a workspace to make changes.
            </span>
            <a href="/signin-with-chatgpt?return_to=/" target="_top">
              {session.mode === "local"
                ? "Open demo workspace"
                : "Sign in with ChatGPT"}
              <ArrowUpRight size={14} />
            </a>
          </div>
        )}
        {error && !dialog && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button onClick={() => void load()}>
              Reload latest
              <RefreshCw size={14} />
            </button>
          </div>
        )}
        {loading ? (
          <div className="loading-state" role="status">
            <RefreshCw size={20} />
            <p>Opening your workspace…</p>
          </div>
        ) : (
          <>
            {view === "overview" && (
              <>
                <section
                  className="metrics"
                  aria-label={`Workspace summary in ${currency}`}
                >
                  <div className="lead">
                    <span>Outstanding</span>
                    <strong>{money(outstanding, currency)}</strong>
                    <small>
                      {
                        issued.filter(
                          (i) => invoiceTotals(i, w.payments).balance > 0,
                        ).length
                      }{" "}
                      invoices waiting on payment
                    </small>
                  </div>
                  <div>
                    <span>Received this month</span>
                    <strong>{money(received, currency)}</strong>
                    <small>
                      Last month {money(receivedLastMonth, currency)}
                    </small>
                  </div>
                  <div>
                    <span>Active projects</span>
                    <strong>{active.length}</strong>
                    <small>
                      {completedCount} completed{" "}
                      {completedCount === 1 ? "project" : "projects"}
                    </small>
                  </div>
                  <div>
                    <span>Clients</span>
                    <strong>{w.clients.length}</strong>
                    <small>
                      {clientsOwing
                        ? `${clientsOwing} with unpaid invoices`
                        : "No unpaid invoices"}
                    </small>
                  </div>
                </section>
                <div className="dashboard-split">
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>
                        Projects in motion <span>{active.length}</span>
                      </h2>
                      <button
                        className="text-button"
                        onClick={() => go("projects")}
                      >
                        View all
                        <ArrowUpRight size={13} />
                      </button>
                    </div>
                    {active.length ? (
                      active.slice(0, 4).map((p) => (
                        <button
                          className="project-overview-row"
                          key={p.id}
                          onClick={() =>
                            setDialog({ kind: "project", id: p.id })
                          }
                        >
                          <Avatar client={clientFor(p.clientId)} />
                          <div className="row-identity">
                            <strong>{p.name}</strong>
                            <span>
                              {clientFor(p.clientId).company ||
                                clientFor(p.clientId).name}
                            </span>
                          </div>
                          <div className="overview-progress">
                            <Progress project={p} />
                            <small>
                              Due {dateLabel(p.dueDate).replace(/, \d{4}/, "")}
                            </small>
                          </div>
                          <ChevronRight size={15} />
                        </button>
                      ))
                    ) : (
                      <Empty title="Room for your next project." />
                    )}
                    <div className="panel-bottom">
                      <span>
                        {active.reduce(
                          (n, p) => n + p.tasks.filter((t) => !t.done).length,
                          0,
                        )}{" "}
                        tasks still in motion
                      </span>
                      <button
                        className="text-button"
                        disabled={!canEdit}
                        onClick={() => setDialog({ kind: "projectEdit" })}
                      >
                        Create a project
                        <Plus size={13} />
                      </button>
                    </div>
                  </section>
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>Payments to follow up</h2>
                      <span className="subtle-label">{currency}</span>
                    </div>
                    {issued
                      .filter((i) => invoiceTotals(i, w.payments).balance > 0)
                      .slice(0, 4)
                      .map((i) => (
                        <button
                          className="invoice-overview-row"
                          key={i.id}
                          onClick={() =>
                            setDialog({ kind: "invoice", id: i.id })
                          }
                        >
                          <div>
                            <strong>{i.billTo.company || i.billTo.name}</strong>
                            <span>
                              {i.number} · Due{" "}
                              {dateLabel(i.dueDate).replace(/, \d{4}/, "")}
                            </span>
                          </div>
                          <div className="invoice-row-amount">
                            <strong>
                              {money(
                                invoiceTotals(i, w.payments).balance,
                                currency,
                              )}
                            </strong>
                            <Badge label={invoiceStatus(i, w.payments, day)} />
                          </div>
                        </button>
                      ))}
                    {!issued.some(
                      (i) => invoiceTotals(i, w.payments).balance > 0,
                    ) && (
                      <Empty title="All caught up.">
                        No issued invoices have a balance in {currency}.
                      </Empty>
                    )}
                    <div className="panel-bottom">
                      <span>
                        {overdue.length
                          ? `${overdue.length} overdue · ${unpaid.length} unpaid`
                          : `Nothing overdue · ${unpaid.length} unpaid`}
                      </span>
                      <button
                        className="text-button"
                        onClick={() => {
                          setInvoiceFilter("Outstanding");
                          go("invoices");
                        }}
                      >
                        View invoices
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </section>
                </div>
                <div className="dashboard-split lower">
                  <section className="panel collection-panel">
                    <div className="panel-heading">
                      <h2>The work, paid.</h2>
                      <span className="subtle-label">
                        Issued invoices · {currency}
                      </span>
                    </div>
                    <p className="collection-copy">
                      {totalIssued
                        ? `${Math.round((collected / totalIssued) * 100)}% of issued work has been collected.`
                        : "Your collection story starts with an issued invoice."}
                    </p>
                    <div
                      className="collection-bar"
                      role="progressbar"
                      aria-label="Issued invoice value collected"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={
                        totalIssued
                          ? Math.round((collected / totalIssued) * 100)
                          : 0
                      }
                    >
                      <span
                        style={{
                          width: `${totalIssued ? (collected / totalIssued) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <div className="collection-legend">
                      <div>
                        <span>
                          <i />
                          Collected
                        </span>
                        <strong>{money(collected, currency)}</strong>
                      </div>
                      <div>
                        <span>
                          <i />
                          Still to come
                        </span>
                        <strong>{money(outstanding, currency)}</strong>
                      </div>
                    </div>
                  </section>
                  <section className="panel">
                    <div className="panel-heading">
                      <h2>Recent activity</h2>
                      <Clock3 size={15} />
                    </div>
                    <div className="activity-list">
                      {w.activity.slice(0, 3).map((a) => (
                        <div key={a.id}>
                          <span className="activity-dot" />
                          <div>
                            <strong>{a.title}</strong>
                            <p>{a.detail}</p>
                          </div>
                          <time>
                            {dateLabel(a.date).replace(/, \d{4}/, "")}
                          </time>
                        </div>
                      ))}
                      {!w.activity.length && (
                        <Empty title="A fresh start.">
                          Your saved changes will appear here.
                        </Empty>
                      )}
                    </div>
                  </section>
                </div>
              </>
            )}
            {view === "clients" && (
              <>
                <div className="list-toolbar">
                  <label className="search">
                    <Search size={16} />
                    <input
                      aria-label="Search clients"
                      placeholder="Search clients…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <span>{filteredClients.length} clients</span>
                </div>
                <div className="client-grid">
                  {filteredClients.map((c) => {
                    const projects = w.projects.filter(
                        (p) => p.clientId === c.id,
                      ),
                      balances = (["USD", "EUR", "MAD"] as Currency[])
                        .map((cur) => ({
                          cur,
                          amount: w.invoices
                            .filter(
                              (i) =>
                                i.clientId === c.id &&
                                i.currency === cur &&
                                i.stage === "issued",
                            )
                            .reduce(
                              (s, i) =>
                                s + invoiceTotals(i, w.payments).balance,
                              0,
                            ),
                        }))
                        .filter((v) => v.amount > 0);
                    return (
                      <button
                        className="client-card"
                        key={c.id}
                        onClick={() => setDialog({ kind: "client", id: c.id })}
                      >
                        <div className="client-card-top">
                          <Avatar client={c} />
                          <ChevronRight size={17} />
                        </div>
                        <h2>{c.company || c.name}</h2>
                        <p>{c.name}</p>
                        <span className="client-email">{c.email}</span>
                        <div className="client-card-bottom">
                          <span>
                            {projects.length}{" "}
                            {projects.length === 1 ? "project" : "projects"}
                          </span>
                          <span>
                            {balances.length
                              ? balances
                                  .map((v) => `${money(v.amount, v.cur)} open`)
                                  .join(" · ")
                              : "No outstanding balance"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {!filteredClients.length && <Empty title="No clients found." />}
              </>
            )}
            {view === "projects" && (
              <>
                <div className="list-tabs">
                  {["All", "Active", "On hold", "Completed"].map((v) => (
                    <button
                      className={projectFilter === v ? "active" : ""}
                      key={v}
                      onClick={() => setProjectFilter(v)}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <div className="list-toolbar">
                  <label className="search">
                    <Search size={16} />
                    <input
                      aria-label="Search projects"
                      placeholder="Search projects or clients…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <span>{filteredProjects.length} projects</span>
                </div>
                <div className="project-list panel">
                  <div className="project-table-head">
                    <span>Project</span>
                    <span>Due date</span>
                    <span>Progress</span>
                    <span className="num">Budget</span>
                    <span>Status</span>
                    <span />
                  </div>
                  {filteredProjects.map((p) => (
                    <button
                      className="project-table-row"
                      key={p.id}
                      onClick={() => setDialog({ kind: "project", id: p.id })}
                    >
                      <div className="table-identity">
                        <Avatar client={clientFor(p.clientId)} small />
                        <div>
                          <strong>{p.name}</strong>
                          <span>
                            {clientFor(p.clientId).company ||
                              clientFor(p.clientId).name}
                          </span>
                        </div>
                      </div>
                      <span className="project-due">
                        {dateLabel(p.dueDate)}
                      </span>
                      <Progress project={p} />
                      <span className="num project-budget">
                        {money(p.budget, p.currency)}
                      </span>
                      <Badge
                        label={
                          p.status === "on-hold"
                            ? "On hold"
                            : p.status === "completed"
                              ? "Completed"
                              : "Active"
                        }
                      />
                      <ChevronRight size={15} />
                    </button>
                  ))}
                  {!filteredProjects.length && (
                    <Empty title="No projects here yet." />
                  )}
                </div>
              </>
            )}
            {view === "invoices" && (
              <>
                <section className="metrics invoice-metrics">
                  <div className="lead">
                    <span>Outstanding</span>
                    <strong>{money(outstanding, currency)}</strong>
                    <small>Unpaid issued invoices · {currency}</small>
                  </div>
                  <div>
                    <span>Overdue</span>
                    <strong>
                      {money(
                        overdue.reduce(
                          (s, i) => s + invoiceTotals(i, w.payments).balance,
                          0,
                        ),
                        currency,
                      )}
                    </strong>
                    <small>
                      {overdue.length}{" "}
                      {overdue.length === 1 ? "invoice" : "invoices"} past the
                      due date
                    </small>
                  </div>
                  <div>
                    <span>In draft</span>
                    <strong>{money(draftTotal, currency)}</strong>
                    <small>Not included in outstanding totals</small>
                  </div>
                </section>
                <div className="list-tabs">
                  {["All invoices", "Outstanding", "Draft", "Paid", "Void"].map(
                    (v) => (
                      <button
                        className={invoiceFilter === v ? "active" : ""}
                        key={v}
                        onClick={() => setInvoiceFilter(v)}
                      >
                        {v}
                      </button>
                    ),
                  )}
                </div>
                <div className="list-toolbar">
                  <label className="search">
                    <Search size={16} />
                    <input
                      aria-label="Search invoices"
                      placeholder="Search invoice number or client…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <span>
                    {filteredInvoices.length} invoices · {currency}
                  </span>
                </div>
                <div className="invoice-list panel">
                  <div className="invoice-table-head">
                    <span>Invoice</span>
                    <span>Client</span>
                    <span>Due date</span>
                    <span>Status</span>
                    <span className="num">Total</span>
                    <span className="num">Balance</span>
                    <span />
                  </div>
                  {filteredInvoices.map((i) => (
                    <button
                      className="invoice-table-row"
                      key={i.id}
                      onClick={() => setDialog({ kind: "invoice", id: i.id })}
                    >
                      <strong>{i.number}</strong>
                      <span>{i.billTo.company || i.billTo.name}</span>
                      <span className="invoice-due">
                        {dateLabel(i.dueDate)}
                      </span>
                      <Badge label={invoiceStatus(i, w.payments, day)} />
                      <span className="num invoice-total">
                        {money(invoiceTotals(i, w.payments).total, i.currency)}
                      </span>
                      <span className="num invoice-balance">
                        {i.stage === "draft" || i.stage === "void"
                          ? "—"
                          : money(
                              invoiceTotals(i, w.payments).balance,
                              i.currency,
                            )}
                      </span>
                      <ChevronRight size={15} />
                    </button>
                  ))}
                  {!filteredInvoices.length && (
                    <Empty title="No invoices match this view.">
                      Try another filter or currency, or create a new draft.
                    </Empty>
                  )}
                </div>
              </>
            )}
            {view === "settings" &&
              (canEdit ? (
                <BusinessForm
                  business={w.business}
                  execute={execute}
                  busy={busy}
                />
              ) : (
                <Empty title="Your business belongs here.">
                  Open a workspace to add your business details and invoice
                  defaults.
                </Empty>
              ))}
          </>
        )}
        <footer className="workspace-footer">
          <span>ClientDesk · Thoughtful work, less paperwork.</span>
          <span>
            {session.mode === "local"
              ? "Stored on this computer"
              : canEdit
                ? "Your private workspace"
                : "Fictional sample data"}
          </span>
        </footer>
      </main>
      <Modal
        state={dialog}
        onClose={close}
        title={modalTitle}
        wide={dialog?.kind === "invoice" || dialog?.kind === "invoiceEdit"}
      >
        {dialog && (
          <>
            {error && (
              <div className="dialog-error" role="alert">
                <span>{error}</span>
                <button onClick={() => void load()}>Reload latest</button>
              </div>
            )}
            {dialog.kind === "clientEdit" && (
              <ClientForm
                key={dialog.id || "new"}
                client={selectedClient}
                execute={execute}
                busy={busy}
                onDone={(result) =>
                  setDialog({
                    kind: "client",
                    id: selectedClient?.id || result.clients.at(-1)!.id,
                  })
                }
              />
            )}
            {dialog.kind === "projectEdit" && (
              <ProjectForm
                key={dialog.id || "new"}
                project={selectedProject}
                clientId={dialog.clientId}
                workspace={w}
                execute={execute}
                busy={busy}
                onDone={(result) =>
                  setDialog({
                    kind: "project",
                    id: selectedProject?.id || result.projects.at(-1)!.id,
                  })
                }
              />
            )}
            {dialog.kind === "invoiceEdit" && (
              <InvoiceForm
                key={dialog.id || "new"}
                invoice={selectedInvoice}
                clientId={dialog.clientId}
                projectId={dialog.projectId}
                workspace={w}
                execute={execute}
                busy={busy}
                onDone={(result) => {
                  const i = selectedInvoice || result.invoices.at(-1)!;
                  setCurrency(i.currency);
                  setDialog({ kind: "invoice", id: i.id });
                }}
              />
            )}
            {dialog.kind === "payment" && selectedInvoice && (
              <PaymentForm
                invoice={selectedInvoice}
                workspace={w}
                execute={execute}
                busy={busy}
                onDone={() =>
                  setDialog({ kind: "invoice", id: selectedInvoice.id })
                }
              />
            )}
            {dialog.kind === "client" && selectedClient && (
              <div className="detail-content">
                <div className="client-detail-identity">
                  <Avatar client={selectedClient} />
                  <div>
                    <h3>{selectedClient.name}</h3>
                    <p>{selectedClient.email}</p>
                  </div>
                </div>
                {selectedClient.address && (
                  <p className="multiline detail-address">
                    {selectedClient.address}
                  </p>
                )}
                <div className="detail-actions">
                  <button
                    className="button"
                    disabled={!canEdit}
                    onClick={() =>
                      setDialog({ kind: "clientEdit", id: selectedClient.id })
                    }
                  >
                    Edit client
                  </button>
                  <button
                    className="button primary"
                    disabled={!canEdit}
                    onClick={() =>
                      setDialog({
                        kind: "projectEdit",
                        clientId: selectedClient.id,
                      })
                    }
                  >
                    <Plus size={15} />
                    New project
                  </button>
                </div>
                <h3 className="detail-section-title">Projects</h3>
                {w.projects
                  .filter((p) => p.clientId === selectedClient.id)
                  .map((p) => (
                    <button
                      className="linked-row"
                      key={p.id}
                      onClick={() => setDialog({ kind: "project", id: p.id })}
                    >
                      <span>{p.name}</span>
                      <Badge
                        label={
                          p.status === "completed"
                            ? "Completed"
                            : p.status === "on-hold"
                              ? "On hold"
                              : "Active"
                        }
                      />
                      <ChevronRight size={15} />
                    </button>
                  ))}
                {!w.projects.some((p) => p.clientId === selectedClient.id) && (
                  <p className="muted">No projects yet.</p>
                )}
                <h3 className="detail-section-title">Invoices</h3>
                {w.invoices
                  .filter((i) => i.clientId === selectedClient.id)
                  .map((i) => (
                    <button
                      className="linked-row"
                      key={i.id}
                      onClick={() => setDialog({ kind: "invoice", id: i.id })}
                    >
                      <span>{i.number}</span>
                      <span>
                        {money(invoiceTotals(i, w.payments).total, i.currency)}
                      </span>
                      <Badge label={invoiceStatus(i, w.payments, day)} />
                    </button>
                  ))}
                {!w.invoices.some((i) => i.clientId === selectedClient.id) && (
                  <p className="muted">No invoices yet.</p>
                )}
                <button
                  className="text-button danger delete-client"
                  disabled={!canEdit || busy}
                  onClick={async () => {
                    if (
                      confirm(
                        "Remove this client? Clients with projects or invoices are kept for your records.",
                      )
                    ) {
                      const result = await execute("client.delete", {
                        id: selectedClient.id,
                      });
                      if (result) setDialog(null);
                    }
                  }}
                >
                  <Trash2 size={14} />
                  Remove client
                </button>
              </div>
            )}
            {dialog.kind === "project" && selectedProject && (
              <div className="detail-content">
                <div className="project-detail-meta">
                  <span>
                    {clientFor(selectedProject.clientId).company ||
                      clientFor(selectedProject.clientId).name}
                  </span>
                  <Badge
                    label={
                      selectedProject.status === "completed"
                        ? "Completed"
                        : selectedProject.status === "on-hold"
                          ? "On hold"
                          : "Active"
                    }
                  />
                </div>
                <p className="project-description">
                  {selectedProject.description}
                </p>
                <div className="detail-stat-strip">
                  <div>
                    <span>Budget</span>
                    <strong>
                      {money(selectedProject.budget, selectedProject.currency)}
                    </strong>
                  </div>
                  <div>
                    <span>Due date</span>
                    <strong>{dateLabel(selectedProject.dueDate)}</strong>
                  </div>
                </div>
                <div className="detail-actions">
                  <button
                    className="button"
                    disabled={!canEdit}
                    onClick={() =>
                      setDialog({ kind: "projectEdit", id: selectedProject.id })
                    }
                  >
                    Edit project
                  </button>
                  <button
                    className="button primary"
                    disabled={!canEdit}
                    onClick={() =>
                      newInvoice(selectedProject.clientId, selectedProject.id)
                    }
                  >
                    <Plus size={15} />
                    Create invoice
                  </button>
                </div>
                <div className="task-section-heading">
                  <h3>Project checklist</h3>
                  <span>
                    {selectedProject.tasks.filter((t) => t.done).length} /{" "}
                    {selectedProject.tasks.length} complete
                  </span>
                </div>
                <Progress project={selectedProject} />
                <div className="task-list">
                  {selectedProject.tasks.map((task) => (
                    <div className={task.done ? "done" : ""} key={task.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={task.done}
                          disabled={!canEdit || busy}
                          onChange={(e) =>
                            void execute("task.toggle", {
                              projectId: selectedProject.id,
                              id: task.id,
                              done: e.target.checked,
                            })
                          }
                        />
                        <span>{task.title}</span>
                      </label>
                      <button
                        className="icon-button"
                        disabled={!canEdit || busy}
                        aria-label={`Remove task ${task.title}`}
                        onClick={() =>
                          void execute("task.delete", {
                            projectId: selectedProject.id,
                            id: task.id,
                          })
                        }
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                {!selectedProject.tasks.length && (
                  <p className="muted">
                    Break the project into a few meaningful steps.
                  </p>
                )}
                <form
                  className="add-task"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const result = await execute("task.add", {
                      projectId: selectedProject.id,
                      title: taskTitle,
                    });
                    if (result) setTaskTitle("");
                  }}
                >
                  <input
                    required
                    maxLength={200}
                    aria-label="New task"
                    placeholder="Add the next step…"
                    value={taskTitle}
                    disabled={!canEdit}
                    onChange={(e) => setTaskTitle(e.target.value)}
                  />
                  <button
                    className="button"
                    disabled={!canEdit || busy || !taskTitle.trim()}
                  >
                    <Plus size={15} />
                    Add task
                  </button>
                </form>
              </div>
            )}
            {dialog.kind === "invoice" && selectedInvoice && (
              <div className="invoice-detail">
                <div className="invoice-action-bar">
                  <Badge
                    label={invoiceStatus(selectedInvoice, w.payments, day)}
                  />
                  <div>
                    {selectedInvoice.stage === "draft" && (
                      <>
                        <button
                          className="button"
                          disabled={!canEdit}
                          onClick={() =>
                            setDialog({
                              kind: "invoiceEdit",
                              id: selectedInvoice.id,
                            })
                          }
                        >
                          Edit draft
                        </button>
                        <button
                          className="button"
                          disabled={!canEdit || busy}
                          onClick={async () => {
                            if (
                              confirm(
                                "Issue this invoice? It will be locked for editing. No email or payment request will be sent automatically.",
                              )
                            )
                              await execute("invoice.issue", {
                                id: selectedInvoice.id,
                              });
                          }}
                        >
                          Issue invoice
                        </button>
                      </>
                    )}
                    {selectedInvoice.stage === "issued" &&
                      invoiceTotals(selectedInvoice, w.payments).balance >
                        0 && (
                        <button
                          className="button"
                          disabled={!canEdit}
                          onClick={() =>
                            setDialog({
                              kind: "payment",
                              id: selectedInvoice.id,
                            })
                          }
                        >
                          Record payment
                        </button>
                      )}
                    <button
                      className="button primary"
                      disabled={pdfBusy}
                      onClick={() => void download(selectedInvoice)}
                    >
                      <ArrowDownToLine size={15} />
                      {pdfBusy ? "Preparing…" : "Download PDF"}
                    </button>
                  </div>
                </div>
                <InvoiceView invoice={selectedInvoice} payments={w.payments} />
                {w.payments.some((p) => p.invoiceId === selectedInvoice.id) && (
                  <section className="payment-history">
                    <h3>Recorded payments</h3>
                    {w.payments
                      .filter((p) => p.invoiceId === selectedInvoice.id)
                      .map((p) => (
                        <div key={p.id}>
                          <span>
                            {dateLabel(p.date)}
                            <small>
                              {p.method}
                              {p.note ? ` · ${p.note}` : ""}
                            </small>
                          </span>
                          <strong>
                            {money(p.amount, selectedInvoice.currency)}
                          </strong>
                        </div>
                      ))}
                  </section>
                )}
                {selectedInvoice.stage !== "void" &&
                  !w.payments.some(
                    (p) => p.invoiceId === selectedInvoice.id,
                  ) && (
                    <button
                      className="text-button danger void-button"
                      disabled={!canEdit || busy}
                      onClick={async () => {
                        if (
                          confirm(
                            "Void this invoice? It will stay in your records, but no longer count as outstanding.",
                          )
                        )
                          await execute("invoice.void", {
                            id: selectedInvoice.id,
                          });
                      }}
                    >
                      Void invoice
                    </button>
                  )}
              </div>
            )}
          </>
        )}
      </Modal>
      <div className={`toast ${notice ? "visible" : ""}`} role="status">
        {notice && (
          <>
            <Check size={16} />
            {notice}
          </>
        )}
      </div>
    </div>
  );
}

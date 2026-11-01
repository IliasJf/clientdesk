export type Currency = "USD" | "EUR" | "MAD";
export interface Business {
  name: string;
  contact: string;
  email: string;
  address: string;
  currency: Currency;
  instructions: string;
  prefix: string;
}
export interface Client {
  id: string;
  name: string;
  company: string;
  email: string;
  address: string;
  color: number;
  createdAt: string;
}
export interface Task {
  id: string;
  title: string;
  done: boolean;
}
export interface Project {
  id: string;
  clientId: string;
  name: string;
  description: string;
  status: "active" | "on-hold" | "completed";
  budget: number;
  currency: Currency;
  dueDate: string;
  tasks: Task[];
  createdAt: string;
}
export interface Line {
  id: string;
  description: string;
  quantity: number;
  rate: number;
}
export interface Invoice {
  id: string;
  clientId: string;
  projectId: string;
  number: string;
  date: string;
  dueDate: string;
  currency: Currency;
  items: Line[];
  taxBps: number;
  discount: number;
  notes: string;
  stage: "draft" | "issued" | "void";
  seller: Business;
  billTo: Client;
  createdAt: string;
}
export interface Payment {
  id: string;
  invoiceId: string;
  amount: number;
  date: string;
  method: string;
  note: string;
  requestId: string;
}
export interface Activity {
  id: string;
  title: string;
  detail: string;
  date: string;
}
export interface Workspace {
  version: 1;
  revision: number;
  business: Business;
  clients: Client[];
  projects: Project[];
  invoices: Invoice[];
  payments: Payment[];
  activity: Activity[];
}
export interface Command {
  type: string;
  expectedRevision: number;
  payload: Record<string, unknown>;
}
export interface Session {
  workspace: Workspace;
  user: { id: string; name: string; email: string } | null;
  mode: "local" | "hosted";
  today: string;
}

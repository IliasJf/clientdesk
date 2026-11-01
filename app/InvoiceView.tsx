import type { Invoice, Payment } from "../lib/desk-types";
import { dateLabel, invoiceTotals, lineTotal, money } from "../lib/desk-domain";
export default function InvoiceView({
  invoice: i,
  payments,
}: {
  invoice: Invoice;
  payments: Payment[];
}) {
  const t = invoiceTotals(i, payments);
  return (
    <article className="invoice-paper">
      <header className="paper-header">
        <div>
          <strong>{i.seller.name}</strong>
          <p>{i.seller.email}</p>
          <p className="multiline">{i.seller.address}</p>
        </div>
        <div>
          <span>
            {i.stage === "draft"
              ? "Draft invoice"
              : i.stage === "void"
                ? "Void invoice"
                : "Invoice"}
          </span>
          <h2>{i.number}</h2>
        </div>
      </header>
      <div className="paper-parties">
        <div>
          <span className="muted">Bill to</span>
          <strong>{i.billTo.company || i.billTo.name}</strong>
          <p>{i.billTo.name}</p>
          <p>{i.billTo.email}</p>
          <p className="multiline">{i.billTo.address}</p>
        </div>
        <dl>
          <div>
            <dt>Invoice date</dt>
            <dd>{dateLabel(i.date)}</dd>
          </div>
          <div>
            <dt>Due date</dt>
            <dd>{dateLabel(i.dueDate)}</dd>
          </div>
          <div>
            <dt>Currency</dt>
            <dd>{i.currency}</dd>
          </div>
        </dl>
      </div>
      <div className="paper-table-wrap">
        <table className="paper-table">
          <thead>
            <tr>
              <th>Description</th>
              <th className="num">Qty</th>
              <th className="num">Rate</th>
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {i.items.map((l) => (
              <tr key={l.id}>
                <td>{l.description}</td>
                <td className="num">{(l.quantity / 100).toFixed(2)}</td>
                <td className="num">{money(l.rate, i.currency)}</td>
                <td className="num">{money(lineTotal(l), i.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="paper-totals">
        <p>
          <span>Subtotal</span>
          <span>{money(t.subtotal, i.currency)}</span>
        </p>
        {t.discount > 0 && (
          <p>
            <span>Discount</span>
            <span>−{money(t.discount, i.currency)}</span>
          </p>
        )}
        {i.taxBps > 0 && (
          <p>
            <span>Tax ({(i.taxBps / 100).toFixed(2)}%)</span>
            <span>{money(t.tax, i.currency)}</span>
          </p>
        )}
        <p className="paper-invoice-total">
          <span>Invoice total</span>
          <strong>{money(t.total, i.currency)}</strong>
        </p>
        {t.paid > 0 && (
          <p>
            <span>Payments recorded</span>
            <span>−{money(t.paid, i.currency)}</span>
          </p>
        )}
        <p className="paper-balance">
          <span>Balance due</span>
          <strong>
            {money(i.stage === "void" ? 0 : t.balance, i.currency)}
          </strong>
        </p>
      </div>
      {i.notes && (
        <section className="paper-note">
          <h3>Notes</h3>
          <p className="multiline">{i.notes}</p>
        </section>
      )}
      {i.seller.instructions && (
        <section className="paper-note">
          <h3>Payment instructions</h3>
          <p className="multiline">{i.seller.instructions}</p>
        </section>
      )}
      <footer>Prepared with ClientDesk</footer>
    </article>
  );
}

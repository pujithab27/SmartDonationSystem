import { categories, money } from "../../lib/data";
import { Metric } from "../ui";
export default function Analytics({ data }) {
  const total = data.donations.reduce((s, d) => s + d.amount, 0);
  return (
    <>
      <div className="metric-grid">
        <Metric
          label="Recorded pledges"
          value={money(total)}
          detail="Recorded contribution totals"
        />
        <Metric
          label="Contributions"
          value={data.donations.length}
          icon="receipt"
        />
        <Metric
          label="Verified organizations"
          value={data.ngos.filter((n) => n.status === "Verified").length}
          icon="shield"
        />
        <Metric
          label="Active campaigns"
          value={data.requests.filter((c) => c.status === "Active").length}
          icon="leaf"
        />
      </div>
      <div className="panel">
        <h2>Giving by cause</h2>
        <p>
          Distribution of recorded pledges, based on campaign category.
        </p>
        {categories.map((category) => {
          const ids = new Set(
            data.requests
              .filter((c) => c.category === category)
              .map((c) => c.id),
          );
          const sum = data.donations
            .filter((d) => ids.has(d.requestId))
            .reduce((s, d) => s + d.amount, 0);
          return (
            <div className="chart-row" key={category}>
              <span>{category}</span>
              <div className="progress-track">
                <span
                  style={{ width: `${total ? (sum / total) * 100 : 0}%` }}
                />
              </div>
              <strong>{money(sum)}</strong>
            </div>
          );
        })}
        <p className="report-footer">
          Calculated from recorded pledges. These figures do not
          represent collected payments or verified social outcomes.
        </p>
      </div>
    </>
  );
}

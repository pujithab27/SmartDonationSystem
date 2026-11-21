import Icon from "./Icon";
export function LoadingCards({ label = "Loading community content" }) {
  return (
    <div role="status">
      <span className="sr-only">{label}</span>
      <div className="loading-cards" aria-hidden="true">
        {[0, 1, 2].map((index) => <div className="loading-card" key={index}><div /><span /><strong /><p /><i /></div>)}
      </div>
    </div>
  );
}
export function Badge({ children, tone = "green" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function Status({ value }) {
  const tone = ["Verified", "Active", "Completed", "Fulfilled"].includes(value)
    ? "green"
    : value === "Rejected"
      ? "red"
      : ["Pickup scheduled", "Partly delivered", "Partly fulfilled"].includes(value)
        ? "blue"
      : value?.includes("Pending") || value === "Awaiting delivery"
        ? "orange"
        : "neutral";
  return <Badge tone={tone}>{value}</Badge>;
}
export function Notice({ children, error = false }) {
  return (
    <div
      className={`notice ${error ? "notice-error" : ""}`}
      role={error ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
export function EmptyState({ title = "Nothing here just yet", children }) {
  return (
    <div className="empty-state">
      <Icon name="leaf" size={34} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function SectionHeading({ eyebrow, title, children, action }) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
        {children && <p>{children}</p>}
      </div>
      {action}
    </div>
  );
}
export function Progress({ campaign }) {
  const value = Math.min(
    100,
    Math.round((100 * campaign.raised) / campaign.need),
  );
  return (
    <div
      className="progress-track"
      role="progressbar"
      aria-label="Campaign funding progress"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${value}%` }} />
    </div>
  );
}
export function Metric({ label, value, detail, icon = "chart" }) {
  return (
    <div className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <Icon name={icon} size={19} />
      </div>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}

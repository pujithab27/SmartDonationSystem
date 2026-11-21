import { quantityLabel } from "../lib/itemExchange";
import Icon from "./Icon";
import { deliveryLocation, formatItemQuantity, requestProgress } from "../lib/itemRequests";

export default function ItemRequestSummary({ request, children, updates, highlighted = false }) {
  const progress = requestProgress(request);
  const itemRows = (items) => <ul className="goods-request-items">{items.map((item) => (
    <li key={item.itemId} className="request-progress-item"><div><span>{item.name}</span><strong>{quantityLabel(item.fulfilled || 0, item.unit)} of {formatItemQuantity(item)} received</strong></div><small>{quantityLabel(item.remaining ?? item.quantity, item.unit)} available to match{Number(item.reserved) > 0 ? ` · ${quantityLabel(item.reserved, item.unit)} reserved` : ""}</small></li>
  ))}</ul>;
  return (
    <article className={`goods-request-card${highlighted ? " just-saved" : ""}`}>
      <header><span className={`goods-status ${request.status.toLowerCase()}`}><i />{progress.status}</span>
        <span className="goods-request-id">REQUEST #{String(request.id).padStart(3, "0")}</span></header>
      <h3>{request.title}</h3>{request.priority === "High" && <span className="badge badge-orange">High priority</span>}
      <p className="request-count-summary">{request.items.filter((item) => Number(item.fulfilled || 0) >= Number(item.quantity)).length} of {request.items.length} requested item types fully received</p>
      {itemRows(request.items.slice(0, 4))}
      {request.items.length > 4 && <details className="goods-more-items"><summary>View {request.items.length - 4} more {request.items.length === 5 ? "item" : "items"}</summary>{itemRows(request.items.slice(4))}</details>}
      <div className="goods-delivery"><Icon name="pin" size={18} /><div><strong>NGO delivery location</strong><p>{deliveryLocation(request)}</p></div></div>
      {request.contactPhone && <p className="goods-due"><Icon name="phone" size={15}/><a href={`tel:${request.contactPhone}`}>{request.contactPhone}</a></p>}
      {request.neededBy && <p className="goods-due"><Icon name="clock" size={15} /> Needed by {new Date(`${request.neededBy}T12:00:00`).toLocaleDateString("en-IN", {day: "numeric", month: "short", year: "numeric"})}</p>}
      {request.notes && <p className="goods-request-notes">{request.notes}</p>}
      {updates}
      {children && <footer className="goods-card-actions">{children}</footer>}
    </article>
  );
}

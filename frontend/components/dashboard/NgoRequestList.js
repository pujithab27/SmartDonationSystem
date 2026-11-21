import Link from "next/link";
import Icon from "../Icon";
import { requestProgress } from "../../lib/itemRequests";

export default function NgoRequestList({ requests, matches = [] }) {
  return <div className="request-register">{requests.map((entry) => {
    const deliveries = matches.filter((match) => String(match.requestId) === String(entry.id));
    const scheduled = deliveries.filter((match) => match.status === "Pickup scheduled").length;
    const pending = deliveries.filter((match) => match.status === "Pending").length;
    const received = deliveries.filter((match) => match.status === "Completed").length;
    const progress = requestProgress(entry);
    const update = scheduled ? `${scheduled} pickup${scheduled === 1 ? "" : "s"} scheduled` : pending ? `${pending} accepted · Awaiting pickup time` : received ? `${received} delivery receipt${received === 1 ? "" : "s"} confirmed` : entry.status === "Closed" ? "Closed to new donations" : "Waiting for a donor";
    return <Link className="request-register-row" key={entry.id} href={`/dashboard/ngo/requests?request=${entry.id}`}>
      <span className="request-register-icon"><Icon name="box" size={20}/></span>
      <div className="request-register-name"><span className="request-register-id">REQUEST #{entry.id}</span><h3>{entry.title}</h3><p>{entry.items.slice(0, 3).map((item) => item.name).join(", ")}{entry.items.length > 3 ? ` +${entry.items.length - 3} more` : ""}</p></div>
      <div className="request-register-progress"><span>{progress.status}</span><small>{entry.items.filter((item) => Number(item.fulfilled || 0) >= Number(item.quantity)).length} of {entry.items.length} item types received</small></div>
      <div className={`request-register-next ${scheduled ? "ready" : ""}`}><strong>{update}</strong><small>View request <span aria-hidden="true">→</span></small></div>
    </Link>;
  })}</div>;
}

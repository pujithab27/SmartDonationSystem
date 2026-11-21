import Link from "next/link";
import { quantityLabel } from "../../lib/itemExchange";

export function ngoDeliveryStep(match) {
  if (match.status === "Completed") return {title: "Received", detail: "Your NGO confirmed receipt. This delivery is complete.", action: "View receipt"};
  if (match.status === "Cancelled") return {title: "Cancelled", detail: "This donation is no longer reserved. Check your request for remaining needs.", action: "View history"};
  if (match.status === "Pickup scheduled") return {title: "Ready for collection", detail: "Collect the items at the scheduled time. Confirm receipt with a photo only after receiving them.", action: "View pickup & confirm receipt"};
  return {title: "Donor accepted", detail: "Items are reserved for your NGO. Waiting for the donor to set a pickup date and address.", action: "View donation & contact donor"};
}

export default function NgoDeliveryUpdates({ matches = [], requestId, closed = false }) {
  const entries = requestId == null ? matches : matches.filter((match) => String(match.requestId) === String(requestId));
  return <section className="ngo-delivery-updates" aria-label="Donation updates">
    <h3>{requestId == null ? "Incoming donations & next steps" : "Donation updates for this request"}</h3>
    {!entries.length ? <p className="ngo-delivery-empty">{closed ? "This request is closed. Reopen it if you still need items." : "Waiting for a donor to accept. Accepted donations and pickup updates will appear here."}</p> : <div className="ngo-delivery-list">{entries.map((match) => {
      const step = ngoDeliveryStep(match);
      return <article className={`ngo-delivery-update ${match.status === "Completed" ? "received" : ""}`} key={match.id}>
        <div className="ngo-delivery-heading"><strong>{step.title}</strong><span>Donation #{match.id}</span></div>
        <p><strong>{match.donorName}</strong> · {quantityLabel(match.quantity, match.unit)} {match.name}</p>
        {requestId == null && match.requestTitle && <p>For: {match.requestTitle}</p>}
        <p>{step.detail}</p>
        {match.status === "Pickup scheduled" && <div className="ngo-pickup-summary"><strong>{match.pickupAt ? new Date(match.pickupAt).toLocaleString("en-IN", {dateStyle: "medium", timeStyle: "short"}) : "Pickup time not recorded"}</strong><span>{[match.pickupAddress, match.pickupCity, match.pickupState, match.pickupPincode].filter(Boolean).join(", ")}</span></div>}
        <Link className="btn btn-outline btn-small" href={`/dashboard/ngo/matches?match=${match.id}`}>{step.action}</Link>
      </article>;
    })}</div>}
  </section>;
}

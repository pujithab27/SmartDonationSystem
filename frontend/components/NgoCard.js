import Link from "next/link";
import Icon from "./Icon";
export default function NgoCard({ ngo, requests, expanded = false, onToggle, children }) {
  const items = requests ? [...new Set(requests.flatMap((request) => request.items.map((item) => item.name)))] : [];
  return (
    <article className={`ngo-card${requests ? " ngo-directory-card" : ""}${expanded ? " expanded" : ""}`}>
      <div className="ngo-card-top">
        <span className={`ngo-monogram ${ngo.color || "sage"}`}>
          {ngo.initials ||
            ngo.ngoName
              .split(" ")
              .map((n) => n[0])
              .slice(0, 2)
              .join("")}
        </span>
        <span className="verified-label">
          <Icon name="shield" size={14} /> Account approved
        </span>
      </div>
      <h3>{ngo.ngoName}</h3>
      {requests && <div className="ngo-directory-location"><Icon name="pin" size={15} />{[ngo.city, ngo.state].filter(Boolean).join(", ") || "Location not provided"}</div>}
      <p>
        {ngo.description ||
          "Working with communities to turn generosity into meaningful support."}
      </p>
      {requests ? <><div className="ngo-needed-tags">{items.slice(0, 4).map((item) => <span key={item}>{item}</span>)}{items.length > 4 && <span>+{items.length - 4} more</span>}</div><button type="button" className="ngo-view-requests" onClick={onToggle} aria-expanded={expanded} aria-controls={`ngo-requests-${ngo.id}`}>{expanded ? "Hide requests" : `View requests (${requests.length})`}<Icon name={expanded ? "close" : "arrow"} size={17} /></button><div id={`ngo-requests-${ngo.id}`} hidden={!expanded}>{children}</div></> : <Link
        href={`/ngos/${encodeURIComponent(ngo.email)}`}
        className="text-link"
      >
        Meet the organization <Icon name="diagonal" size={16} />
      </Link>
      }
    </article>
  );
}

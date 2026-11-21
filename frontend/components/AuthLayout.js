import Link from "next/link";
import Brand from "./Brand";
import Icon from "./Icon";
export default function AuthLayout({ role, title, subtitle, children, variant }) {
  return (
    <main className={`auth-shell auth-${role}${variant ? ` auth-${variant}` : ""}`}>
      <aside className="auth-side">
        <Brand light />
        <div className="auth-story">
          <span className="eyebrow">
            {role === "admin"
              ? "THOUGHTFUL STEWARDSHIP"
              : "A LITTLE CARE GOES A LONG WAY"}
          </span>
          <h1>
            {role === "donor" ? (
              <>
                Your kindness.
                <br />
                <em>Their tomorrow.</em>
              </>
            ) : role === "ngo" ? (
              <>
                Your mission.
                <br />
                <em>Our shared future.</em>
              </>
            ) : (
              <>
                Build trust.
                <br />
                <em>Inspire change.</em>
              </>
            )}
          </h1>
          <p>
            {role === "donor"
              ? "There is a cause for every kind heart. Find yours and be part of something meaningful."
              : role === "ngo"
                ? "Bring your community’s story to people who care. Together, turn generosity into possibility."
                : "Support a transparent giving community through thoughtful organization and campaign reviews."}
          </p>
          <img
            src={
              role === "ngo" ? "/images/community.jpg" : "/images/children.jpg"
            }
            alt={
              role === "ngo"
                ? "Volunteers sharing community supplies"
                : "Children smiling together"
            }
            className="auth-photo"
          />
          <div className="auth-image-caption">
            <Icon name="heart" size={17} /> Connected by care. United by
            purpose.
          </div>
        </div>
        <span className="tiny">
          Smart Donation System · A kinder world starts with us.
        </span>
      </aside>
      <section className="auth-main">
        <div className="form-card">
          <Link href="/" className="back-link">
            ← Back to Smart Donation System
          </Link>
          <div className="form-header">
            <span
              className={`badge badge-${role === "ngo" ? "orange" : role === "admin" ? "neutral" : "green"}`}
            >
              {role === "ngo" ? "NGO" : role === "admin" ? "ADMIN" : "DONOR"}{" "}
              PORTAL
            </span>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          {children}
          <p className="auth-disclaimer">
            Donor and NGO accounts require administrator approval before signing in.
          </p>
        </div>
      </section>
    </main>
  );
}

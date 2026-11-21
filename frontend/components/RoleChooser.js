import Link from "next/link";
import Icon from "./Icon";
import PublicLayout from "./PublicLayout";
export default function RoleChooser({ signup = false }) {
  return (
    <PublicLayout>
      <section className="container section chooser">
        <span className="eyebrow">THERE’S A PLACE FOR EVERY KIND HEART</span>
        <h1>
          {signup ? (
            <>
              Let’s make <em>good happen.</em>
            </>
          ) : (
            <>
              Welcome to <em>Smart Donation System.</em>
            </>
          )}
        </h1>
        <p>
          {signup
            ? "Choose how you’d like to be part of the change."
            : "Your next act of kindness starts here. Choose your workspace."}
        </p>
        <div className="role-grid">
          {[
            [
              "donor",
              "Give with purpose",
              "Discover causes, support communities, and follow your giving journey.",
              "heart",
            ],
            [
              "ngo",
              "Grow your mission",
              "Request useful items, connect with donors, and confirm deliveries.",
              "building",
            ],
          ].map(([role, title, text, icon]) => (
            <Link
              href={`/${role}/${signup ? "signup" : "login"}`}
              key={role}
              className="role-card"
            >
              <span className="role-card-icon">
                <Icon name={icon} size={28} />
              </span>
              <span className="eyebrow">
                {role === "donor" ? "FOR DONORS" : "FOR ORGANIZATIONS"}
              </span>
              <h2>{title}</h2>
              <p>{text}</p>
              <span className="text-link">
                {signup ? "Create an account" : "Sign in"} <Icon name="arrow" />
              </span>
            </Link>
          ))}
        </div>
        {!signup && (
          <Link className="muted text-link" href="/admin/login">
            Platform administrator? Admin access{" "}
            <Icon name="diagonal" size={15} />
          </Link>
        )}
      </section>
    </PublicLayout>
  );
}

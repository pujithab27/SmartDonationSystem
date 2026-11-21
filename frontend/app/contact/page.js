import PublicLayout from "../../components/PublicLayout";
import ContactForm from "../../components/ContactForm";
import Link from "next/link";
export const metadata = { title: "Contact us" };
export default function Contact() {
  return (
    <PublicLayout>
      <div className="container">
        <header className="page-intro">
          <span className="eyebrow">GOOD THINGS START WITH A CONVERSATION</span>
          <h1>
            We’re here
            <br />
            <em>to connect.</em>
          </h1>
        </header>
        <div className="contact-layout">
          <div>
            <h2>
              A question, an idea,
              <br />
              or a cause worth sharing?
            </h2>
            <p>
              Send a question or share feedback. Your message reaches the administrator inbox for review.
            </p>
            <div className="info-panel">
              <h3>Looking for a little guidance?</h3>
              <p>
                Our giving guide explains account approval, item donations, NGO requests, pickups and receipt confirmation.
              </p>
              <Link
                className="text-link"
                href="/how-it-works"
                style={{ marginTop: 20 }}
              >
                Read the giving guide →
              </Link>
            </div>
          </div>
          <ContactForm />
        </div>
      </div>
    </PublicLayout>
  );
}

import PublicLayout from "../../components/PublicLayout";
import HowItWorks from "../../components/HowItWorks";
import { JoinBanner } from "../../components/SiteFooter";
export const metadata = { title: "How it works" };
const faqs = [
  [
    "What can I donate?",
    "Offer supported items such as food, clothing, books and household essentials. This workflow tracks item offers and NGO receipts; it does not collect payments.",
  ],
  [
    "How are NGOs verified?",
    "An administrator reviews the submitted organization details before granting account access. Account approval is an access decision, not independent certification of charity status.",
  ],
  [
    "When can an NGO request items?",
    "After account approval, an NGO can request items with quantities and a delivery address. Donors match their offers, schedule pickup, and the NGO confirms physical receipt with a proof photo.",
  ],
  [
    "Where is my information stored?",
    "Your profile, item offers, requests and delivery history are saved to your account. Sign in to access your own workspace.",
  ],
  [
    "How is donor impact counted?",
    "Impact counts deliveries confirmed by the receiving NGO. Pending and cancelled matches do not count. Item quantities are grouped separately by item and unit.",
  ],
];
export default function How() {
  return (
    <PublicLayout>
      <div className="container">
        <header className="page-intro">
          <span className="eyebrow">FROM INTENTION TO ACTION</span>
          <h1>
            A simple path
            <br />
            <em>to doing a little good.</em>
          </h1>
          <p>
            Whether you’re here to give or to grow your organization’s mission,
            your journey starts with a connection.
          </p>
        </header>
      </div>
      <HowItWorks />
      <section className="container faq-list">
        <h2>
          A few things
          <br />
          <em>you might be wondering.</em>
        </h2>
        {faqs.map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </section>
      <JoinBanner />
    </PublicLayout>
  );
}

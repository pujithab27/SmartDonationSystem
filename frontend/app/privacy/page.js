import PublicLayout from "../../components/PublicLayout";
export const metadata = { title: "Privacy & data" };
export default function Privacy() {
  return <PublicLayout><article className="container content-page">
    <span className="eyebrow">YOUR INFORMATION</span>
    <h1>Your privacy.<br/><em>Your data.</em></h1>
    <p>Smart Donation System uses account and donation information to connect donors with NGOs and track the delivery of useful items.</p>
    <h2>What the platform stores</h2>
    <p>Profiles, item offers, NGO requests, pickup details, delivery photos, receipt notes, settings and messages are stored on the application server. Passwords are hashed. Session cookies support sign-in, and login attempts are recorded without storing submitted passwords.</p>
    <h2>Who can see it</h2>
    <p>You can access your own account and donation activity. Approved donors can browse open NGO needs. Matched donors and NGOs can see the contact, pickup and receipt details needed to coordinate a delivery. Administrators can review accounts, requests, donations, delivery records and contact messages.</p>
    <h2>Optional photo and voice input</h2>
    <p>Photos used for item suggestions and receipt comparisons are sent through the server to Google Gemini. Voice input may use your browser's speech service or the configured transcription service. Review suggestions before saving. You can type details instead.</p>
    <h2>Managing your information</h2>
    <p>You can update your profile in your workspace. Signing out ends your session; clearing browser storage does not delete server records. Contact the administrator to request assistance with your information or its removal.</p>
  </article></PublicLayout>;
}

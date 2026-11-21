import PublicLayout from "../../components/PublicLayout";
export const metadata = { title: "Terms of use" };
export default function Terms() {
  return <PublicLayout><article className="container content-page">
    <span className="eyebrow">USING THE PLATFORM</span>
    <h1>Thoughtful giving.<br/><em>Clear responsibilities.</em></h1>
    <h2>Accounts and access</h2>
    <p>Provide accurate contact and organization details. Donor and NGO accounts require administrator approval. Keep your sign-in details private and contact the administrator if you notice unauthorized activity.</p>
    <h2>Item donations and requests</h2>
    <p>Describe items, quantities and condition accurately. Donors and NGOs coordinate pickup and delivery using their matched records. Receiving NGOs should confirm only items physically received and provide accurate receipt photos and notes.</p>
    <h2>Records and approval</h2>
    <p>Account approval grants platform access; it is not independent certification of an organization's legal or charity status. Delivery records document item exchanges. They are not payment confirmations or tax certificates.</p>
    <h2>Photos and shared information</h2>
    <p>Upload content you have permission to share and include only information needed for the donation. General photography on the site does not identify recipients of a particular donation.</p>
    <h2>Service and support</h2>
    <p>Features may change and service may be interrupted. Retain copies of records you need and contact the administrator about account, donation or delivery issues.</p>
  </article></PublicLayout>;
}

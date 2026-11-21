import Link from "next/link";
import Image from "next/image";
import PublicLayout from "../../components/PublicLayout";
import Icon from "../../components/Icon";
export const metadata = { title: "About us" };
export default function About() {
  return (
    <PublicLayout>
      <div className="about-page container">
        <header className="about-heading"><span className="petal-label label-lavender">About Smart Donation System</span><h1>Good intentions.<br />Clearer connections.</h1><p>A place for donors and community organizations to find each other, share what is needed, and take the next step.</p></header>
        <section className="about-story" aria-labelledby="about-story-title">
          <div className="about-photo"><Image src="/images/community.jpg" alt="Volunteers working together on community supplies" fill sizes="(max-width: 760px) 100vw, 45vw" /><span>Illustrative photography</span></div>
          <div><span className="eyebrow">THE IDEA BEHIND THE PLATFORM</span><h2 id="about-story-title">Less searching.<br />More understanding.</h2><p>Giving starts with a simple question: what would actually help? NGOs can publish the items they need, the quantities, and the location where they receive them.</p><p>Approved donors can explore those requests, learn about organizations, and track their item donations from offer to receipt.</p><Link href="/how-it-works" className="text-link">See how it works <Icon name="arrow" size={18} /></Link></div>
        </section>
        <details className="optional-mission"><summary><span><small>Read more, if you’re curious</small>Our mission & vision</span><Icon name="plus" size={22} /></summary><div><article><h3>Our mission</h3><p>Make community needs easier to understand and give donors a practical way to find organizations they want to support.</p></article><article><h3>Our vision</h3><p>A more connected giving community, where useful resources can reach the people who need them.</p></article></div></details>
        <section className="about-trust"><Icon name="shield" size={25} /><div><h2>Clear records. Accountable giving.</h2><p>Administrators review donor and NGO accounts before access is granted. Donors offer useful items, NGOs publish their needs, and both can follow pickups and confirmed deliveries. Administrators can track activity and review supporting records.</p></div><Link href="/privacy" className="text-link">Privacy & data <Icon name="diagonal" size={17} /></Link></section>
      </div>
    </PublicLayout>
  );
}

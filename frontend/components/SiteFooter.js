import Link from "next/link";
import Brand from "./Brand";
import Icon from "./Icon";
export function JoinBanner() {
  return <section className="join-banner container" data-reveal><div><span className="eyebrow">GOOD BEGINS WITH YOU</span><h2>A little kindness.<br />A brighter tomorrow.</h2></div><div><p>Find an NGO that needs what you can share.</p><Link href="/ngos" className="round-link">Meet NGOs <span><Icon name="diagonal" size={18} /></span></Link></div></section>;
}
export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-intro"><Brand /><p>A little closer to each other.<br />A little kinder to the world.</p><Link href="/contact" className="footer-contact"><Icon name="mail" size={17} /> Get in touch <Icon name="diagonal" size={15} /></Link></div>
        <div><h3>Explore</h3><Link href="/about">Our story</Link><Link href="/ngos">Our NGO community</Link><Link href="/how-it-works">How it works</Link></div>
        <div><h3>Get involved</h3><Link href="/donor/signup">Become a donor</Link><Link href="/ngo/signup">Register your NGO</Link><Link href="/donor/login">Donor login</Link><Link href="/ngo/login">NGO login</Link></div>
        <div><h3>Good to know</h3><Link href="/contact">Contact us</Link><Link href="/privacy">Privacy & data</Link><Link href="/terms">Terms of use</Link><Link href="/admin/login">Admin access</Link></div>
      </div>
      <div className="container footer-wordmark" aria-hidden="true">Giving brings us closer<span>✳</span></div>
      <div className="container footer-bottom"><span>© {new Date().getFullYear()} Smart Donation System</span><span>Connecting donors and NGOs through useful items</span><span>Made for a kinder world <Icon name="heart" size={14} /></span></div>
    </footer>
  );
}

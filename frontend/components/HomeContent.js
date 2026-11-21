"use client";
import Link from "next/link";
import useAppData from "../lib/useAppData";
import Icon from "./Icon";
import HomeHero from "./HomeHero";
import GivingBoard from "./GivingBoard";
import NgoCard from "./NgoCard";
import RevealOnScroll from "./RevealOnScroll";
import { Notice, LoadingCards, EmptyState } from "./ui";

export default function HomeContent() {
  const { data, session, error, ready } = useAppData();
  const ngos = data.ngos.filter((ngo) => ngo.status === "Verified");
  return (
    <RevealOnScroll className="horizon-home">
      <HomeHero />
      <section className="giving-intro container" id="giving" data-reveal>
        <div className="giving-section-head"><div><span className="petal-label label-blue">What would you like to give?</span><h2>A little from you.<br /><span>A lot for someone.</span></h2></div><p>Choose a category. Find an NGO that needs it. Give everyday essentials a new purpose.</p></div>
        <GivingBoard />
      </section>
      {error && <div className="container"><Notice error>{error}</Notice></div>}
      <section className="home-organizations" data-reveal>
        <div className="container">
          <header className="horizon-section-head"><div><span className="petal-label label-white">Find the people behind the work</span><h2>Your next connection.</h2></div><Link className="text-link" href="/ngos">Search NGOs <Icon name="search" size={18} /></Link></header>
          {!ready ? <LoadingCards label="Loading community organizations" /> : ngos.length ? <div className="ngo-grid">{ngos.slice(0, 3).map((ngo) => <NgoCard key={ngo.email} ngo={ngo} />)}</div> : <EmptyState title="A community taking shape.">Approved NGO profiles will appear here.</EmptyState>}
        </div>
      </section>
    </RevealOnScroll>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Icon from "./Icon";

const quotes = [
  { tagline: "A little care. A world of possibility.", lines: ["Good things happen.", "When we give together."], color: "#245873" },
  { tagline: "Small acts. New possibilities.", lines: ["A little from you.", "A new start for someone."], color: "#77506b" },
  { tagline: "Kindness connects us.", lines: ["Share what you can.", "Help hope grow."], color: "#386457" },
  { tagline: "Together, we can do more.", lines: ["Different people.", "One shared purpose."], color: "#625482" },
];
const quoteDuration = 6500;

export default function HomeHero() {
  const hero = useRef(null);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(true);
  const [inView, setInView] = useState(true);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => { if (preference.matches) setPlaying(false); };
    const updateVisibility = () => setVisible(!document.hidden);
    updatePreference();
    updateVisibility();
    preference.addEventListener("change", updatePreference);
    document.addEventListener("visibilitychange", updateVisibility);
    const observer = "IntersectionObserver" in window
      ? new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.15 })
      : null;
    if (hero.current) observer?.observe(hero.current);
    return () => {
      preference.removeEventListener("change", updatePreference);
      document.removeEventListener("visibilitychange", updateVisibility);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!playing || !visible || !inView) return;
    const timer = window.setTimeout(() => setCurrent((index) => (index + 1) % quotes.length), quoteDuration);
    return () => window.clearTimeout(timer);
  }, [current, playing, visible, inView]);

  return (
    <section ref={hero} className="sky-hero" aria-labelledby="hero-title">
      <Image className="sky-hero-image" src="/images/community-sky.png" alt="Illustrative AI-generated scene of volunteers sharing books and clothing beside a lake" fill sizes="100vw" preload />
      <div className="sky-hero-wash" aria-hidden="true" />
      <div className="hero-light-pass" aria-hidden="true" />
      <div className="sky-hero-copy container">
        <span className="petal-label hero-quote-tagline"><span className="tiny-flower" aria-hidden="true">✳</span><span className="hero-tagline-stack" aria-live="off">{quotes.map((quote, index) => <span key={quote.tagline} className={index === current ? "is-active" : ""} aria-hidden={index !== current}>{quote.tagline}</span>)}</span></span>
        <h1 id="hero-title" className="hero-quote-heading" aria-live="off">{quotes.map((quote, index) => <span key={quote.tagline} className={`hero-quote-slide${index === current ? " is-active" : ""}`} aria-hidden={index !== current} style={{ "--quote-accent": quote.color }}><span className="hero-title-line"><span>{quote.lines[0]}{" "}</span></span><span className="hero-title-line"><span>{quote.lines[1]}</span></span></span>)}</h1>
        <p>Connect what you can give with a community that needs it.<br className="desktop-break" /> A shared meal, a new chapter, a brighter tomorrow.</p>
        <div className="hero-actions">
          <Link href="/ngos" className="round-link">Find an NGO <span><Icon name="diagonal" size={19} /></span></Link>
          <Link href="/ngos" className="hero-secondary">Meet NGOs <Icon name="arrow" size={18} /></Link>
        </div>
        <div className="hero-quote-controls" role="group" aria-label="Hero messages">
          {quotes.map((quote, index) => <button key={quote.tagline} type="button" className="hero-quote-dot" aria-label={`Show message ${index + 1}: ${quote.lines.join(" ")}`} aria-pressed={current === index} onClick={() => { setCurrent(index); setPlaying(false); }}><span aria-hidden="true" /></button>)}
          <button type="button" className="hero-quote-play" aria-label={playing ? "Pause rotating messages" : "Play rotating messages"} onClick={() => setPlaying((value) => !value)}><Icon name={playing ? "pause" : "play"} size={14} /></button>
        </div>
      </div>
      <div className="hero-bottom container">
        <span className="hero-community-note"><Icon name="heart" size={20} /><span>Different people.<br /><strong>One shared purpose.</strong></span></span>
        <a className="hero-scroll" href="#giving"><span>Discover a kinder way to give</span><Icon name="arrow" size={18} /></a>
        <span className="image-note">Illustrative AI-generated scene</span>
      </div>
    </section>
  );
}

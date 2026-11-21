"use client";

import { useEffect, useRef } from "react";

// Progressive enhancement: content remains visible if motion or JS is unavailable.
export default function RevealOnScroll({ children, className = "" }) {
  const root = useRef(null);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches || !("IntersectionObserver" in window)) return;
    const animations = new Set();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        if (preference.matches || !entry.target.animate) continue;
        const animation = entry.target.animate(
          [{ opacity: 0.5, transform: "translateY(20px)" }, { opacity: 1, transform: "translateY(0)" }],
          { duration: 620, easing: "cubic-bezier(.2,.7,.2,1)" },
        );
        animations.add(animation);
        animation.onfinish = () => animations.delete(animation);
      }
    }, { threshold: 0.08 });
    root.current?.querySelectorAll("[data-reveal]").forEach((element) => {
      if (element.getBoundingClientRect().top > window.innerHeight) observer.observe(element);
    });
    const stopMotion = () => { if (preference.matches) { observer.disconnect(); animations.forEach((animation) => animation.cancel()); } };
    preference.addEventListener("change", stopMotion);
    return () => { observer.disconnect(); animations.forEach((animation) => animation.cancel()); preference.removeEventListener("change", stopMotion); };
  }, []);
  return <div ref={root} className={className}>{children}</div>;
}

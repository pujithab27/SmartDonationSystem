"use client";
import { useState } from "react";
import { steps } from "../lib/data";
import { SectionHeading } from "./ui";
export default function HowItWorks() {
  const [role, setRole] = useState("donor");
  return (
    <section className="how-section section container" id="how-it-works" data-reveal>
      <SectionHeading
        eyebrow="A LITTLE CARE. A CLEAR PATH."
        title={
          <>
            Making good happen.
            <br />
            <em>One simple step at a time.</em>
          </>
        }
        action={
          <div className="segmented" role="group" aria-label="Choose your journey">
            <button
              className={role === "donor" ? "active" : ""}
              aria-pressed={role === "donor"}
              onClick={() => setRole("donor")}
            >
              For donors
            </button>
            <button
              className={role === "ngo" ? "active" : ""}
              aria-pressed={role === "ngo"}
              onClick={() => setRole("ngo")}
            >
              For NGOs
            </button>
          </div>
        }
      />
      <div className="steps-grid">
        {steps[role].map(([title, text], i) => (
          <div className="step" key={title}>
            <div className="step-number">
              0{i + 1}
              <span />
            </div>
            <h3>{title}</h3>
            <p>{text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

import Icon from "../Icon";

export default function DonationSteps({ current = 1 }) {
  return <ol className="donation-steps" aria-label="How to donate">
    {["Donation details", "Choose an NGO", "Arrange pickup"].map((label, index) => {
      const step = index + 1;
      return <li key={label} aria-current={step === current ? "step" : undefined} className={step < current ? "complete" : ""}>
        <span>{step < current ? <Icon name="check" size={14}/> : step}</span>{label}
      </li>;
    })}
  </ol>;
}

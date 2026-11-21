import Link from "next/link";
export default function Brand({ light = false }) {
  return (
    <Link
      href="/"
      className={`brand${light ? " light" : ""}`}
      aria-label="Smart Donation System home"
    >
      <svg
        width="35"
        height="36"
        viewBox="0 0 36 36"
        fill="none"
        aria-hidden="true"
      >
        <path d="M18 18C8 17 4 10 9 6c5-4 10 1 9 12Z" fill="currentColor" />
        <path d="M18 18c0-10 8-15 12-9 4 5-2 10-12 9Z" fill="currentColor" />
        <path d="M18 18c10 0 14 8 9 12-5 4-10-2-9-12Z" fill="currentColor" />
        <circle cx="17.5" cy="18" r="3" fill="#fffdf6" />
      </svg>
      <span className="brand-name">
        <span>Smart Donation</span>{" "}
        <span className="brand-subtitle">System</span>
      </span>
    </Link>
  );
}

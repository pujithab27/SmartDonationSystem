"use client";
import Link from "next/link";
export default function ErrorPage({ reset }) {
  return (
    <main className="container section chooser">
      <h1>
        A small pause
        <br />
        <em>in the journey.</em>
      </h1>
      <p>Something went wrong while opening this page. Please try again.</p>
      <div className="button-row" style={{ justifyContent: "center" }}>
        <button className="btn btn-primary" onClick={reset}>
          Try again
        </button>
        <Link className="btn btn-outline" href="/">
          Back home
        </Link>
      </div>
    </main>
  );
}

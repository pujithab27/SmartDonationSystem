import Link from "next/link";
import PublicLayout from "../components/PublicLayout";
export default function NotFound() {
  return (
    <PublicLayout>
      <section className="container section chooser">
        <span className="eyebrow">LET’S FIND YOUR WAY</span>
        <h1>
          This page took
          <br />
          <em>a different path.</em>
        </h1>
        <p>
          The page you’re looking for isn’t here. There’s still plenty of good
          to discover.
        </p>
        <Link href="/campaigns" className="btn btn-primary">
          Explore campaigns →
        </Link>
      </section>
    </PublicLayout>
  );
}

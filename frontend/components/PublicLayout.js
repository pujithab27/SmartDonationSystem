import SiteHeader from "./SiteHeader";
import SiteFooter from "./SiteFooter";
export default function PublicLayout({ children }) {
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main-content">{children}</main>
      <SiteFooter />
    </>
  );
}

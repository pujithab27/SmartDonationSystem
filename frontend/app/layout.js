import "./globals.css";
import "./admin-access.css";
import "./donation-requests.css";
import "./horizon.css";
import "./motion.css";
import "leaflet/dist/leaflet.css";
import "./exchange.css";
import "./voice-camera.css";
import "./location-picker.css";
import "./community-workspace.css";
import "./impact-tracking.css";
import "./admin-directory.css";
import "./workflow.css";
import { Manrope } from "next/font/google";
import HomeScrollReset from "../components/HomeScrollReset";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
});

export const metadata = {
  title: {
    default: "Smart Donation System — A little kindness. A brighter tomorrow.",
    template: "%s | Smart Donation System",
  },
  description:
    "Share useful items, meet NGOs, and track donations from offer to confirmed receipt.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={manrope.variable} data-scroll-behavior="smooth">
      <body>{children}<HomeScrollReset /></body>
    </html>
  );
}

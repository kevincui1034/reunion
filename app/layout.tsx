import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reunion — Intent Tracer",
  description:
    "Watch Reunion detect a group chat's intent to gather, reconcile calendars, and draft a weekend itinerary — in real time.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="grain min-h-screen antialiased">{children}</body>
    </html>
  );
}

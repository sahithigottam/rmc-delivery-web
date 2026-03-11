import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RMC Delivery – Route Optimizer",
  description: "Real-time route optimization for RMC delivery trucks",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-surface text-on-surface">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "./components/Sidebar";
import LayoutShell from "./components/LayoutShell";
import DemoModeProvider from "./components/DemoModeProvider";

export const metadata: Metadata = {
  title: "AI Fine-Tuning Orchestrator",
  description: "Domain SLM builder and intelligent model recommender",
};

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-bg text-t1 min-h-screen font-sora">
        {DEMO_MODE && <DemoModeProvider />}
        <Sidebar />
        <LayoutShell>
          {children}
        </LayoutShell>
      </body>
    </html>
  );
}

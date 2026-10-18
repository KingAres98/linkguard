import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Dashboard from "@/components/Dashboard";
import SiteHeader from "@/components/SiteHeader";
import { getDashboardMode } from "@/lib/dashboard/mode";
import SiteFooter from "@/components/SiteFooter";

// Read the mode on every request instead of freezing it at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard \u00B7 LinkGuard",
  robots: { index: false, follow: false },
};

export default function DashboardPage() {
  const mode = getDashboardMode();
  if (mode === "off") notFound();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-8 sm:px-10">
      <SiteHeader current="dashboard" showDashboardLink />
      <main className="w-full max-w-4xl flex-1 py-10">
        <Dashboard mode={mode} />
            </main>
      <SiteFooter />
    </div>
  );
}
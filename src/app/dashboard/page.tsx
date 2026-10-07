import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Dashboard from "@/components/Dashboard";
import { isDashboardEnabled } from "@/lib/dashboard/guard";

// Read the flag on every request instead of freezing it at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard · LinkGuard",
  robots: { index: false, follow: false },
};

export default function DashboardPage() {
  if (!isDashboardEnabled()) notFound();

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-6 py-12">
      <Dashboard />
    </main>
  );
}
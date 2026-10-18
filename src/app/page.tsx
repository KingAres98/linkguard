import ScanForm from "@/components/ScanForm";
import SiteHeader from "@/components/SiteHeader";
import { getDashboardMode } from "@/lib/dashboard/mode";
import SiteFooter from "@/components/SiteFooter";

export default function Home() {
  // Read when the site is built. A self-hosted copy that changes its
  // dashboard setting should rebuild so this link follows it.
  const showDashboardLink = getDashboardMode() !== "off";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-8 sm:px-10">
      <SiteHeader current="scan" showDashboardLink={showDashboardLink} />

      <main className="flex flex-1 flex-col justify-center gap-6 py-14">
        <p className="font-mono text-xs tracking-[0.2em] text-accent">
          [ EVIDENCE, NOT VERDICTS ]
        </p>

        <h1 className="font-display text-5xl leading-[1.02] font-bold tracking-tight sm:text-7xl">
          Look{" "}
          <span className="text-accent [text-shadow:0_0_24px_rgb(0_230_255/0.45)]">beneath</span>{" "}
          the link.
        </h1>

        <p className="max-w-2xl text-lg leading-relaxed text-muted">
          Paste a web address. LinkGuard reads its certificate, headers, DNS
          records and public threat lists, then shows you the evidence. It
          never says a site is safe.
        </p>

        <ScanForm />

        <p className="mt-6 max-w-xl text-xs text-muted">
          LinkGuard reports observable security properties. It does not decide
          whether a website is &quot;safe.&quot;
        </p>
         </main>
          <SiteFooter />
    </div>
  );
}
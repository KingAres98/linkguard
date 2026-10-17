import Link from "next/link";
import Logo from "@/components/Logo";

type SiteHeaderProps = {
  /** Which page is showing, so its nav link can be marked. */
  current: "scan" | "dashboard";
  /** The Dashboard link only appears when the dashboard is switched on. */
  showDashboardLink: boolean;
};

export default function SiteHeader({ current, showDashboardLink }: SiteHeaderProps) {
  const base = "transition-colors hover:text-accent";
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <Link href="/" aria-label="LinkGuard home" className="flex items-center gap-3">
        <Logo size={40} glow decorative />
        <span className="font-display text-2xl leading-none tracking-wide">
          <span className="font-medium">link</span>
          <span className="font-bold text-signal">guard</span>
        </span>
      </Link>

      <nav aria-label="Main" className="flex gap-6 font-mono text-xs tracking-wider text-muted">
        <Link
          href="/"
          aria-current={current === "scan" ? "page" : undefined}
          className={`${base} ${current === "scan" ? "text-accent" : ""}`}
        >
                    <span aria-hidden="true">{"// "}</span>SCAN
        </Link>
        {showDashboardLink && (
          <Link
            href="/dashboard"
            aria-current={current === "dashboard" ? "page" : undefined}
            className={`${base} ${current === "dashboard" ? "text-accent" : ""}`}
          >
                        <span aria-hidden="true">{"// "}</span>DASHBOARD
          </Link>
        )}
      </nav>
    </header>
  );
}
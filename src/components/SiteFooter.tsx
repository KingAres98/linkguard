const REPO = "https://github.com/KingAres98/linkguard";

const LINK = "underline decoration-edge underline-offset-4 transition-colors hover:text-accent";

export default function SiteFooter() {
  return (
    <footer className="mt-10 border-t border-line pt-5 pb-2 font-mono text-xs leading-relaxed text-muted">
      <p>
        Threat data:{" "}
        <a href="https://github.com/mitchellkrogza/Phishing.Database" className={LINK}>
          Phishing.Database
        </a>{" "}
        (MIT) and{" "}
        <a href="https://urlhaus.abuse.ch" className={LINK}>
          URLhaus by abuse.ch
        </a>
        . A listing means a third party reported the site; it is shown as evidence, not a verdict.
      </p>
      <p className="mt-2">
        <a href={REPO} className={LINK}>
          Source code
        </a>{" "}
        (MIT){" \u00B7 "}
        <a href={`${REPO}/blob/main/THIRD_PARTY_NOTICES.md`} className={LINK}>
          Third-party notices
        </a>
      </p>
    </footer>
  );
}
// One place that decides how a posture label looks, shared by the report
// banner and the dashboard tags. Colour is only a visual aid: the label text
// is always shown too.
//
// The best result is cyan, never green. It describes configuration, and a
// green block would read as "safe".
//
// Matching is by label text. Unknown labels fall back to a neutral style
// instead of failing, so a new label can never break the page.

export type PostureStyle = {
  /** Background of the 1px frame around the report banner. */
  frame: string;
  /** Text colour. */
  text: string;
  /** Border colour for small tags. */
  border: string;
  /** Left-edge colour for list rows. */
  edge: string;
};

const RULES: { test: (label: string) => boolean; style: PostureStyle }[] = [
  {
    test: (l) => l === "Known Threat Listing",
    style: {
      frame: "bg-threat/70",
      text: "text-threat",
      border: "border-threat/60",
      edge: "border-l-threat",
    },
  },
  {
    test: (l) => l === "Critical Issues Found",
    style: {
      frame: "bg-red-400/60",
      text: "text-red-300",
      border: "border-red-400/50",
      edge: "border-l-red-400",
    },
  },
  {
    test: (l) => l === "Needs Attention",
    style: {
      frame: "bg-signal/60",
      text: "text-signal",
      border: "border-signal/50",
      edge: "border-l-signal",
    },
  },
  {
    test: (l) => l === "Good Configuration Observed",
    style: {
      frame: "bg-accent/60",
      text: "text-accent",
      border: "border-accent/50",
      edge: "border-l-accent",
    },
  },
  {
    // "Good Configuration - Minor Notes", whatever dash character is used.
    test: (l) => l.startsWith("Good Configuration"),
    style: {
      frame: "bg-sky-400/50",
      text: "text-sky-300",
      border: "border-sky-400/50",
      edge: "border-l-sky-400",
    },
  },
];

const FALLBACK: PostureStyle = {
  frame: "bg-edge/70",
  text: "text-muted",
  border: "border-edge/60",
  edge: "border-l-edge",
};

export function postureStyleFor(label: string): PostureStyle {
  return RULES.find((rule) => rule.test(label))?.style ?? FALLBACK;
}
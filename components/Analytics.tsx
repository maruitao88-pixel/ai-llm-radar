import Script from "next/script";

// Privacy-friendly analytics, off by default. Set NEXT_PUBLIC_PLAUSIBLE_DOMAIN
// (and optionally NEXT_PUBLIC_PLAUSIBLE_SRC for self-hosted Umami/Plausible) to enable.
export default function Analytics() {
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  if (!domain) return null;
  const src = process.env.NEXT_PUBLIC_PLAUSIBLE_SRC || "https://plausible.io/js/script.js";
  return <Script defer data-domain={domain} src={src} strategy="afterInteractive" />;
}

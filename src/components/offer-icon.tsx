/**
 * Einheitliche Symbole für Angebote (statt Emojis):
 * Sammlung = Binder, Tausch = zwei Pfeile, Verkauf = Preisschild, Verkauf oder Tausch = beides,
 * Verschenken = Geschenk.
 */
export function OfferIcon({ offer, className = "size-4" }: { offer: string; className?: string }) {
  const p = {
    viewBox: "0 0 24 24",
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (offer) {
    case "collection":
      return (
        <svg {...p}>
          <rect x="6" y="3" width="14" height="18" rx="2" />
          <path d="M3.5 7.5h4M3.5 12h4M3.5 16.5h4" />
        </svg>
      );
    case "trade":
      return (
        <svg {...p}>
          <path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5" />
        </svg>
      );
    case "sell":
      return (
        <svg {...p}>
          <path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3-8.7 8.7z" />
          <circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none" />
        </svg>
      );
    case "sell_or_trade":
      return (
        <svg {...p}>
          <path d="M3 11V4.2a.7.7 0 0 1 .7-.7h6.6l6.7 6.7-7 7z" />
          <circle cx="7" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
          <path d="M14 18.5h7l-2-2M21 21.5" />
        </svg>
      );
    case "gift":
      return (
        <svg {...p}>
          <rect x="3.5" y="9" width="17" height="11.5" rx="1.5" />
          <path d="M2.5 9h19M12 9v11.5M12 9c-1.5-3.5-5.5-4.5-6-2s3 2 6 2c3 0 6.5.5 6-2s-4.5-1.5-6 2" />
        </svg>
      );
    default:
      return null;
  }
}

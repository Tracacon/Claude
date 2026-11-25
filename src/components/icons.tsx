/** Schlichte Linien-Symbole im Stil von Instagram. Farbe über currentColor. */

type P = { className?: string; filled?: boolean };
const base = (className = "size-6") => ({
  className,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export function HomeIcon({ className, filled }: P) {
  return (
    <svg {...base(className)} fill={filled ? "currentColor" : "none"}>
      <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}

export function MarketIcon({ className, filled }: P) {
  return (
    <svg {...base(className)}>
      <path d="M4 9h16l-1.2 10.2a2 2 0 0 1-2 1.8H7.2a2 2 0 0 1-2-1.8z" fill={filled ? "currentColor" : "none"} />
      <path d="M8.5 9V7a3.5 3.5 0 0 1 7 0v2" />
    </svg>
  );
}

export function MessageIcon({ className, filled }: P) {
  return (
    <svg {...base(className)}>
      <path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.5L3 21l2-5.3A8.4 8.4 0 1 1 21 11.5z" fill={filled ? "currentColor" : "none"} />
    </svg>
  );
}

export function SearchIcon({ className, filled }: P) {
  return (
    <svg {...base(className)} strokeWidth={filled ? 2.6 : 1.9}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </svg>
  );
}

export function PlusIcon({ className }: P) {
  return (
    <svg {...base(className)}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

export function HeartIcon({ className, filled }: P) {
  return (
    <svg {...base(className)} fill={filled ? "currentColor" : "none"}>
      <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8 3.6 4.5 7.1 4.5c2 0 3.6 1.1 4.9 2.9 1.3-1.8 2.9-2.9 4.9-2.9 3.5 0 5.6 3.5 4.4 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" />
    </svg>
  );
}

export function CommentIcon({ className }: P) {
  return (
    <svg {...base(className)}>
      <path d="M20.5 11.6a8.5 8.5 0 0 1-12.6 7.5L3.5 20.5l1.4-4.3A8.5 8.5 0 1 1 20.5 11.6z" />
    </svg>
  );
}

export function ShareIcon({ className }: P) {
  return (
    <svg {...base(className)}>
      <path d="M21.5 2.5 10.5 13.5M21.5 2.5 14.6 21l-4.1-7.5L3 9.4z" />
    </svg>
  );
}

export function MoreIcon({ className }: P) {
  return (
    <svg {...base(className)} fill="currentColor" stroke="none">
      <circle cx="5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="19" cy="12" r="1.7" />
    </svg>
  );
}

export function CalendarIcon({ className }: P) {
  return (
    <svg {...base(className)}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  );
}

export function InstagramIcon({ className }: P) {
  return (
    <svg {...base(className)}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.3" cy="6.7" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

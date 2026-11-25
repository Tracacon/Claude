import type { MetadataRoute } from "next";

/** Damit sich die App aufs Handy legen lässt (und Mitteilungen auf dem iPhone möglich sind). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tracacon App",
    short_name: "Tracacon",
    description: "Die Community-App der Tracacon Trade Card Conventions. Trading · Dealing · Connecting.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0a0d11",
    theme_color: "#0a0d11",
    lang: "de",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

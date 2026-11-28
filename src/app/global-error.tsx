"use client";

/** Letzte Rettung, wenn sogar der Seitenrahmen nicht lädt (ohne Übersetzungen, daher zweisprachig). */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="de">
      <body style={{ background: "#000", color: "#f5efe3", fontFamily: "system-ui, sans-serif", textAlign: "center", padding: "4rem 1rem" }}>
        <h1 style={{ fontSize: "1.4rem" }}>Da ist etwas schiefgegangen.</h1>
        <p style={{ opacity: 0.7 }}>Something went wrong. Bitte versuche es gleich noch einmal.</p>
        <button type="button" onClick={() => reset()} style={{ marginTop: "1.5rem", padding: "0.7rem 1.4rem", borderRadius: "0.75rem", border: 0, background: "#5ce5e9", color: "#000", fontWeight: 700 }}>
          Nochmal versuchen
        </button>
      </body>
    </html>
  );
}

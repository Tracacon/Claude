// Mitteilungen aufs Handy: Verschlüsselung und Anmeldung beim Push-Dienst funktionieren mit unserem Schlüssel.
import { buildPushPayload } from "@block65/webcrypto-web-push";
import { describe, expect, it } from "vitest";
import { VAPID_PUBLIC_KEY } from "@/lib/push-shared";

const b64url = (buf: ArrayBuffer | Uint8Array) => Buffer.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf)).toString("base64url");

describe("Web Push", () => {
  it("der öffentliche Schlüssel hat das richtige Format", () => {
    const raw = Buffer.from(VAPID_PUBLIC_KEY, "base64url");
    expect(raw.length).toBe(65);
    expect(raw[0]).toBe(4);
  });

  it("baut eine verschlüsselte, unterschriebene Mitteilung", async () => {
    // Ein ausgedachtes Gerät (so wie es der Browser liefern würde)
    const device = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const p256dh = b64url(await crypto.subtle.exportKey("raw", device.publicKey));
    const auth = b64url(crypto.getRandomValues(new Uint8Array(16)));
    // Ein Test-Schlüsselpaar für den Server (nicht der echte geheime Schlüssel)
    const server = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
    const pub = b64url(await crypto.subtle.exportKey("raw", server.publicKey));
    const jwk = await crypto.subtle.exportKey("jwk", server.privateKey);

    const payload = await buildPushPayload(
      { data: JSON.stringify({ title: "Tracacon App", body: "Ben folgt dir jetzt.", url: "/aktivitaet", tag: "follow-Ben" }), options: { ttl: 60 } },
      { endpoint: "https://push.example.com/abc", expirationTime: null, keys: { p256dh, auth } },
      { subject: "https://tracacon.de", publicKey: pub, privateKey: jwk.d as string },
    );
    expect(String(payload.method).toUpperCase()).toBe("POST");
    const headers = payload.headers as Record<string, string>;
    expect(headers.authorization).toMatch(/^vapid t=.+, k=/);
    expect(headers["content-encoding"]).toBe("aes128gcm");
  });
});

// Konfiguration für den Cloudflare-Adapter (OpenNext).
// Alle Seiten werden pro Anfrage gerendert, daher braucht es vorerst keinen R2-Zwischenspeicher.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({});

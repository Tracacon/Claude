import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export async function SiteFooter() {
  const t = await getTranslations("Nav");
  return (
    <footer className="border-t border-line bg-black pb-20 text-sm text-cream/60 sm:pb-0">
      <div className="mx-auto flex max-w-5xl flex-wrap gap-x-5 gap-y-2 px-4 py-5">
        <span>© {new Date().getFullYear()} TRACACON</span>
        <Link href="/impressum" className="hover:text-cream">
          {t("imprint")}
        </Link>
        <Link href="/datenschutz" className="hover:text-cream">
          {t("privacy")}
        </Link>
        <Link href="/regeln" className="hover:text-cream">
          {t("rules")}
        </Link>
      </div>
    </footer>
  );
}

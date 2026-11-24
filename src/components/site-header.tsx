import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getMyProfile } from "@/lib/auth";
import { signOut } from "@/lib/actions/auth";
import { LanguageSwitch } from "./language-switch";

export async function SiteHeader() {
  const t = await getTranslations("Nav");
  const profile = await getMyProfile();

  return (
    <header className="sticky top-0 z-10 border-b border-white/10 bg-night/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        <Link href="/" className="text-lg font-black tracking-wider text-amber">
          TRACACON
        </Link>
        <nav className="ml-auto flex items-center gap-1 text-sm sm:gap-2">
          {profile?.role === "admin" && (
            <Link href="/admin" className="rounded-lg px-2 py-1.5 hover:bg-white/5">
              {t("admin")}
            </Link>
          )}
          {profile ? (
            <>
              <Link href={profile.nickname ? "/profil" : "/willkommen"} className="rounded-lg px-2 py-1.5 hover:bg-white/5">
                {profile.nickname ?? t("profile")}
              </Link>
              <form action={signOut}>
                <button type="submit" className="rounded-lg px-2 py-1.5 text-cream/70 hover:bg-white/5">
                  {t("logout")}
                </button>
              </form>
            </>
          ) : (
            <Link href="/anmelden" className="btn-primary px-3 py-1.5">
              {t("login")}
            </Link>
          )}
          <LanguageSwitch label={t("language")} />
        </nav>
      </div>
    </header>
  );
}

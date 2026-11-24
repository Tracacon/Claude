import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { requireProfile, type Profile } from "@/lib/auth";
import { ReportForm } from "../../marktplatz/[id]/listing-actions";
import { createClient } from "@/lib/supabase/server";
import { NICKNAME_PATTERN } from "@/lib/validation";

export async function generateMetadata({ params }: PageProps<"/[locale]/u/[nickname]">): Promise<Metadata> {
  const { nickname } = await params;
  return { title: `@${decodeURIComponent(nickname)}` };
}

export default async function PublicProfilePage({ params }: PageProps<"/[locale]/u/[nickname]">) {
  const { locale, nickname: rawNickname } = await params;
  setRequestLocale(locale);
  // Profile sind nur für angemeldete Mitglieder sichtbar.
  const me = await requireProfile();

  const nickname = decodeURIComponent(rawNickname);
  if (!NICKNAME_PATTERN.test(nickname)) notFound();

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, nickname, city, bio, website, role, created_at")
    .ilike("nickname", nickname.replace(/[%_\\]/g, (c) => `\\${c}`))
    .maybeSingle<Pick<Profile, "id" | "nickname" | "city" | "bio" | "website" | "role" | "created_at">>();
  if (!profile) notFound();

  const t = await getTranslations("Profile");
  const tr = await getTranslations("Roles");
  const format = await getFormatter();

  const tListing = await getTranslations("Listing");
  return (
    <div className="space-y-4">
    <article className="card space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <div
          aria-hidden
          className="flex size-14 items-center justify-center rounded-full bg-amber text-2xl font-black text-night"
        >
          {profile.nickname!.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-bold">@{profile.nickname}</h1>
          <p className="text-sm text-cream/60">
            {profile.city ? `${profile.city} · ` : ""}
            {t("memberSince", { date: format.dateTime(new Date(profile.created_at), { dateStyle: "medium" }) })}
          </p>
        </div>
        {profile.role !== "member" && (
          <span className="ml-auto rounded-full bg-amber/15 px-3 py-1 text-xs font-semibold text-amber">
            {tr(profile.role)}
          </span>
        )}
      </header>
      {profile.bio && <p className="whitespace-pre-line text-cream/90">{profile.bio}</p>}
      {profile.website && (
        <a href={profile.website} target="_blank" rel="noopener noreferrer nofollow ugc" className="link break-all text-sm">
          {profile.website}
        </a>
      )}
    </article>
    {profile.id !== me.id && <ReportForm profileId={profile.id} label={tListing("reportProfile")} />}
    </div>
  );
}

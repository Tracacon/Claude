import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireProfile } from "@/lib/auth";
import { PostComposer } from "./composer";

export async function generateMetadata({ params }: PageProps<"/[locale]/beitrag/neu">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Feed" });
  return { title: t("newPost") };
}

export default async function NewPostPage({ params }: PageProps<"/[locale]/beitrag/neu">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const profile = await requireProfile();
  const t = await getTranslations("Feed");
  return (
    <div className="mx-auto max-w-[470px] space-y-4">
      <h1 className="text-2xl font-bold">{t("newPost")}</h1>
      <PostComposer userId={profile.id} />
    </div>
  );
}

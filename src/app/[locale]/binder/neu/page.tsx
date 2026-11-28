import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackLink } from "@/components/back-link";
import { BinderForm } from "@/components/binder/binder-form";
import { requireProfile } from "@/lib/auth";

export async function generateMetadata({ params }: PageProps<"/[locale]/binder/neu">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Binder" });
  return { title: t("newTitle") };
}

export default async function NewBinderPage({ params }: PageProps<"/[locale]/binder/neu">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const me = await requireProfile();
  const t = await getTranslations("Binder");
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <BackLink fallback="/profil" label={t("back")} />
      <h1 className="text-2xl font-bold">{t("newTitle")}</h1>
      <BinderForm userId={me.id} nickname={me.nickname!} />
    </div>
  );
}

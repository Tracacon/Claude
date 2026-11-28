import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BackLink } from "@/components/back-link";
import { BinderForm } from "@/components/binder/binder-form";
import { requireProfile } from "@/lib/auth";
import { getMyBinders } from "@/lib/binders";

export async function generateMetadata({ params }: PageProps<"/[locale]/binder/[id]/bearbeiten">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Binder" });
  return { title: t("editTitle") };
}

export default async function EditBinderPage({ params }: PageProps<"/[locale]/binder/[id]/bearbeiten">) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const me = await requireProfile();
  const binder = (await getMyBinders()).find((b) => b.id === id);
  if (!binder) notFound();
  const t = await getTranslations("Binder");
  return (
    <div className="mx-auto max-w-lg space-y-4">
      <BackLink fallback={`/u/${me.nickname}/binder/${id}`} label={t("back")} />
      <h1 className="text-2xl font-bold">{t("editTitle")}</h1>
      <BinderForm userId={me.id} nickname={me.nickname!} binder={binder} />
    </div>
  );
}

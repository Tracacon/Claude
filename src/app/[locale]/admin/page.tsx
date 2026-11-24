import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireRole, type AppRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { RoleSelect } from "./role-select";

const PAGE_SIZE = 50;

type AdminUser = {
  id: string;
  email: string;
  nickname: string | null;
  role: AppRole;
  created_at: string;
  last_sign_in_at: string | null;
};

export async function generateMetadata({ params }: PageProps<"/[locale]/admin">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Admin" });
  return { title: t("title") };
}

export default async function AdminPage({ params, searchParams }: PageProps<"/[locale]/admin">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const me = await requireRole("admin");

  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const page = Math.max(0, Number.parseInt(typeof sp.seite === "string" ? sp.seite : "0", 10) || 0);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_users", {
    p_search: q || null,
    p_limit: PAGE_SIZE + 1,
    p_offset: page * PAGE_SIZE,
  });
  const rows = (data ?? []) as AdminUser[];
  const hasNext = rows.length > PAGE_SIZE;
  const users = rows.slice(0, PAGE_SIZE);

  const t = await getTranslations("Admin");
  const format = await getFormatter();
  const fmt = (d: string | null) => (d ? format.dateTime(new Date(d), { dateStyle: "short" }) : "–");
  const pageHref = (p: number) => ({ pathname: "/admin" as const, query: { ...(q ? { q } : {}), ...(p ? { seite: String(p) } : {}) } });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-cream/70">{t("intro")}</p>
      </div>

      <form className="flex gap-2" role="search">
        <label htmlFor="q" className="sr-only">{t("search")}</label>
        <input id="q" name="q" defaultValue={q} placeholder={t("search")} className="input" />
        <button type="submit" className="btn-ghost shrink-0">{t("searchButton")}</button>
      </form>

      {error && <p className="error">{error.message}</p>}

      {users.length === 0 ? (
        <p className="card text-cream/70">{t("empty")}</p>
      ) : (
        <ul className="space-y-2">
          {users.map((u) => (
            <li key={u.id} className="card flex flex-wrap items-center gap-x-4 gap-y-2 p-4 sm:p-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {u.nickname ? (
                    <Link href={`/u/${u.nickname}`} className="hover:underline">@{u.nickname}</Link>
                  ) : (
                    <span className="text-cream/60">{t("noNickname")}</span>
                  )}
                </p>
                <p className="truncate text-sm text-cream/70">{u.email}</p>
                <p className="text-xs text-cream/50">
                  {t("colSince")}: {fmt(u.created_at)} · {t("colLastLogin")}: {fmt(u.last_sign_in_at)}
                </p>
              </div>
              <RoleSelect userId={u.id} role={u.role} isSelf={u.id === me.id} />
            </li>
          ))}
        </ul>
      )}

      <nav className="flex justify-between text-sm">
        {page > 0 ? <Link href={pageHref(page - 1)} className="link">← {t("prev")}</Link> : <span />}
        {hasNext && <Link href={pageHref(page + 1)} className="link">{t("next")} →</Link>}
      </nav>
    </div>
  );
}

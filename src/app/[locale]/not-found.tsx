import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("Nav");
  return (
    <div className="space-y-4 py-10 text-center">
      <p className="text-6xl font-black text-amber">404</p>
      <Link href="/" className="btn-primary">{t("home")}</Link>
    </div>
  );
}

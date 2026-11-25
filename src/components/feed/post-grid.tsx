/* eslint-disable @next/next/no-img-element -- Fotos kommen direkt aus Supabase Storage */
import { HeartIcon } from "@/components/icons";
import { Link } from "@/i18n/navigation";
import { postPhotoUrl, type GridPost } from "@/lib/feed-shared";

/** Raster aus quadratischen Vorschaubildern wie im Instagram-Profil */
export function PostGrid({
  posts,
  label,
  list,
}: {
  posts: GridPost[];
  label: (p: GridPost) => string;
  /** Aus welcher Liste weitergescrollt wird (Profil oder Entdecken) */
  list?: "profil" | "entdecken";
}) {
  return (
    <ul className="grid grid-cols-3 gap-0.5 sm:gap-1">
      {posts.map((p) => (
        <li key={p.id}>
          <Link href={list ? { pathname: `/p/${p.id}`, query: { liste: list } } : `/p/${p.id}`} aria-label={label(p)} className="group relative block aspect-square overflow-hidden bg-night-3">
            {p.cover_photo_id && (
              <img src={postPhotoUrl(p.author_id, p.cover_photo_id, "thumb")} alt="" loading="lazy" className="h-full w-full object-cover" />
            )}
            {p.photo_count > 1 && (
              <span aria-hidden className="absolute right-1.5 top-1.5 text-xs drop-shadow">❐</span>
            )}
            <span aria-hidden className="absolute inset-0 hidden items-center justify-center gap-1 bg-night/50 text-sm font-semibold group-hover:flex">
              <HeartIcon className="size-4" filled /> {p.like_count}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* eslint-disable @next/next/no-img-element -- Bilder kommen direkt aus Supabase Storage */
import { avatarUrl } from "@/lib/social";

const sizes = {
  xs: "size-7 text-xs",
  sm: "size-10 text-base",
  md: "size-12 text-lg",
  lg: "size-20 text-3xl sm:size-24",
} as const;

/** Rundes Profilbild; ohne Bild (oder ohne Berechtigung) der Anfangsbuchstabe. */
export function Avatar({
  userId,
  avatarId,
  nickname,
  size = "sm",
}: {
  userId: string;
  avatarId: string | null | undefined;
  nickname: string;
  size?: keyof typeof sizes;
}) {
  const cls = `${sizes[size]} shrink-0 overflow-hidden rounded-full`;
  if (avatarId) {
    return <img src={avatarUrl(userId, avatarId)} alt="" loading="lazy" className={`${cls} bg-night-3 object-cover`} />;
  }
  return (
    <span aria-hidden className={`${cls} flex items-center justify-center bg-amber font-black text-night`}>
      {nickname.slice(0, 1).toUpperCase()}
    </span>
  );
}

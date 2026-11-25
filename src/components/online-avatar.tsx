import { Avatar } from "@/components/avatar";

/** Profilbild mit grünem Punkt, wenn die Person gerade online ist. */
export function OnlineAvatar({
  userId,
  avatarId,
  nickname,
  online,
  size = "sm",
  label,
}: {
  userId: string;
  avatarId: string | null;
  nickname: string;
  online: boolean;
  size?: "xs" | "sm" | "md" | "lg";
  label?: string;
}) {
  return (
    <span className="relative inline-flex shrink-0">
      <Avatar userId={userId} avatarId={avatarId} nickname={nickname} size={size} />
      {online && (
        <span
          className={`absolute bottom-0 right-0 rounded-full border-2 border-night bg-ok ${size === "lg" || size === "md" ? "size-4" : "size-3"}`}
          role="img"
          aria-label={label}
        />
      )}
    </span>
  );
}

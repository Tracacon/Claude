/** Ladeanzeige beim Seitenwechsel: zeigt sofort, dass etwas passiert. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex justify-center py-16">
      <span className="size-9 animate-spin rounded-full border-4 border-brand/25 border-t-brand" />
      <span className="sr-only">…</span>
    </div>
  );
}

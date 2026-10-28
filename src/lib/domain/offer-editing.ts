/** Optimistic token only; authorization always comes from the session and RLS. */
export function offerEditVersion(item: {
  name: string;
  price: number;
  note?: string | null;
  photo_image_id?: string | null;
  photo_image_ids?: string[];
  style?: { priceLabel?: string } | null;
}): string {
  return JSON.stringify([
    item.name,
    Number(item.price),
    item.note || null,
    item.photo_image_id || null,
    item.photo_image_ids ?? [],
    item.style?.priceLabel ?? null,
  ]);
}

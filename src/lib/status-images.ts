import { supabase } from "@/integrations/supabase/client";

const BUCKET = "statuses";

/** Extract the object path inside the `statuses` bucket from a stored URL or raw path. */
export function statusObjectPath(imageUrl: string): string {
  if (!imageUrl) return "";
  const marker = `/${BUCKET}/`;
  const i = imageUrl.indexOf(marker);
  if (i === -1) return imageUrl.replace(/^\/+/, "");
  return imageUrl.slice(i + marker.length).split("?")[0];
}

/**
 * The `statuses` bucket is private, so status images must be read through
 * short-lived signed URLs (signed-in users only).
 */
export async function signStatusUrls(imageUrls: string[], expiresIn = 3600) {
  const paths = imageUrls.map(statusObjectPath).filter(Boolean);
  const map = new Map<string, string>();
  if (paths.length === 0) return map;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, expiresIn);
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) map.set(row.path, row.signedUrl);
  }
  return map;
}

/** Resolve one stored status URL to a signed URL (falls back to the original). */
export async function signStatusUrl(imageUrl: string, expiresIn = 3600) {
  const path = statusObjectPath(imageUrl);
  if (!path) return imageUrl;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? imageUrl;
}

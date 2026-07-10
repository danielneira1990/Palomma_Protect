import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase para el servidor.
 * Devuelve null si aún no hay variables de entorno configuradas,
 * para que la app corra (mostrando estado "conecta Supabase") sin credenciales.
 *
 * Nota: la autenticación real se hereda de Pay más adelante. Por ahora usamos
 * la service role key en el servidor para el backoffice interno.
 */
export function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

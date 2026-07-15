"use server";

import { getSupabase } from "@/lib/supabase/server";
import { CONFIG_CLAVES } from "@/lib/config";
import { revalidatePath } from "next/cache";

/** Convierte "1,35" o "1.35" a número; vacío → null. */
function num(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").replace(",", ".").replace(/[^\d.-]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Upsert de un parámetro por clave (sin unique en la tabla → find-or-update). */
async function setParametro(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  clave: string,
  valor: string,
) {
  const { data: ex } = await supabase.from("parametro").select("id").eq("clave", clave).maybeSingle();
  if (ex) await supabase.from("parametro").update({ valor }).eq("id", ex.id);
  else await supabase.from("parametro").insert({ clave, valor });
}

/** Guarda los parámetros generales (IPC, umbrales del semáforo, día de corte). */
export async function guardarConfig(formData: FormData) {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase no está configurado. Revisa .env.local");

  // Los porcentajes entran como % (6,2) y se guardan como decimal (0.062).
  const ipcPct = num(formData.get("ipc"));
  const amarilloPct = num(formData.get("retiro_amarillo"));
  const rojoPct = num(formData.get("retiro_rojo"));
  const diaCorte = num(formData.get("dia_corte"));

  if (ipcPct != null) await setParametro(supabase, CONFIG_CLAVES.ipc, String(ipcPct / 100));
  if (amarilloPct != null)
    await setParametro(supabase, CONFIG_CLAVES.retiroAmarillo, String(amarilloPct / 100));
  if (rojoPct != null) await setParametro(supabase, CONFIG_CLAVES.retiroRojo, String(rojoPct / 100));
  if (diaCorte != null)
    await setParametro(supabase, CONFIG_CLAVES.diaCorte, String(Math.round(diaCorte)));

  revalidatePath("/backoffice/configuracion");
}

/** Crea o actualiza el calendario operativo de un periodo (AAAA-MM). */
export async function guardarMesCalendario(formData: FormData) {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase no está configurado. Revisa .env.local");

  const periodo = String(formData.get("periodo") ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(periodo)) throw new Error("Periodo inválido (usa AAAA-MM).");

  const fecha = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v || null;
  };
  const corte = fecha("corte"); // día único: cierra novedades/ingresos y factura
  const payload = {
    periodo,
    corte_ingresos: corte,
    corte_novedades: corte,
    corte_retiros: corte,
    dia_max_avisos: fecha("reporte_siniestros"),
    dia_desistimientos: fecha("desistir"),
    pago_siniestro_vigente: fecha("pago_vigentes"),
    pago_siniestro_nuevo: fecha("pago_nuevos"),
  };

  const { data: ex } = await supabase
    .from("calendario_operativo")
    .select("id")
    .eq("periodo", periodo)
    .maybeSingle();
  if (ex) await supabase.from("calendario_operativo").update(payload).eq("id", ex.id);
  else await supabase.from("calendario_operativo").insert(payload);

  revalidatePath("/backoffice/configuracion");
}

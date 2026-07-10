import { layoutCorreo, caja, logoAttachment } from "./layout";

type Adjunto = { filename: string; content: Buffer; cid?: string };
export type Correo = { subject: string; html: string; attachments: Adjunto[] };

/** Paz y salvo listo (con el PDF adjunto — lo agrega quien lo envía). */
export function correoPazSalvo(data: {
  nombreContacto: string;
  numContratos: number;
}): Correo {
  const nombre = data.nombreContacto?.trim() || "equipo";
  return {
    subject: "Tu paz y salvo está listo · Palomma Protect",
    html: layoutCorreo({
      etiqueta: "Protect · Paz y salvo",
      titulo: `¡Vas volando, ${nombre}! 🚀`,
      intro: "Ya tienes tu paz y salvo. Un paso más y tu cartera queda afianzada.",
      contenido: caja(
        "morado",
        "📎 Tu paz y salvo (referencia)",
        `Adjuntamos el <b>paz y salvo</b> de tu radicación de <b>${data.numContratos} contrato(s)</b> <b>como referencia</b>. En los <b>próximos minutos/horas les llegará el documento para firma digital</b>. Una vez firmado, descárguenlo y <b>súbanlo en el portal</b> para continuar con el ingreso a fianza.`,
      ),
    }),
    attachments: [logoAttachment()],
  };
}

/** Proceso de radicación cancelado. */
export function correoCancelacion(data: { nombreContacto: string }): Correo {
  const nombre = data.nombreContacto?.trim() || "equipo";
  return {
    subject: "Proceso de radicación cancelado · Palomma Protect",
    html: layoutCorreo({
      etiqueta: "Protect · Radicación",
      titulo: `Listo, ${nombre}, cancelamos tu proceso`,
      intro: "Sin problema — cuando quieras lo retomas. 👍",
      contenido: caja(
        "morado",
        "Tus clientes están de vuelta",
        "Cancelamos tu proceso de radicación y tus clientes preaprobados <b>vuelven a estar disponibles</b>. Puedes iniciar uno nuevo cuando quieras desde el portal.",
      ),
    }),
    attachments: [logoAttachment()],
  };
}

/** Visto bueno del analista: la inmobiliaria ya puede hacer el ingreso. */
export function correoAprobado(data: {
  nombreContacto: string;
  numContratos: number;
  portalUrl: string;
}): Correo {
  const nombre = data.nombreContacto?.trim() || "equipo";
  return {
    subject: "¡Aprobado! Ya puedes afianzar tus contratos · Palomma Protect",
    html: layoutCorreo({
      etiqueta: "Protect · Validación aprobada",
      titulo: `¡Buenas noticias, ${nombre}! ✅`,
      intro: "Revisamos tus documentos y la firma, y quedó todo perfecto.",
      contenido: caja(
        "verde",
        "✅ Todo validado — solo falta tu OK",
        `Tu radicación de <b>${data.numContratos} contrato(s)</b> quedó aprobada. Entra al portal y confirma tú mismo el <b>ingreso a fianza</b> para dejar tu cartera protegida.`,
        { texto: "Ir al portal a ingresar →", url: data.portalUrl },
      ),
    }),
    attachments: [logoAttachment()],
  };
}

/** Cierre del proceso: afianzados este mes, o pendientes para el próximo. */
export function correoIngreso(
  data: { nombreContacto: string; numContratos: number },
  esteMes: boolean,
): Correo {
  const nombre = data.nombreContacto?.trim() || "equipo";
  const contenido = esteMes
    ? caja(
        "verde",
        "🎉 ¡Contratos afianzados!",
        `Tus <b>${data.numContratos} contrato(s)</b> quedaron <b>ingresados a fianza</b>. Ya los ves en la pestaña Contratos de tu portal.`,
      )
    : caja(
        "azul",
        "🗓️ Ingresan el próximo mes",
        `Recibimos y aprobamos tu radicación de <b>${data.numContratos} contrato(s)</b>. Como ya pasó el corte del mes, quedan <b>pendientes</b> y se afianzan automáticamente el próximo mes. No tienes que hacer nada más.`,
      );
  return {
    subject: esteMes
      ? "¡Tus contratos quedaron afianzados! · Palomma Protect"
      : "Tus contratos ingresan el próximo mes · Palomma Protect",
    html: layoutCorreo({
      etiqueta: "Protect · Fianza",
      titulo: esteMes ? `¡Felicitaciones, ${nombre}! 🎉` : `¡Todo listo, ${nombre}! 🗓️`,
      intro: esteMes
        ? "Tu cartera quedó protegida con Palomma Protect."
        : "Tu radicación quedó aprobada y en camino.",
      contenido,
    }),
    attachments: [logoAttachment()],
  };
}

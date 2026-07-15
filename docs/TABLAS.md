# Modelo de datos — Palomma Protect

Referencia de las tablas de Supabase (Postgres). La fuente de verdad es
`supabase/migrations/`; este documento resume qué se usa hoy y cómo.

## Principios

- **PK = UUID**; el código legible (`IMB-2026-001`, `RAD-…`, `EST-…`, `FZ-…`, `NOV-…`)
  es un campo de negocio aparte.
- **Plata en enteros** (`BIGINT`, pesos); las tasas en decimal (`0.0135` = 1,35%).
- **Personas deduplicadas** por `documento` (find-or-create), agnósticas del rol.
- Archivos (PDF, Excel) viven en **Google Drive**; en la base se guarda el link/clave.

## Tablas en uso

| Tabla | Rol | Notas clave |
|---|---|---|
| `inmobiliaria` | La inmobiliaria/cliente | `tasa_canon` = tasa de fianza (default por sucursal); `email_representante`/`celular_representante` (firma AUCO); `estado` PENDIENTE→ACTIVA→…; `drive_folder_id`; `merchant_id` (Pay). |
| `persona` | Personas (por documento) | Reusada como arrendatario, codeudor o propietario según la tabla que la referencia. |
| `estudio` | Preaprobados + estudios manuales | Del modelo: `merchant_id`, `score`, `tier`, `score_payload`. `estado_ingreso` PREAPROBADO→INGRESADO (+`fecha_ingreso`). `id_radicacion` lo liga a su lote. |
| `radicacion` | Lote de inducción | `etapa` (ver abajo), `valor_asegurado`, `num_clientes`, `detalle` (jsonb: el Excel), evidencia AUCO (`firma_*`), `ultimo_error` (rebotes), `drive_folder_id`. |
| `contrato` | La fianza (nace al ingresar) | Líneas canon/integral/penal con valores y costos; `tasa_canon`; `estado` (ver abajo); `id_estudio`, `id_inmobiliaria`. |
| `contrato_persona` | Personas del contrato | `rol` ARRENDATARIO / CODEUDOR / PROPIETARIO. |
| `novedad` | Movimientos de la cartera | `tipo` INGRESO/RETIRO/AUMENTO; `estado` (ver abajo); `actor` (quién); `payload_anterior`/`payload_nuevo` (canon antes/después). |
| `documento` | Registro de PDFs | `tipo_documento` (CONTRATO_MARCO, …) + `storage_key` (link Drive). |
| `parametro` | Config clave-valor | IPC, umbrales del semáforo, ventana de retiro. |
| `calendario_operativo` | Fechas mes a mes | `corte_ingresos` (día que cierra novedades/ingresos y factura), y fechas de siniestros/desistir. |

## Estados

- **`contrato.estado`**: `ACTIVO` · `EN_RETIRO` (retiro en trámite, estado intermedio) ·
  `RETIRADO` · `POR_VENCER` · `TERMINADO` · `SUSPENDIDO`.
- **`radicacion.etapa`**: `INICIADA` → `EXCEL_SUBIDO` → `PAZ_SALVO` → `FIRMADO` →
  `INGRESADA`; más `PENDIENTE_INGRESO` (preingresado) y `CANCELADA`.
  (`EN_VALIDACION`/`APROBADA` quedan como legado, ya no se usan.)
- **`novedad.estado`**: `SOLICITADA` (retiro pendiente) · `PENDIENTE_APROBACION` (retiro
  pausado en retención) · `APLICADA` · `RECHAZADA` (retiro cancelado / retenido).
- **`estudio.estado_ingreso`**: `PREAPROBADO` · `INGRESADO` · `VENCIDO`.

## Retiros — estado intermedio y retención

Al solicitar un retiro: se crea una `novedad` RETIRO `SOLICITADA` y el `contrato` pasa a
`EN_RETIRO` (no sale de una). Desde el back se puede **aplicar** (→ `RETIRADO`),
**cancelar/retener** (→ `ACTIVO`), **pausar** (→ `PENDIENTE_APROBACION`) o mejorar términos
(tasa/amparos gratis). Si nadie actúa en la ventana configurada, se **auto-aprueba** (MVP:
al cargar back/portal; en prod sería un cron). Para el cliente es invisible: solo ve
"en trámite".

## Aún placeholder (no se escriben)

`aviso` y su cobranza (`pago_obligaciones`, `acuerdo_*`, `gestion_cobranza`),
`libro_mayor`, `recaudo`, `factura`/`factura_detalle`, `cartera_mensual`,
`certificado_version`, `usuario`, `consentimiento`, `evento_auditoria`, `tasa`.

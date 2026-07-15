# Decisiones — Palomma Protect

Registro de decisiones que **no se pueden deducir leyendo el código** (config del
dashboard de Supabase, deuda técnica conocida, criterios de arquitectura). Se
actualiza a medida que avanza el MVP.

---

## Supabase

### Proyecto
- **Region:** `us-east-1` (Norte de Virginia). Elegida para co-ubicarse con Vercel
  (default `iad1`); minimiza la latencia Vercel→DB, que es el salto que se repite en
  cada request. Mejor conectividad desde Colombia que São Paulo. **La región no se
  puede cambiar** sin migrar el proyecto.
- **Postgres Type:** Postgres (default). No OrioleDB (alpha).
- **Project Ref:** `vghjlmsoavgvpxklwvyu` → URL `https://vghjlmsoavgvpxklwvyu.supabase.co`.

### Seguridad (Settings → API / Data API)
- **Data API:** ON. Requerido porque la app usa `supabase-js`.
- **Automatically expose new tables:** OFF. Evita que una tabla nueva quede
  accesible con la `anon key` (que es pública, viaja al navegador). La exposición se
  decide tabla por tabla. Es la recomendación del propio Supabase.
- **Automatic RLS:** ON. Toda tabla nueva nace con Row Level Security activo →
  ninguna queda abierta por accidente. Con RLS y sin políticas, `anon`/`authenticated`
  quedan denegados; la **service_role** (usada en el servidor por el backoffice) lo
  ignora, así que el backoffice funciona igual. Las políticas por inmobiliaria se
  agregan al conectar la identidad heredada de Pay.

### Flujo de migraciones (CLI)
- CLI fijado como devDependency; scripts en `package.json`:
  `sb:login`, `sb:link`, `sb:push`, `sb:diff`, `sb:pull`.
- Las migraciones viven en `supabase/migrations/`. Se aplican con `npm run sb:push`.
- Docker Desktop solo hace falta para el stack **local** (`supabase start`); trabajando
  contra la nube no se necesita (el warning de Docker en `db push` es inofensivo).

---

## Google Drive / Docs — generación del Contrato Marco

Al crear una inmobiliaria, la app genera su Contrato Marco a partir de una
plantilla de Google Docs y lo guarda como PDF en Drive (para envío manual a
firma; la firma digital se integra después). **Verificado funcionando end-to-end
el 2026-07-09** (crea inmobiliaria → subcarpeta + Doc + PDF en Drive).

- **Auth:** service account `palomma-protect-docs@palomma-protect.iam.gserviceaccount.com`
  (proyecto Google Cloud `palomma-protect`). Credencial en la env var
  `GOOGLE_SERVICE_ACCOUNT_KEY_BASE64` (JSON en base64). APIs habilitadas:
  Google Drive API + Google Docs API (ambas gratuitas, sin billing).
- **Acceso en Drive:** el service account es Content manager en la carpeta de
  plantillas ("Documentos Fianza") y en la de salida ("Inmobiliarias"), dentro
  de un Shared Drive de Palomma. Se usa Shared Drive (no My Drive) porque un
  service account no tiene cuota propia; ahí los archivos los posee el Drive.
- **Plantilla:** Google Doc `Palomma_Contrato_Marco_Fianza` con marcadores
  `{{...}}`. Mapean 1:1 con los campos del formulario de inmobiliaria. ID en
  `GOOGLE_DRIVE_TEMPLATE_CONTRATO_MARCO_ID`.
- **Salida:** por cada inmobiliaria se crea una subcarpeta en "Inmobiliarias"
  (`GOOGLE_DRIVE_INMOBILIARIAS_FOLDER_ID`) con el Doc editable + el PDF.
- **Código:** capa aislada en `src/lib/google/` (como la de Supabase). `googleapis`
  va en `serverExternalPackages` (usa require dinámico). El PDF se registra en la
  tabla `documento` (tipo `CONTRATO_MARCO`, agregado en la migración 0002).

### Ciclo de vida de la inmobiliaria y firma

- **Estados:** `PENDIENTE` (recién creada, contrato sin firmar) → `ACTIVA` (contrato
  firmado subido). `SUSPENDIDA`/`INACTIVA` quedan para más adelante.
- **SAGRILAFT:** el campo `sagrilaft_estado` existe pero **no bloquea** la activación
  (son inmobiliarias que ya trabajan con Palomma). Se gestiona aparte.
- **Gestión desde la app:** al hacer clic en una fila se abre un modal
  (`InmobiliariasTable.tsx`) para ver la ficha, descargar el Contrato Marco (link a
  Drive) y **subir el firmado**. Subir el firmado lo guarda en la misma subcarpeta
  de Drive (tipo `CONTRATO_MARCO_FIRMADO`) y pasa la inmobiliaria a `ACTIVA`.
- **`drive_folder_id`** (migración 0003) guarda la subcarpeta de cada inmobiliaria.
  Para inmobiliarias creadas antes de esto (sin folder guardado), la subida del
  firmado ubica la carpeta por nombre o la crea (fallback en `subirContratoFirmadoADrive`).
- La subida del firmado **sí falla ruidosamente** si Drive falla (a diferencia de la
  generación, que es mejor esfuerzo): el punto es justamente guardar el archivo.

---

## Correo — bienvenida a la inmobiliaria

Al activarse una inmobiliaria (contrato firmado) se le envía un correo de
bienvenida. También hay botón para enviarlo/reenviarlo manualmente desde el modal.

- **Transporte:** capa aislada e intercambiable en `src/lib/email/`. Hoy usa
  **SMTP** (Gmail con contraseña de aplicación, env `SMTP_*` + `MAIL_FROM`). Se
  eligió SMTP por ser un **mockup funcional**: sale desde el correo de Palomma sin
  vendedores ni delegación de dominio, y la integración real solo cambia
  credenciales/transporte (Resend, Gmail API, etc.) sin tocar la lógica.
- **Plantilla:** HTML email-safe construido en código (`bienvenida.ts`), no export
  del Google Doc (Docs→HTML de correo es inconsistente entre clientes). Copy basado
  en `Plantilla_Correo_Bienvenida` de Drive, con énfasis en preaprobados e inducciones.
- **Logo:** SVG de Palomma pasado a blanco y a PNG (con `sharp`, una sola vez),
  guardado como base64 en `src/lib/email/logo.ts` y embebido vía `cid` (los correos
  no renderizan SVG). `sharp` quedó como devDependency; el runtime no lo usa.
- **Adjuntos:** los tres condicionados (reglamentos general, integral y cláusula
  penal) se exportan a PDF de Drive al vuelo (`src/lib/google/reglamentos.ts`, IDs en
  env) y se adjuntan. Mejor esfuerzo: si Drive falla, el correo igual sale.
- **Disparador:** automático al activar (mejor esfuerzo — no bloquea la activación
  si el correo falla) + botón manual para reenviar. `bienvenida_enviada_at`
  (migración 0004) marca el envío y evita duplicados automáticos.
- `nodemailer` va en `serverExternalPackages`. `PORTAL_URL` es el link del portal
  que va en el correo (placeholder mientras no haya deploy).

---

## Módulo de Estudios / Preaprobados

Backoffice `/backoffice/estudios`: radicar un estudio de un arrendatario, registrar
su resultado (score, tier, cupo, tasa) y decidir la fianza. Mismo patrón que
Inmobiliarias (lista + modal de gestión).

- **Scoring manual (mockup):** el analista ingresa score/tier/cupo/tasa a mano. Aquí
  se conectará el motor de scoring real; por ahora es entrada manual. `tasa_sugerida`
  se guarda como decimal (0.02 = 2%).
- **Persona:** se reusa por `documento` si ya existe (find-or-create), si no se crea.
- **Flujo de estado:** `EN_ANALISIS` → decisión (`APROBADO`/`CONDICIONAL`/`NO_VIABLE`).
  Aprobado/condicional dejan `estado_ingreso = PREAPROBADO` con **30 días de vigencia**;
  luego "Marcar ingresado" pasa a `INGRESADO` (paso previo al contrato de fianza).
- **Conexión con el portal:** al decidir un estudio `PREAPROBACION` como aprobado,
  aparece automáticamente en el tab **Preaprobados** del portal de la inmobiliaria
  (ese tab ya leía la tabla `estudio`).
- Sin migración nueva: la tabla `estudio` ya existía en 0001.

---

## Motor de scoring (preaprobados)

Los **preaprobados** vienen del modelo de credit scoring (score 0-1000 → tier
PRIME/STANDARD/SUBPRIME/…) que corre sobre los datos de pago de Pay (Tinybird).

- **Fuente de verdad = el Python del dev**, no se reimplementa. Vive en
  `scoring-service/` (copia versionada del proyecto original). Tablas Tinybird:
  `rentals_invoices` (pagos) + `rentals_customers` (nombre/email/tel). Base
  `palomma_prod`.
- **Integración = servicio.** `scoring-service/api.py` (FastAPI) envuelve el
  pipeline y expone `POST /score/{merchant}` → JSON de scores. La app lo dispara
  e ingiere; el **token de Tinybird vive solo en `scoring-service/.env`**, la app
  solo conoce `SCORING_SERVICE_URL`.
- **Ingesta:** los scores se mapean a la tabla `estudio` (diseñada para esto:
  `merchant_id`, `score`, `tier`, `cupo_max`, `default_rate`, `risk_flags`,
  `score_payload`). Los **PRIME** se marcan `PREAPROBADO` → aparecen en el tab
  Preaprobados del portal. Vínculo por `inmobiliaria.merchant_id` (migración 0005).
- **Bug corregido** al portar: `data_loader.py` tenía `except A, B:` (sintaxis
  Python 2) → `except (A, B):`.
- Nota: se sembraron 25 preaprobados PRIME de `indika` para Nielda como demo
  interina (script) mientras se conecta el servicio en vivo.

---

## Radicación / inducción (portal + backoffice)

Del preaprobado al ingreso a fianza. Tabla `radicacion` (migración 0006) con una
etapa que avanza en un solo sentido; cada etapa habilita **una** acción en el portal.

- **Modelo self-service (decisión de rediseño):** Palomma **ya no valida ni aprueba**
  la radicación. El control real ocurre al **siniestro**, contra el contrato de
  arrendamiento, respaldado por la **declaración juramentada** firmada: si el dato no
  concuerda, no se paga. El "visto bueno" del analista era fricción que no reducía el
  riesgo financiero, así que se eliminó. A cambio se reforzaron los dos controles que
  sí importan: la **validación automática del Excel** y la **firma de la declaración**.
- **Etapas** (`radicacion.etapa`): `INICIADA` → `EXCEL_SUBIDO` → `PAZ_SALVO` (declaración
  generada) → `FIRMADO` (declaración firmada y validada) → `INGRESADA`. Más
  `PENDIENTE_INGRESO` (firmada pero pasó el corte del mes) y `CANCELADA`.
  `EN_VALIDACION`/`APROBADA` quedan como estados **legados** permitidos (no se borra el
  histórico) pero ya no se usan. Etiquetas y progreso: `src/lib/radicacion.ts`.
- **Roles:** la inmobiliaria maneja **todo** desde el portal (seleccionar clientes,
  subir Excel, generar/firmar la declaración **y confirmar el ingreso**). El backoffice
  `/backoffice/procesos` es **solo monitoreo (read-only)**: etapa, avance, documentos y
  evidencia de firma; sin botón de aprobar.
- **Validación del Excel reforzada** (`/subir`, exceljs): además de que estén **todos**
  los clientes y el canon (con el **valor asegurado** = suma de cánones), valida
  **inquilinos duplicados** (los codeudores **sí** pueden repetirse — una persona puede
  ser codeudor de varios contratos), canon en rango, tipo destino (Vivienda/Comercio),
  dirección, y fechas válidas y coherentes (fin > inicio). Cada error lista los
  documentos afectados.
- **Declaración juramentada** (`src/lib/google/pazSalvo.ts`, antes "paz y salvo"): se
  genera desde plantilla de Google Docs con `replaceAllText`, incluyendo el **valor
  asegurado total**. Se envía por correo **como referencia**; la firma digital llega
  aparte por **AUCO** (dirigida al representante legal). *Pendiente:* meterle la fórmula
  de juramento al documento de la plantilla.
- **Validación de la firma (AUCO, `src/lib/auco.ts`, migración 0013):** al subir el PDF
  firmado (`/firmar`), se extrae el texto (`unpdf`), se parsea el "Certificado de firma"
  de AUCO y se valida contra el registro que el firmante es el **representante legal**:
  **correo** y **celular** coinciden (campos `email_representante`/`celular_representante`,
  migración 0012, traídos de Pay) y se usó el **método fuerte** (OTP + foto + documento).
  Se guarda la evidencia (`firma_doc_id`, `firma_hash`, `firma_email`, `firma_metodo`,
  `firma_at`). Con solo el PDF la cédula no viene como campo; el día que haya API de AUCO
  se podrá cruzar contra `cc_representante`.
- **Rebotes visibles para el backoffice (migración 0014):** si la validación del Excel o
  de la firma falla, se guarda el motivo en `radicacion.ultimo_error`/`ultimo_error_at`
  (se limpia al avanzar). El portal le dice al cliente **qué corregir**; el backoffice
  marca la radicación como **"⚠️ atascado"** y muestra el error + el **contacto de la
  inmobiliaria** (correo/teléfono) para acompañarla.
- **Regla de fecha de ingreso:** `DIA_CORTE_INGRESOS = 20`. Antes del corte ingresa este
  mes (`INGRESADA`, estudios `INGRESADO`); después queda `PENDIENTE_INGRESO`. Cada
  transición manda correo de marca (`src/lib/email/proceso.ts`: declaración, cancelación,
  ingreso).
- **Cancelar:** `CANCELADA` **libera** los preaprobados (vuelven a estar disponibles) pero
  conserva el histórico; no se borran filas.
- **Storage:** cada radicación tiene su **subcarpeta en Drive** (migración 0009,
  `radicacion.drive_folder_id`, `src/lib/radicacionDrive.ts`) con el Excel y la
  declaración firmada; el backoffice enlaza a esos documentos.
- **UI:** el portal (`ProcesoView`) muestra barra de progreso morada + timeline y
  **reanuda** donde iba; el backoffice (`ProcesosTable`) lista etapa/avance/tiempo con
  modal de detalle y monitoreo.

---

## Correo — layout de marca compartido

Todos los correos del proceso comparten un solo layout (`src/lib/email/layout.ts`):
header con logo (embebido por `cid`), cajas de color (`caja()`), listas y CTA. Nació
porque el primer correo de paz y salvo salió "feo" sin header ni logo. El logo es un
PNG blanco generado una vez desde el SVG de Palomma (sharp). Correos: contrato marco,
bienvenida (activación), inducción/radicación, paz y salvo, cancelación, aprobado e
ingreso.

---

## Contrato de fianza (nace al ingresar)

El "ingreso a fianza" dejó de ser solo un flag: al ingresar se **materializa el
`contrato`** real (`src/lib/contratos.ts`) desde el detalle del Excel persistido
(`radicacion.detalle`, migración 0016).

- **Líneas y costos:** línea canon (valor afianzado = canon, costo = canon × tasa de la
  inmobiliaria + IVA 19%) y **amparo integral de cortesía** (gratis para preaprobados).
  Se crean los `contrato_persona` (arrendatario del estudio + codeudores del Excel).
- **Certificado de fianza** por contrato (`src/lib/google/certificadoFianza.ts`): PDF
  on-demand desde plantilla de Google Docs; se genera, exporta y borra la copia temporal
  (no deja basura en Drive). El propietario no se pide: la inmobiliaria firma **como
  mandataria** (así consta en el contrato marco).
- **Tasa por sucursal:** `inmobiliaria.tasa_canon`, con default por sucursal (Medellín
  1,35% · Bogotá 2,04% · resto 1,66%) editable en el modal. La KPI del portal y el
  resumen del ingreso la leen de ahí. KPIs de cartera con **tasa promedio ponderada por
  valor afianzado**.

---

## Novedades y retención de retiros

Los movimientos de la cartera (INGRESO, RETIRO, AUMENTO) quedan en `novedad`, clasificados
por inmobiliaria (`src/app/backoffice/novedades`, tabs + drill-down a página de detalle).

- **Estado intermedio (migración 0018):** al pedir un retiro el contrato **no sale de
  una** → pasa a `EN_RETIRO`. Solo a `RETIRADO` cuando se aplica; vuelve a `ACTIVO` si se
  cancela (retención).
- **Retención invisible para el cliente:** el retiro queda pendiente (el cliente solo ve
  "en trámite / próximas horas"). Palomma tiene la ventana para **aplicar, cancelar
  (retener), pausar o mejorar términos** (tasa, amparo integral / cláusula penal gratis).
- **Auto-aprobación:** si nadie actúa en `VENTANA_RETIRO_HORAS`, el retiro se aplica solo.
  MVP sin scheduler: se ejecuta **al cargar** back y portal; en prod sería un cron.
- **Semáforo por inmobiliaria** (% de retiros del mes por número de contratos): verde
  <2,5% · amarillo 2,5–3% · rojo >3% (umbrales configurables).

---

## Administración masiva y configuración

- **Administración masiva por archivo** (portal, `contratos/masivo`): la inmobiliaria
  descarga un formato con sus contratos, marca por fila la acción (AUMENTO % / RETIRO +
  motivo) y lo sube; se **valida** (contratos activos, acción y valores; tope IPC en
  vivienda) antes de aplicar. Convive con la selección por checkboxes.
- **Configuración** (`src/lib/config.ts` + `parametro`): IPC, umbrales del semáforo y
  ventana de retiro. El **día de corte** vive solo en el `calendario_operativo` (un día al
  mes que cierra novedades/ingresos y dispara la facturación); el ingreso lo lee de ahí.

---

## Deuda técnica conocida

- **Generación del contrato es "mejor esfuerzo":** si la llamada a Google falla,
  la inmobiliaria igual se crea y el error solo se escribe en consola
  (`crearInmobiliaria`). No hay reintento ni indicador en la UI de que el
  contrato no se generó. Mejorar cuando el flujo sea crítico (estado del
  documento visible + reintento manual).

- **Códigos consecutivos (`IMB-AAAA-NNN`, `CMF-…`) por `count`:** hoy el consecutivo
  se calcula contando registros del año (`src/app/backoffice/inmobiliarias/actions.ts`).
  Simple y suficiente para el MVP, pero **dos creaciones simultáneas pueden chocar** en
  el mismo número (el `codigo` es `unique` → una fallaría). Blindar con una secuencia de
  Postgres cuando el volumen lo amerite.

- **Auto-aprobación de retiros sin scheduler:** hoy se ejecuta al cargar el backoffice o
  el portal (`aplicarRetirosVencidos`). Si nadie abre esas vistas, un retiro vencido no se
  aplica hasta la siguiente carga. En producción debe ser un **cron** (pg_cron / Vercel
  cron) que corra cada cierto tiempo.

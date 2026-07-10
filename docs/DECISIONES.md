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

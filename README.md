# Palomma Protect

Aplicativo de la fianza de arrendamiento de Palomma. **Next.js + Supabase**, pensado para desplegarse en Vercel y, a futuro, embeberse dentro de Pay.

> Contexto completo del producto y del modelo de datos: ver los documentos maestros del proyecto
> (`Palomma_Protect_Contexto_Maestro_MVP.md` y `Palomma_Protect_Esquema_Base_de_Datos.md`).
>
> Decisiones de configuración (Supabase, seguridad) y deuda técnica: [`docs/DECISIONES.md`](docs/DECISIONES.md).

## Dos superficies

- **`/inmobiliaria`** — portal de la inmobiliaria, con el look de **Pay** (Geist + purple `#4012AB`, sidebar con la pestaña Protect). Tabs: Preaprobados, Contratos, Avisos, Siniestros, Facturación.
- **`/backoffice`** — operación interna de Palomma. Módulos: Inmobiliarias, Usuarios, Calendario, Contratos, Avisos, Facturación, Cobranza.

## Estado del MVP

Flujo E2E funcional, de la creación de la inmobiliaria hasta el ingreso a fianza:

- **Alta de inmobiliaria** (backoffice): lista + creación con autollenado desde Pay
  (⚡ *Traer datos de Pay* consulta `rentals_merchants` de Tinybird por `merchant_id`).
  Genera código `IMB-AAAA-NNN`, arma el **Contrato Marco** desde una plantilla de
  Google Docs → PDF en Drive y lo envía por correo. Modal de gestión: descargar/ver
  contrato, subir el firmado (**activa** la inmobiliaria + correo de bienvenida),
  cambiar estado (activar/suspender/dar de baja) y editar contacto.
- **Motor de scoring / preaprobados**: al activarse la inmobiliaria se dispara el
  modelo de credit scoring (servicio Python sobre datos de pago de Tinybird). Los
  clientes **PRIME + confianza alta + activos** quedan preaprobados y aparecen en el
  portal.
- **Radicación / inducción** (portal inmobiliaria): seleccionar preaprobados →
  descargar Excel prellenado (+correo) → subirlo y validarlo → generar **paz y salvo**
  (con valor asegurado) → firmar y subir → **visto bueno** del analista → la
  inmobiliaria confirma el **ingreso a fianza**. Barra de progreso por etapas,
  reanudar proceso y cancelar.
- **Backoffice · Procesos de inducción**: tabla con etapa, avance y tiempo; modal con
  documentos y botón de *visto bueno* (Palomma **solo aprueba**, nunca ingresa por el
  cliente).
- Esqueleto Next.js (App Router, TypeScript) con el design system de Pay; migraciones
  SQL en `supabase/migrations/` (0001 esquema base → 0011).
- Módulos aún placeholder: Contratos, Avisos, Siniestros, Facturación, Cobranza.

## Cómo correrlo

1. **Instalar dependencias**
   ```bash
   npm install
   ```

2. **Configurar Supabase**
   - Crea un proyecto en [supabase.com](https://supabase.com).
   - Copia `.env.example` a `.env.local` y completa las llaves (Settings → API), más
     las de Google Drive, SMTP y `SCORING_SERVICE_URL`.
   - Aplica las migraciones con la CLI: `npm run sb:push` (corre todo `supabase/migrations/`,
     de `0001_init.sql` a la última). Requiere Docker para el entorno local.

3. **Correr en local**
   ```bash
   npm run dev
   ```
   Abre <http://localhost:3000>. Sin Supabase configurado la app corre igual y muestra estados de "conecta Supabase".

4. **Servicio de scoring** (opcional, para preaprobados en vivo)
   ```bash
   cd scoring-service
   uv run uvicorn api:app --reload   # expone http://127.0.0.1:8000
   ```
   Necesita `scoring-service/.env` con `TINYBIRD_TOKEN` y `TINYBIRD_HOST`. La app lo
   consume vía `SCORING_SERVICE_URL`; el token de Tinybird **nunca** sale de ese `.env`.

## Desplegar en Vercel

- Sube el repo a GitHub e impórtalo en Vercel.
- Agrega las mismas variables de entorno (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) en el proyecto de Vercel.

## Notas de arquitectura

- **La plata se guarda en enteros (pesos)**; nunca `float`.
- **Llave real = UUID**; el código legible (`IMB-2026-001`) es un campo de negocio aparte.
- **Tablas append-only**: `libro_mayor`, `evento_auditoria`, `certificado_version`, `aviso_estado_historial`.
- La **autenticación** se hereda de Pay más adelante; por ahora el backoffice usa la service role key en el servidor. El **RLS** (aislamiento por inmobiliaria) se activa al conectar esa identidad.
- La **capa de datos** (`src/lib/supabase`) está aislada para facilitar el port a DynamoDB en producción.
- **Integraciones aisladas por dominio:** `src/lib/google` (Docs/Drive: contrato marco, paz y salvo, subida a Drive), `src/lib/email` (nodemailer con layout de marca compartido), `src/lib/radicacion.ts` (etapas y reglas de fecha de ingreso). El **scoring** vive fuera de la app, en `scoring-service/` (Python/FastAPI), consumido por HTTP.
- **La radicación avanza por etapas** (`INICIADA → EXCEL_SUBIDO → PAZ_SALVO → EN_VALIDACION → APROBADA → INGRESADA`, más `PENDIENTE_INGRESO` y `CANCELADA`). Palomma da el **visto bueno**; el **ingreso a fianza lo confirma la inmobiliaria** desde su portal, y depende del corte del mes (`DIA_CORTE_INGRESOS`).
- Los documentos generados (contrato marco, Excel de radicación, paz y salvo firmado) se guardan en **subcarpetas de Drive** por inmobiliaria/radicación.

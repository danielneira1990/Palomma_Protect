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

- Esqueleto Next.js (App Router, TypeScript) con el design system de Pay.
- Módulo **Inmobiliarias** (backoffice) funcional: lista + creación, conectado a Supabase, con generación de código `IMB-AAAA-NNN` y `CMF-AAAA-NNN`.
- Migración SQL del esquema completo (`supabase/migrations/0001_init.sql`).
- Los demás módulos están como pantallas placeholder, listos para irse construyendo.

## Cómo correrlo

1. **Instalar dependencias**
   ```bash
   npm install
   ```

2. **Configurar Supabase**
   - Crea un proyecto en [supabase.com](https://supabase.com).
   - En el **SQL Editor**, corre el contenido de `supabase/migrations/0001_init.sql`.
   - Copia `.env.example` a `.env.local` y completa las llaves (Settings → API).

3. **Correr en local**
   ```bash
   npm run dev
   ```
   Abre <http://localhost:3000>. Sin Supabase configurado la app corre igual y muestra estados de "conecta Supabase".

## Desplegar en Vercel

- Sube el repo a GitHub e impórtalo en Vercel.
- Agrega las mismas variables de entorno (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) en el proyecto de Vercel.

## Notas de arquitectura

- **La plata se guarda en enteros (pesos)**; nunca `float`.
- **Llave real = UUID**; el código legible (`IMB-2026-001`) es un campo de negocio aparte.
- **Tablas append-only**: `libro_mayor`, `evento_auditoria`, `certificado_version`, `aviso_estado_historial`.
- La **autenticación** se hereda de Pay más adelante; por ahora el backoffice usa la service role key en el servidor. El **RLS** (aislamiento por inmobiliaria) se activa al conectar esa identidad.
- La **capa de datos** (`src/lib/supabase`) está aislada para facilitar el port a DynamoDB en producción.

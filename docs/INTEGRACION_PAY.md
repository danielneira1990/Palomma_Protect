# Integración de Protect en Palomma Pay

Plan para llevar **Palomma Protect** (hoy un MVP funcional, standalone) a un **módulo
dentro de Palomma Pay**. Incluye el stack de Pay detectado, la arquitectura recomendada,
qué se reutiliza y las decisiones que faltan.

> **Idea central:** Protect **no es un producto nuevo que montar desde cero.** Es agregar
> **procedimientos tRPC + componentes React** al Pay que ya existe, **heredando login y
> multi-tenant**. El MVP actual queda como **referencia funcional** (la lógica y la UX ya
> están escritas y probadas).

---

## 1. Stack detectado (Pay) vs. Protect

| Capa | Pay (detectado) | Protect (MVP actual) | Encaje |
|---|---|---|---|
| Frontend | **React + Vite** (SPA) | React + Next.js | Mismo React → la UI se reutiliza (adaptando server components → cliente) |
| API | **tRPC** (batch), TypeScript | Next server actions / route handlers (TS) | Mismo lenguaje → la lógica pasa a **procedimientos tRPC** |
| Backend/infra | **AWS** (API Gateway + Lambda), us-east-1 | Node (Next runtime) | La lógica corre en su Lambda |
| Auth | **Stytch** (gestionado) | (sin auth; service role) | Protect **valida la sesión de Stytch** — no construye auth |
| Multi-tenant | `rentalsMerchantId` en el contexto tRPC | `merchant_id` (mismo concepto) | Se hereda del contexto — gratis |
| Base de datos | **DynamoDB** (NoSQL) | Postgres/Supabase (relacional) | **Único punto de rediseño** (ver §5) |
| Datos de scoring | Tinybird (`rentals_*`) | Tinybird (mismo) | Igual |

*(Detectado inspeccionando el portal: `/vite.svg` + `id="root"`; llamadas tRPC a
`*.execute-api.us-east-1.amazonaws.com`; llaves `stytch_sdk_state_...` en localStorage;
input `{"rentalsMerchantId": "..."}`.)*

---

## 2. Arquitectura recomendada

```
        Pay (React + Vite SPA)
        └── Pestaña "Protect"  ← componentes React (UI reutilizada)
                   │  (cliente tRPC, con la sesión de Stytch)
                   ▼
        Router tRPC de Pay (AWS Lambda, TypeScript)
        └── procedimientos de Protect  ← lógica reutilizada de src/lib/*
                   │            (contexto ya da usuario + rentalsMerchantId)
        ┌──────────┼───────────────────────────┐
        ▼          ▼                            ▼
   Store de     Servicio de scoring        Integraciones server-side
   Protect      (Python, Tinybird)         (Google Docs/Drive, correo, AUCO)
   (§5)
```

- **Auth + tenant:** el contexto tRPC de Pay ya resuelve usuario + `rentalsMerchantId`.
  Cada consulta de Protect se **acota por ese id** (hoy Protect no filtra por inmobiliaria
  porque no hay auth; ese es el cambio sistemático en la integración).
- **Feature flag:** "prender" Protect por merchant → aparece el tab. Da el **rollout por
  fases gratis** (1 → N inmobiliarias).

---

## 3. Qué se reutiliza (mapa)

La **lógica de negocio** ya está aislada en `src/lib/*` (funciones que reciben el cliente
de datos y devuelven resultados) → se levantan casi sin tocar como procedimientos tRPC:

| Módulo (`src/lib/…`) | Qué hace | → Procedimiento(s) tRPC |
|---|---|---|
| `contratos.ts` | Materializa contratos + codeudores al ingresar | `protect.ingresar` |
| `novedades.ts` | Novedades, semáforo, auto-aprobación de retiros | `protect.novedades.*`, retiros |
| `radicacion.ts` | Etapas, corte, tasas | (helpers) |
| `config.ts` | Parámetros (IPC, umbrales, ventana) + calendario | `protect.config.*` |
| `auco.ts` | Valida la firma AUCO desde el PDF | `protect.firmar` |
| `google/*` | Contrato marco, paz y salvo, certificado, Drive | server-side |
| `email/*` | Correos de marca (nodemailer) | server-side |

Las **server actions / route handlers** (`src/app/**/actions.ts`, `**/route.ts`) son la
"cola" de Next que envuelve esa lógica → se convierten en los procedimientos tRPC. Las
**páginas** (server components) → componentes React que llaman a esos procedimientos.

**Servicios que se mantienen aparte:** el **scoring** (`scoring-service/`, Python/FastAPI
sobre Tinybird) y las integraciones externas (Google, SMTP, AUCO).

---

## 4. Autenticación (Stytch)

- Pay ya autentica con **Stytch**; el front tiene la sesión.
- Protect **no construye login**: su procedimiento tRPC toma el **contexto** (usuario +
  `rentalsMerchantId`) que Pay ya arma al validar la sesión de Stytch.
- **A confirmar con devs:** ¿usan Stytch **B2B con Organizations**? ¿cómo mapea la
  organización/miembro de Stytch al `rentalsMerchantId`?

---

## 5. Base de datos — la decisión de diseño

Protect se construyó sobre **Postgres (relacional)** para prototipar rápido, con la capa de
datos **aislada a propósito** para portarla (ver `CLAUDE.md`). Pay usa **DynamoDB (NoSQL)**.
Pasar de relacional (con joins) a DynamoDB (por patrones de acceso, sin joins) es el **único
trabajo de diseño real** del port.

- **Opción A — Protect con store propio** (Postgres/Supabase como servicio, o tablas
  propias): rápido, sin remodelar; comparte solo identidad + `rentalsMerchantId` + Tinybird.
- **Opción B — Protect en la DynamoDB de Pay** (un ecosistema): modelar las entidades en
  DynamoDB (single-table / tablas nuevas). Más trabajo, todo en casa.

El **modelo relacional** (ver `docs/TABLAS.md`) + las funciones de `src/lib/*` son la
**especificación** de qué datos y accesos necesita Protect → insumo directo para diseñar el
DynamoDB.

---

## 6. Decisiones pendientes (para el equipo de tecnología)

1. **Módulo:** ¿cómo se agrega una sección/ruta nueva a la app de Pay (mismo repo /
   micro-frontend)?
2. **Endpoints:** ¿los procedimientos de Protect van en el router tRPC existente / detrás
   del mismo gateway?
3. **Store:** ¿Protect mantiene su propio store o vive en la **DynamoDB** de Pay? (§5)
4. **Stytch:** mapeo organización/miembro → `rentalsMerchantId`.
5. **Design system:** ¿hay una librería de componentes que los módulos deban usar?

---

## 7. Faseo sugerido

- **Rollout (feature flag):** prender Protect para 1 piloto → luego N inmobiliarias.
- **Capacidades del tab:**
  - **Fase 1:** preaprobados → radicación → ingreso → **contratos + certificado**.
  - **Fase 2:** novedades/retiros + **facturación**.
  - **Fase 3:** siniestros/cobranza.

El tab puede salir con la Fase 1 y encender el resto sin rehacer nada.

---

## 8. Qué NO cambiar todavía

- **No refactorizar la capa de datos** hasta decidir el store (§5): sería adivinar.
- El repo actual = **referencia funcional + plano**; seguir prototipando aquí (es más
  rápido) mientras se integra.

---

## 9. Pendientes conocidos (deuda técnica)

- **Scoping por merchant:** hoy Protect no filtra por inmobiliaria (no hay auth); en la
  integración cada consulta lleva `rentalsMerchantId` del contexto.
- **Cron de auto-aprobación de retiros:** hoy corre "al cargar"; en prod, un cron.
- **AUCO por API/webhook:** hoy se valida el PDF firmado a mano.
- **Pruebas automatizadas:** faltan (el E2E manual está pendiente).
- Detalles menores en `docs/DECISIONES.md → Deuda técnica`.

---

*Referencias en el repo: `README.md` (estado del MVP), `docs/DECISIONES.md` (decisiones),
`docs/TABLAS.md` (modelo de datos).*

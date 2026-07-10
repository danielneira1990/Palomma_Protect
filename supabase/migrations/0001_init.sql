-- ============================================================================
-- Palomma Protect — Migración inicial (MVP)
-- Implementa el esquema de Palomma_Protect_Esquema_Base_de_Datos.md (v0.2).
-- Convenciones: PK = UUID; plata = BIGINT (pesos, enteros); tasas = NUMERIC(7,5).
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------- Personas y organización ----------------------------------------
create table if not exists persona (
  id              uuid primary key default gen_random_uuid(),
  documento       text not null,
  tipo_documento  text default 'CC' check (tipo_documento in ('CC','CE','NIT','PP')),
  tipo_persona    text default 'NATURAL' check (tipo_persona in ('NATURAL','JURIDICA')),
  nombre          text,
  email           text,
  telefono        text,
  created_at      timestamptz not null default now()
);

create table if not exists inmobiliaria (
  id                  uuid primary key default gen_random_uuid(),
  codigo              text unique,                    -- IMB-AAAA-NNN
  razon_social        text not null,
  nit                 text,
  representante_legal text,
  cc_representante    text,
  persona_contacto    text,
  email_contacto      text,
  telefono            text,
  sucursal            text,
  ciudad              text,
  direccion           text,
  modalidad_pago      text default 'Facturación',
  num_contrato_marco  text,                           -- CMF-AAAA-NNN
  tasa_canon          numeric(7,5),
  tasa_integral       numeric(7,5),
  tasa_penal          numeric(7,5),
  estado              text default 'PENDIENTE' check (estado in ('PENDIENTE','ACTIVA','SUSPENDIDA','INACTIVA')),
  sagrilaft_estado    text default 'PENDIENTE' check (sagrilaft_estado in ('PENDIENTE','EN_REVISION','APROBADO','RECHAZADO')),
  sagrilaft_fecha     date,
  created_at          timestamptz not null default now()
);

create table if not exists usuario (
  id              uuid primary key default gen_random_uuid(),
  email           text unique not null,
  nombre          text,
  ambito          text check (ambito in ('PALOMMA','INMOBILIARIA')),
  rol             text,
  id_inmobiliaria uuid references inmobiliaria(id),
  activo          boolean default true,
  created_at      timestamptz not null default now()
);

-- ---------- Estudios (incluye preaprobación) --------------------------------
create table if not exists estudio (
  id                    uuid primary key default gen_random_uuid(),
  codigo                text,                          -- EST-AAAA-NNNNN
  tipo_estudio          text default 'PREAPROBACION' check (tipo_estudio in ('NORMAL','INDUCCION','PREAPROBACION')),
  id_inmobiliaria       uuid references inmobiliaria(id),
  id_persona            uuid references persona(id),
  analista_id           uuid references usuario(id),
  merchant_id           text,
  score                 int,
  tier                  text check (tier in ('PRIME','STANDARD','SUBPRIME','HIGH_RISK','VERY_HIGH_RISK','NOT_SCORABLE')),
  cupo_max              bigint,
  tasa_sugerida         numeric(7,5),
  default_rate          numeric(7,5),
  risk_flags            jsonb,
  score_payload         jsonb,
  fecha_snapshot        timestamptz,
  estado                text default 'EN_ANALISIS' check (estado in ('EN_ANALISIS','APLAZADO_FALTA_INFO','APROBADO','CONDICIONAL','NO_VIABLE')),
  decision_final        boolean default false,
  decision_fianza       text check (decision_fianza in ('APROBADO','CONDICIONAL','NO_VIABLE')),
  estado_ingreso        text default 'PREAPROBADO' check (estado_ingreso in ('PREAPROBADO','INGRESADO','VENCIDO')),
  vigencia_hasta        date,
  fecha_ingreso_estudio timestamptz,                   -- hora de radicación (SLA)
  fecha_resultado       timestamptz,                   -- hora de resultado (SLA)
  created_at            timestamptz not null default now()
);

-- ---------- Contratos (fianza) ----------------------------------------------
create table if not exists contrato (
  id                        uuid primary key default gen_random_uuid(),
  codigo                    text unique,               -- FZ-SUC-AAAA-NNNNN
  id_inmobiliaria           uuid references inmobiliaria(id),
  id_estudio                uuid references estudio(id),
  num_contrato_arr          text,
  inmueble_direccion        text,
  inmueble_ciudad           text,
  tipo_destino              text check (tipo_destino in ('VIVIENDA','COMERCIO')),
  sucursal                  text,
  canon                     bigint,
  iva_canon                 bigint,
  administracion            bigint,
  -- Línea canon
  linea_canon               boolean default true,
  valor_afianzado_canon     bigint,
  tasa_canon                numeric(7,5),
  costo_canon_neto          bigint,
  iva_canon_servicio        bigint,
  costo_canon_total         bigint,
  -- Línea integral
  linea_integral            boolean default false,
  valor_afianzado_integral  bigint,
  tasa_integral             numeric(7,5),
  costo_integral_neto       bigint,
  iva_integral_servicio     bigint,
  costo_integral_total      bigint,
  -- Línea penal
  linea_penal               boolean default false,
  valor_afianzado_penal     bigint,
  tasa_penal                numeric(7,5),
  costo_penal_neto          bigint,
  iva_penal_servicio        bigint,
  costo_penal_total         bigint,
  -- Estado / fechas
  estado                    text default 'ACTIVO' check (estado in ('ACTIVO','POR_VENCER','TERMINADO','RETIRADO','SUSPENDIDO')),
  fecha_inicio              date,
  fecha_fin                 date,
  fecha_ingreso             date,
  id_certificado_vigente    uuid,
  created_at                timestamptz not null default now()
);

create table if not exists contrato_persona (
  id          uuid primary key default gen_random_uuid(),
  id_contrato uuid references contrato(id),
  id_persona  uuid references persona(id),
  rol         text check (rol in ('ARRENDATARIO','CODEUDOR','PROPIETARIO'))
);

create table if not exists cartera_mensual (
  id                        uuid primary key default gen_random_uuid(),
  periodo                   text,                      -- AAAA-MM
  id_contrato               uuid references contrato(id),
  id_inmobiliaria           uuid references inmobiliaria(id),
  valor_afianzado_canon     bigint,
  valor_afianzado_integral  bigint,
  valor_afianzado_penal     bigint,
  costo_servicio            bigint,
  estado_contrato           text,
  fecha_snapshot            timestamptz not null default now()
);

create table if not exists novedad (
  id               uuid primary key default gen_random_uuid(),
  codigo           text,                               -- NOV-AAAA-NNN
  id_contrato      uuid references contrato(id),
  id_inmobiliaria  uuid references inmobiliaria(id),
  tipo             text check (tipo in ('AUMENTO','RETIRO','TRASLADO','RENOVACION')),
  motivo           text check (motivo in ('TERMINACION_VENCIMIENTO','MUTUO_ACUERDO','INCUMPLIMIENTO_ARRENDATARIO','VENTA_INMUEBLE','TRASLADO_AFIANZADORA','OTRO')),
  payload_anterior jsonb,
  payload_nuevo    jsonb,
  fecha_vigencia   date,
  estado           text default 'SOLICITADA' check (estado in ('SOLICITADA','PENDIENTE_APROBACION','APLICADA','RECHAZADA')),
  solicitado_por   uuid references usuario(id),
  aprobado_por     uuid references usuario(id),
  created_at       timestamptz not null default now()
);

create table if not exists certificado_version (
  id               uuid primary key default gen_random_uuid(),
  id_contrato      uuid references contrato(id),
  version          int not null,
  snapshot         jsonb,
  id_documento_pdf uuid,
  hash             text,
  firmado          boolean default false,
  firmado_por      text,
  fecha_firma      timestamptz,
  vigencia_desde   date,
  vigencia_hasta   date,
  created_at       timestamptz not null default now()
);

-- ---------- Avisos / cobertura ----------------------------------------------
create table if not exists aviso (
  id              uuid primary key default gen_random_uuid(),
  codigo          text,                                -- SIN-AAAA-NNNNN
  id_contrato     uuid references contrato(id),
  id_inmobiliaria uuid references inmobiliaria(id),
  estado          text default 'AVISO' check (estado in ('AVISO','DESISTIDO','OBJETADO','TERMINADO','DESOCUPADO','SINIESTRO_NUEVO','VIGENTE','CARTERA_EN_GESTION')),
  origen_aviso    text check (origen_aviso in ('PASARELA','MANUAL')),
  fecha_aviso     date,
  fecha_ocurrencia date,                               -- inicio real del siniestro
  meses_mora      int,
  created_at      timestamptz not null default now()
);

create table if not exists aviso_estado_historial (
  id            uuid primary key default gen_random_uuid(),
  id_aviso      uuid references aviso(id),
  estado        text,
  fecha_estado  date,                                  -- fecha de cada transición
  motivo        text,
  ubicacion     text,
  etapa_cobranza text check (etapa_cobranza in ('PREJURIDICO','MIXTO','DESOCUPADOS','CARTERA')),
  etapa_juridica text,
  abogado_id    uuid references usuario(id),
  usuario_id    uuid references usuario(id),
  created_at    timestamptz not null default now()
);

create table if not exists pago_obligaciones (
  id          uuid primary key default gen_random_uuid(),
  id_aviso    uuid references aviso(id),
  tipo        text check (tipo in ('NUEVO','VIGENTE')),
  monto       bigint,
  periodo     text,
  fecha_pago  date,
  created_at  timestamptz not null default now()
);

create table if not exists acuerdo_de_pago (
  id          uuid primary key default gen_random_uuid(),
  id_aviso    uuid references aviso(id),
  monto_total bigint,                                  -- sin intereses
  num_cuotas  int,
  estado      text default 'VIGENTE' check (estado in ('VIGENTE','CUMPLIDO','INCUMPLIDO')),
  created_by  uuid references usuario(id),
  created_at  timestamptz not null default now()
);

create table if not exists acuerdo_cuota (
  id                uuid primary key default gen_random_uuid(),
  id_acuerdo        uuid references acuerdo_de_pago(id),
  num_cuota         int,
  fecha_vencimiento date,
  valor             bigint,
  estado            text default 'PENDIENTE' check (estado in ('PENDIENTE','PAGADA','VENCIDA')),
  fecha_pago        date
);

create table if not exists gestion_cobranza (
  id           uuid primary key default gen_random_uuid(),
  id_aviso     uuid references aviso(id),
  canal        text check (canal in ('WHATSAPP','LLAMADA','CORREO','VISITA')),
  fecha        timestamptz not null default now(),
  resultado    text,
  nota         text,
  proximo_paso text,
  usuario_id   uuid references usuario(id)
);

-- ---------- Dinero ----------------------------------------------------------
-- Libro mayor: APPEND-ONLY. No actualizar ni borrar filas.
create table if not exists libro_mayor (
  id              uuid primary key default gen_random_uuid(),
  id_inmobiliaria uuid references inmobiliaria(id),
  id_contrato     uuid references contrato(id),
  id_aviso        uuid references aviso(id),
  cuenta          text not null check (cuenta in ('DEUDA_SUBROGADA','HONORARIOS','REINTEGRO','CONDONACION','COSTO_SERVICIO','PAGO_A_INMOBILIARIA')),
  concepto        text,
  monto           bigint not null,
  contraparte     text check (contraparte in ('PALOMMA','INMOBILIARIA','DEUDOR','PROPIETARIO')),
  autorizado_por  uuid references usuario(id),         -- obligatorio en CONDONACION
  fecha_movimiento date not null default current_date,
  referencia      text,
  created_at      timestamptz not null default now()
);

create table if not exists recaudo (
  id              uuid primary key default gen_random_uuid(),
  id_aviso        uuid references aviso(id),
  id_inmobiliaria uuid references inmobiliaria(id),
  tipo_recaudo    text check (tipo_recaudo in ('HONORARIO','RECOBRO','REINTEGRO')),
  monto           bigint,
  periodo         text,
  fecha           date
);

create table if not exists deuda_snapshot_mensual (
  id               uuid primary key default gen_random_uuid(),
  id_aviso         uuid references aviso(id),
  periodo          text,
  saldo_deuda      bigint,
  saldo_honorarios bigint,
  pagado_en_mes    bigint,
  estado_aviso     text,
  fecha_snapshot   timestamptz not null default now()
);

create table if not exists factura (
  id              uuid primary key default gen_random_uuid(),
  codigo          text,                                -- FAC-AAAA-MM-NNN
  id_inmobiliaria uuid references inmobiliaria(id),
  periodo         text,
  costo_neto      bigint,
  iva_total       bigint,
  costo_con_iva   bigint,
  siniestros      bigint,
  reintegros      bigint,
  total_bruto     bigint,
  saldo_neto      bigint,
  estado          text default 'BORRADOR' check (estado in ('BORRADOR','EMITIDA','PAGADA','A_FAVOR')),
  fecha_emision   date,
  created_at      timestamptz not null default now()
);

create table if not exists factura_detalle (
  id                  uuid primary key default gen_random_uuid(),
  id_factura          uuid references factura(id),
  id_contrato         uuid references contrato(id),
  periodo             text,
  costo_canon_neto    bigint,
  costo_integral_neto bigint,
  costo_penal_neto    bigint,
  costo_neto          bigint,
  iva                 bigint,
  costo_con_iva       bigint,
  fecha_snapshot      timestamptz not null default now()
);

-- ---------- Soporte y catálogos ---------------------------------------------
create table if not exists documento (
  id              uuid primary key default gen_random_uuid(),
  tipo_entidad    text,                                -- CONTRATO / SINIESTRO / INMOBILIARIA...
  id_entidad      uuid,
  tipo_documento  text check (tipo_documento in ('CONTRATO_ARRIENDO','CERTIFICADO','PAZ_Y_SALVO','SOPORTE','COMPROBANTE_PAGO')),
  storage_key     text,
  hash            text,
  created_at      timestamptz not null default now()
);

create table if not exists consentimiento (
  id            uuid primary key default gen_random_uuid(),
  id_persona    uuid references persona(id),
  tipo          text check (tipo in ('TERMINOS','TRATAMIENTO_DATOS','CONSULTA_CENTRALES')),
  aceptado      boolean default false,
  fecha         timestamptz,
  evidencia     text
);

-- Evento auditoría: APPEND-ONLY.
create table if not exists evento_auditoria (
  id              uuid primary key default gen_random_uuid(),
  tipo_entidad    text,
  id_entidad      uuid,
  accion          text,
  estado_anterior text,
  estado_nuevo    text,
  usuario_id      uuid references usuario(id),
  payload         jsonb,
  created_at      timestamptz not null default now()
);

create table if not exists calendario_operativo (
  id                    uuid primary key default gen_random_uuid(),
  periodo               text,                          -- AAAA-MM
  corte_ingresos        date,
  corte_retiros         date,
  corte_novedades       date,
  dia_max_avisos        date,
  dia_desistimientos    date,
  pago_siniestro_nuevo  date,
  pago_siniestro_vigente date,
  created_at            timestamptz not null default now()
);

create table if not exists tasa (
  id              uuid primary key default gen_random_uuid(),
  id_inmobiliaria uuid references inmobiliaria(id),
  linea           text check (linea in ('CANON','INTEGRAL','PENAL')),
  tasa            numeric(7,5),
  vigencia_desde  date,
  vigencia_hasta  date
);

create table if not exists parametro (
  id             uuid primary key default gen_random_uuid(),
  clave          text,
  valor          text,
  vigencia_desde date,
  vigencia_hasta date
);

-- ---------- Índices útiles --------------------------------------------------
create index if not exists idx_contrato_inmo   on contrato(id_inmobiliaria);
create index if not exists idx_estudio_inmo    on estudio(id_inmobiliaria);
create index if not exists idx_aviso_inmo      on aviso(id_inmobiliaria);
create index if not exists idx_aviso_contrato  on aviso(id_contrato);
create index if not exists idx_libro_aviso     on libro_mayor(id_aviso);
create index if not exists idx_factura_inmo    on factura(id_inmobiliaria);

-- NOTA: RLS (aislamiento por inmobiliaria) se activa cuando se conecte la
-- identidad heredada de Pay. Ver documento maestro, sección 10.

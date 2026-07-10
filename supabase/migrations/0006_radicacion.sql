-- ============================================================================
-- Proceso de inducción / radicación (batch por etapas).
-- Agrupa los preaprobados que una inmobiliaria decidió afianzar juntos y va
-- avanzando por etapas: INICIADA → EXCEL_SUBIDO → PAZ_SALVO → FIRMADO → INGRESADA.
-- ============================================================================

create table if not exists radicacion (
  id               uuid primary key default gen_random_uuid(),
  codigo           text,                                -- RAD-AAAA-NNN
  id_inmobiliaria  uuid references inmobiliaria(id),
  etapa            text default 'INICIADA' check (etapa in (
                     'INICIADA','EXCEL_SUBIDO','PAZ_SALVO','FIRMADO','INGRESADA')),
  num_clientes     int,
  valor_asegurado  bigint,
  excel_key        text,                                -- link del Excel subido
  paz_salvo_key    text,                                -- link del paz y salvo
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Vínculo estudio → radicación (un preaprobado pertenece a un proceso a la vez).
alter table estudio add column if not exists id_radicacion uuid references radicacion(id);

create index if not exists idx_radicacion_inmo on radicacion(id_inmobiliaria);
create index if not exists idx_radicacion_etapa on radicacion(etapa);
create index if not exists idx_estudio_radicacion on estudio(id_radicacion);

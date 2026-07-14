-- ============================================================================
-- Registro del último "rebote" de una radicación (validación del Excel o de la
-- firma que no pasó). Sirve para que el backoffice VEA que un cliente se atascó
-- y con qué error, y pueda contactarlo para ayudarlo. Se limpia al avanzar.
-- ============================================================================

alter table radicacion
  add column if not exists ultimo_error     text,
  add column if not exists ultimo_error_at  timestamptz;

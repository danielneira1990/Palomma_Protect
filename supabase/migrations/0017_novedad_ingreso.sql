-- ============================================================================
-- Novedades de la cartera afianzada: ingresos, retiros y aumentos de canon.
--  - Se agrega 'INGRESO' al tipo (cada contrato que entra deja su novedad).
--  - `actor`: quién hizo la novedad (mientras no haya login/usuarios reales:
--    "Inmobiliaria X" o "Backoffice"). Cuando llegue la auth de Pay se migra a
--    solicitado_por/aprobado_por.
-- ============================================================================

alter table novedad drop constraint if exists novedad_tipo_check;
alter table novedad
  add constraint novedad_tipo_check
  check (tipo in ('INGRESO','AUMENTO','RETIRO','TRASLADO','RENOVACION'));

alter table novedad
  add column if not exists actor text;

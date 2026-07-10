-- ============================================================================
-- Agrega el estado CANCELADA al proceso de radicación.
-- Al cancelar, los preaprobados se liberan (id_radicacion = null) y vuelven a
-- estar disponibles; la radicación queda registrada como CANCELADA.
-- ============================================================================

alter table radicacion drop constraint if exists radicacion_etapa_check;
alter table radicacion add constraint radicacion_etapa_check
  check (etapa in (
    'INICIADA','EXCEL_SUBIDO','PAZ_SALVO','FIRMADO','INGRESADA','CANCELADA'
  ));

-- ============================================================================
-- Estado PENDIENTE_INGRESO: cuando la inmobiliaria firma y solicita ingreso
-- después del corte del mes, queda pendiente para el ingreso real del mes
-- siguiente (antes del corte, ingresa de una → INGRESADA).
-- ============================================================================

alter table radicacion drop constraint if exists radicacion_etapa_check;
alter table radicacion add constraint radicacion_etapa_check
  check (etapa in (
    'INICIADA','EXCEL_SUBIDO','PAZ_SALVO','FIRMADO','INGRESADA','CANCELADA','PENDIENTE_INGRESO'
  ));

-- ============================================================================
-- Estado APROBADA: el analista dio el visto bueno (documentos y firma OK), pero
-- el ingreso final lo hace la inmobiliaria desde su portal (Palomma no ingresa
-- por ella). Flujo: EN_VALIDACION → (visto bueno) → APROBADA → (ingreso) → INGRESADA.
-- ============================================================================

alter table radicacion drop constraint if exists radicacion_etapa_check;
alter table radicacion add constraint radicacion_etapa_check
  check (etapa in (
    'INICIADA','EXCEL_SUBIDO','PAZ_SALVO','FIRMADO','EN_VALIDACION','APROBADA',
    'INGRESADA','CANCELADA','PENDIENTE_INGRESO'
  ));

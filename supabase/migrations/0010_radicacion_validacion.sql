-- ============================================================================
-- Paso intermedio EN_VALIDACION: cuando la inmobiliaria sube el paz y salvo
-- firmado, el proceso queda en validación para que un analista de Palomma
-- revise los documentos y la firma, y apruebe el afianzamiento.
-- ============================================================================

alter table radicacion drop constraint if exists radicacion_etapa_check;
alter table radicacion add constraint radicacion_etapa_check
  check (etapa in (
    'INICIADA','EXCEL_SUBIDO','PAZ_SALVO','FIRMADO','EN_VALIDACION',
    'INGRESADA','CANCELADA','PENDIENTE_INGRESO'
  ));

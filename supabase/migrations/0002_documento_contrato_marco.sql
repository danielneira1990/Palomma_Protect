-- ============================================================================
-- Agrega CONTRATO_MARCO a los tipos de documento permitidos.
-- Se usa al generar el Contrato Marco de una inmobiliaria en Google Drive.
-- ============================================================================

alter table documento drop constraint if exists documento_tipo_documento_check;

alter table documento add constraint documento_tipo_documento_check
  check (tipo_documento in (
    'CONTRATO_ARRIENDO',
    'CERTIFICADO',
    'PAZ_Y_SALVO',
    'SOPORTE',
    'COMPROBANTE_PAGO',
    'CONTRATO_MARCO'
  ));

-- ============================================================================
-- Flujo de firma del Contrato Marco.
--   1. drive_folder_id: la subcarpeta de Drive de cada inmobiliaria, para subir
--      el contrato firmado a la misma carpeta donde vive el generado.
--   2. CONTRATO_MARCO_FIRMADO: nuevo tipo de documento para el PDF firmado.
-- ============================================================================

alter table inmobiliaria add column if not exists drive_folder_id text;

alter table documento drop constraint if exists documento_tipo_documento_check;
alter table documento add constraint documento_tipo_documento_check
  check (tipo_documento in (
    'CONTRATO_ARRIENDO',
    'CERTIFICADO',
    'PAZ_Y_SALVO',
    'SOPORTE',
    'COMPROBANTE_PAGO',
    'CONTRATO_MARCO',
    'CONTRATO_MARCO_FIRMADO'
  ));

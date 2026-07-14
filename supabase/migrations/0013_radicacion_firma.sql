-- ============================================================================
-- Evidencia de la firma electrónica (AUCO) de la declaración juramentada.
-- Al subir el documento firmado se parsea el "Certificado de firma" de AUCO y
-- se guarda la evidencia con la que validamos que firmó el representante legal.
--
-- Además: se elimina el paso de validación interna de Palomma. El flujo pasa de
-- PAZ_SALVO directo a FIRMADO (documento firmado + evidencia validada), y de ahí
-- la inmobiliaria misma hace el ingreso. EN_VALIDACION y APROBADA quedan como
-- estados legados permitidos (no se rompe el histórico), pero ya no se usan.
-- ============================================================================

alter table radicacion
  add column if not exists firma_doc_id  text,        -- No. de documento AUCO (ej. 7YMHH5BZNW)
  add column if not exists firma_hash    text,        -- Hash SHA-256 del documento firmado
  add column if not exists firma_email   text,        -- Correo del firmante (rep. legal) según AUCO
  add column if not exists firma_metodo  text,        -- Método de autenticación (OTP/Foto/Documento…)
  add column if not exists firma_at      timestamptz; -- Momento de la firma

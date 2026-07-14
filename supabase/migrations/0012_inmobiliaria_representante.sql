-- ============================================================================
-- Datos de contacto del representante legal de la inmobiliaria.
-- Se usan para (a) enviarle la firma electrónica y (b) validar contra la
-- evidencia de AUCO que el firmante de la declaración es el representante legal.
-- ============================================================================

alter table inmobiliaria
  add column if not exists email_representante   text,
  add column if not exists celular_representante text;

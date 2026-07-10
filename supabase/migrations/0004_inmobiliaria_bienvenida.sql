-- ============================================================================
-- Marca de tiempo del correo de bienvenida enviado a la inmobiliaria.
-- Permite mostrar "enviada el X" y evitar reenvíos automáticos duplicados.
-- ============================================================================

alter table inmobiliaria add column if not exists bienvenida_enviada_at timestamptz;

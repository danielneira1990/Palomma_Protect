-- ============================================================================
-- Carpeta de Drive de cada radicación (dentro de la carpeta de la inmobiliaria).
-- Ahí quedan los comprobantes: el Excel de radicación y el paz y salvo firmado.
-- ============================================================================

alter table radicacion add column if not exists drive_folder_id text;

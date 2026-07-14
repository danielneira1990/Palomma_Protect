-- ============================================================================
-- Fecha en que el estudio/preaprobado se ingresó a fianza. Antes solo teníamos
-- el estado (estado_ingreso = INGRESADO) sin marca de tiempo; esto permite
-- mostrar la fecha de ingreso en el detalle del estudio.
-- ============================================================================

alter table estudio
  add column if not exists fecha_ingreso timestamptz;

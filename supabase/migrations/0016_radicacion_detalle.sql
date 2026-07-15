-- ============================================================================
-- Detalle del Excel de radicación (una fila por contrato: datos del contrato +
-- codeudores), persistido al subir el archivo. Con esto, al ingresar podemos
-- materializar los `contrato` y `contrato_persona` reales sin depender del Excel
-- en Drive. Antes solo guardábamos el agregado (valor_asegurado, num_clientes).
-- ============================================================================

alter table radicacion
  add column if not exists detalle jsonb;

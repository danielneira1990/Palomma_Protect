-- ============================================================================
-- Estado intermedio del contrato mientras se procesa un retiro. Al solicitar el
-- retiro el contrato NO sale de una: queda EN_RETIRO (visible, "en trámite") y
-- solo pasa a RETIRADO cuando Palomma lo aplica o se auto-aprueba la ventana.
-- Si el retiro se cancela (retención), vuelve a ACTIVO.
-- ============================================================================

alter table contrato drop constraint if exists contrato_estado_check;
alter table contrato
  add constraint contrato_estado_check
  check (estado in ('ACTIVO','EN_RETIRO','POR_VENCER','TERMINADO','RETIRADO','SUSPENDIDO'));

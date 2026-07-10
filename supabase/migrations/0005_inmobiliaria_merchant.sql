-- ============================================================================
-- Vincula la inmobiliaria con su merchant en Pay (rentalsMerchantId).
-- Es la llave para cruzar los scores del motor (por merchant) con la inmobiliaria.
-- ============================================================================

alter table inmobiliaria add column if not exists merchant_id text;

create index if not exists idx_inmobiliaria_merchant on inmobiliaria(merchant_id);
create index if not exists idx_estudio_merchant on estudio(merchant_id);

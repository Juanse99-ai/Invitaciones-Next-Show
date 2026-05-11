-- ============================================================
-- NEXT SHOW · Realtime publication
-- Migration 20260510000006
-- Habilita Supabase Realtime para que el front-end suscriba
-- cambios en sillas/órdenes/tickets en tiempo real (mapa de
-- asientos, estado de orden, scanner).
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE seat_holds;
ALTER PUBLICATION supabase_realtime ADD TABLE tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE orders;

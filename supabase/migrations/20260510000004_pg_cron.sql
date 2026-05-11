-- ============================================================
-- NEXT SHOW · pg_cron jobs
-- Migration 20260510000004
-- 3 jobs cada minuto:
--   1. cleanup-expired-holds       : DELETE seat_holds vencidos
--   2. expire-pending-orders       : UPDATE orders pending vencidas → expired
--   3. mark-exhausted-coupons      : UPDATE coupons agotados → exhausted
--
-- Habilitado en producción solamente; en local Supabase la
-- imagen Docker no incluye pg_cron, así que el bloque se salta
-- silenciosamente. En local usar setInterval del cliente o
-- llamadas manuales periódicas.
-- ============================================================

DO $$
BEGIN
  -- Intentar crear la extensión (puede fallar en local — ignorar).
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
  EXCEPTION
    WHEN insufficient_privilege OR feature_not_supported OR undefined_file THEN
      RAISE NOTICE 'pg_cron no disponible en este entorno — skipping cron jobs.';
  END;

  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Cleanup holds expirados cada minuto
    PERFORM cron.schedule(
      'cleanup-expired-holds',
      '* * * * *',
      $cron$ DELETE FROM seat_holds WHERE expires_at < now() $cron$
    );

    -- Marcar orders pending vencidas como expired cada minuto
    PERFORM cron.schedule(
      'expire-pending-orders',
      '* * * * *',
      $cron$ UPDATE orders SET status = 'expired' WHERE status = 'pending' AND expires_at < now() $cron$
    );

    -- Marcar coupons exhausted
    PERFORM cron.schedule(
      'mark-exhausted-coupons',
      '* * * * *',
      $cron$ UPDATE coupons SET status = 'exhausted' WHERE status = 'active' AND uses_count >= max_uses $cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron extension not present — cron jobs skipped (esperado en local).';
  END IF;
END $$;

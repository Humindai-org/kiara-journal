-- ─── Ampliar tipos de cuenta ─────────────────────────────────
-- Añadir exchanges de crypto y otros brokers
ALTER TABLE public.accounts
  DROP CONSTRAINT IF EXISTS accounts_type_check;

ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_type_check
  CHECK (type IN ('MT5', 'BITGET', 'BYBIT', 'BINANCE', 'MANUAL'));

-- ─── Función: recalcular balance desde trades ─────────────────
-- Llama a esta función tras importar trades para mantener
-- current_balance siempre actualizado.
CREATE OR REPLACE FUNCTION public.recalculate_account_balance(p_account_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_initial  numeric;
  v_pnl      numeric;
  v_balance  numeric;
BEGIN
  SELECT initial_balance INTO v_initial
    FROM public.accounts WHERE id = p_account_id;

  SELECT COALESCE(SUM(net_pnl), 0) INTO v_pnl
    FROM public.trades
   WHERE account_id = p_account_id AND net_pnl IS NOT NULL;

  v_balance := v_initial + v_pnl;

  UPDATE public.accounts
     SET current_balance = v_balance
   WHERE id = p_account_id;

  RETURN v_balance;
END;
$$;

-- Permisos para que el anon key (y service role) puedan llamarla
GRANT EXECUTE ON FUNCTION public.recalculate_account_balance(uuid)
  TO authenticated, service_role;

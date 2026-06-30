-- Extend plans table with new settings columns

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS trading_window_start TEXT DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS trading_window_end   TEXT DEFAULT '17:00',
  ADD COLUMN IF NOT EXISTS min_confluences       INTEGER DEFAULT 10,
  ADD COLUMN IF NOT EXISTS max_consecutive_losses INTEGER DEFAULT 2,
  ADD COLUMN IF NOT EXISTS notes_items           JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS updated_at            TIMESTAMPTZ DEFAULT now();

-- Auto-update updated_at on every plan update
CREATE TRIGGER update_plans_updated_at
  BEFORE UPDATE ON plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

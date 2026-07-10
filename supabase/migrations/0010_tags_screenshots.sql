-- Add tags column to trades
ALTER TABLE trades ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- Add screenshots column to journal_entries (array of {url, note} objects)
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS screenshots jsonb DEFAULT '[]';

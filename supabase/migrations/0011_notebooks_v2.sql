-- Expand category to support new types (drop old constraint, add flexible check)
ALTER TABLE notebooks DROP CONSTRAINT IF EXISTS notebooks_category_check;

-- Remap legacy categories so existing rows satisfy the new constraint
UPDATE notebooks SET category = 'TEMPLATE' WHERE category IN ('PLANNED_TEMPLATE', 'MY_TEMPLATE');
UPDATE notebooks SET category = 'ROUTINE'  WHERE category = 'PRODUCTIVITY';

ALTER TABLE notebooks ADD CONSTRAINT notebooks_category_check
  CHECK (category IN ('MINDSET','STRATEGY','ROUTINE','RISK','TEMPLATE','PLAYBOOK'));

-- New columns
ALTER TABLE notebooks ADD COLUMN IF NOT EXISTS is_pinned   boolean   DEFAULT false;
ALTER TABLE notebooks ADD COLUMN IF NOT EXISTS is_favorite boolean   DEFAULT false;
ALTER TABLE notebooks ADD COLUMN IF NOT EXISTS tags        text[]    DEFAULT '{}';
ALTER TABLE notebooks ADD COLUMN IF NOT EXISTS folder      text;     -- user-defined folder name
ALTER TABLE notebooks ADD COLUMN IF NOT EXISTS color       text;     -- hex color for card accent

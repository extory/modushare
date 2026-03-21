-- Add role column to users (default: 'user', admin: 'admin')
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';

-- Add login_method column to track how user signed up
ALTER TABLE users ADD COLUMN login_method TEXT NOT NULL DEFAULT 'email';

-- Backfill login_method for existing Google users
UPDATE users SET login_method = 'google' WHERE google_id IS NOT NULL AND google_id != '';

-- Add clipboard_stats view for quick aggregation
CREATE VIEW IF NOT EXISTS v_user_clipboard_stats AS
SELECT
  u.id AS user_id,
  u.email,
  COUNT(CASE WHEN ci.is_deleted = 0 THEN 1 END) AS item_count,
  COALESCE(SUM(CASE WHEN ci.is_deleted = 0 THEN LENGTH(COALESCE(ci.content_text, '')) END), 0) AS text_bytes
FROM users u
LEFT JOIN clipboard_items ci ON ci.user_id = u.id
GROUP BY u.id, u.email;

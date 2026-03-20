CREATE TABLE IF NOT EXISTS clipboard_items (
  id           TEXT    PRIMARY KEY,
  user_id      TEXT    NOT NULL REFERENCES users(id),
  device_id    TEXT    NOT NULL,
  content_type TEXT    NOT NULL,
  content_text TEXT,
  image_path   TEXT,
  created_at   INTEGER NOT NULL,
  is_deleted   INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_clipboard_items_user_id ON clipboard_items(user_id);
CREATE INDEX IF NOT EXISTS idx_clipboard_items_created_at ON clipboard_items(created_at DESC);

CREATE TABLE IF NOT EXISTS file_transfers (
  id          TEXT PRIMARY KEY,
  sender_id   TEXT NOT NULL REFERENCES users(id),
  file_name   TEXT NOT NULL,
  file_size   INTEGER NOT NULL,
  mime_type   TEXT NOT NULL,
  file_path   TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

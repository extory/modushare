-- Share pairs: A can share clipboard with B
CREATE TABLE IF NOT EXISTS share_pairs (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  UNIQUE(user_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_share_pairs_user ON share_pairs(user_id);
CREATE INDEX IF NOT EXISTS idx_share_pairs_target ON share_pairs(target_id);

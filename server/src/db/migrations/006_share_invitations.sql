-- Share invitations: A invites B, B can accept or reject
CREATE TABLE IF NOT EXISTS share_invitations (
  id          TEXT PRIMARY KEY,
  from_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | rejected
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  UNIQUE(from_id, to_id)
);

CREATE INDEX IF NOT EXISTS idx_share_inv_to ON share_invitations(to_id, status);
CREATE INDEX IF NOT EXISTS idx_share_inv_from ON share_invitations(from_id);

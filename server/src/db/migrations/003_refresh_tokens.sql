CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         TEXT    PRIMARY KEY,
  user_id    TEXT    NOT NULL REFERENCES users(id),
  token_hash TEXT    NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked    INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);

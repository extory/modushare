CREATE TABLE IF NOT EXISTS users (
  id          TEXT    PRIMARY KEY,
  username    TEXT    UNIQUE NOT NULL,
  email       TEXT    UNIQUE NOT NULL,
  password_hash TEXT  NOT NULL,
  sync_enabled INTEGER DEFAULT 1,
  created_at  INTEGER NOT NULL
);

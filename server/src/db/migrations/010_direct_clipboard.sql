CREATE TABLE clipboard_devices (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY(user_id, device_id)
);
CREATE TABLE clipboard_deliveries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(user_id, device_id) REFERENCES clipboard_devices(user_id, device_id) ON DELETE CASCADE
);
CREATE INDEX clipboard_deliveries_recipient ON clipboard_deliveries(user_id, device_id, created_at DESC);

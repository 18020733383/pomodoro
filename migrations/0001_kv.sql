CREATE TABLE IF NOT EXISTS kv (
  client_id TEXT NOT NULL,
  k TEXT NOT NULL,
  v TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (client_id, k)
);

CREATE INDEX IF NOT EXISTS kv_client_id ON kv (client_id);

ALTER TABLE users ADD COLUMN google_id TEXT;
ALTER TABLE users ADD COLUMN avatar_url TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;

-- password_hash 를 nullable 로 변경은 SQLite 에서 불가하므로
-- Google 전용 계정은 password_hash 에 빈 문자열 저장

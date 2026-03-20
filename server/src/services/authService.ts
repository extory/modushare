import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import db from '../db';
import { config } from '../config';

interface JWTPayload {
  userId: string;
  iat?: number;
  exp?: number;
}

interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: number;
  revoked: number;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export const authService = {
  hashPassword(password: string): string {
    return bcrypt.hashSync(password, 12);
  },

  verifyPassword(password: string, hash: string): boolean {
    return bcrypt.compareSync(password, hash);
  },

  generateAccessToken(userId: string): string {
    return jwt.sign({ userId }, config.JWT_SECRET, {
      expiresIn: config.JWT_ACCESS_EXPIRY as jwt.SignOptions['expiresIn'],
    });
  },

  /**
   * Generates a refresh token, persists the hash to the DB and returns the
   * raw token that will be sent to the client (never stored in plain text).
   */
  generateRefreshToken(userId: string): string {
    const rawToken = uuidv4();
    const tokenHash = hashToken(rawToken);
    const id = uuidv4();

    // Parse JWT-style duration string into ms for expires_at calculation
    const durationMs = parseDuration(config.JWT_REFRESH_EXPIRY);
    const expiresAt = Date.now() + durationMs;

    db.prepare(
      'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)'
    ).run(id, userId, tokenHash, expiresAt);

    return rawToken;
  },

  verifyAccessToken(token: string): JWTPayload | null {
    try {
      return jwt.verify(token, config.JWT_SECRET) as JWTPayload;
    } catch {
      return null;
    }
  },

  /**
   * Validates the refresh token, revokes the used entry, issues a new one
   * (token rotation) and returns { userId, newRefreshToken }.
   */
  verifyAndRotateRefreshToken(
    rawToken: string
  ): { userId: string; newRefreshToken: string } | null {
    const tokenHash = hashToken(rawToken);

    const row = db
      .prepare<string[], RefreshTokenRow>(
        'SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked = 0'
      )
      .get(tokenHash);

    if (!row) return null;
    if (Date.now() > row.expires_at) return null;

    // Revoke used token
    db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?').run(
      row.id
    );

    const newRefreshToken = this.generateRefreshToken(row.user_id);
    return { userId: row.user_id, newRefreshToken };
  },

  revokeRefreshToken(rawToken: string): void {
    const tokenHash = hashToken(rawToken);
    db.prepare(
      'UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?'
    ).run(tokenHash);
  },

  /** Clean up expired tokens older than 24 h */
  pruneExpiredTokens(): void {
    db.prepare(
      'DELETE FROM refresh_tokens WHERE expires_at < ? OR revoked = 1'
    ).run(Date.now() - 86_400_000);
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseDuration(s: string): number {
  const match = s.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error(`Invalid duration: ${s}`);
  const n = parseInt(match[1]!, 10);
  switch (match[2]) {
    case 's': return n * 1_000;
    case 'm': return n * 60_000;
    case 'h': return n * 3_600_000;
    case 'd': return n * 86_400_000;
    default: throw new Error(`Unknown unit: ${match[2]}`);
  }
}

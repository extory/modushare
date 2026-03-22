import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

function required(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config = {
  PORT: parseInt(process.env['PORT'] ?? '3010', 10),
  GOOGLE_CLIENT_ID: process.env['GOOGLE_CLIENT_ID'] ?? '',
  GOOGLE_CLIENT_SECRET: process.env['GOOGLE_CLIENT_SECRET'] ?? '',
  DATABASE_URL: process.env['DATABASE_URL'] ?? path.resolve('./data/modushare.db'),
  JWT_SECRET: required('JWT_SECRET', 'dev-secret-change-in-production'),
  JWT_ACCESS_EXPIRY: process.env['JWT_ACCESS_EXPIRY'] ?? '15m',
  JWT_REFRESH_EXPIRY: process.env['JWT_REFRESH_EXPIRY'] ?? '30d',
  MAX_CLIPBOARD_SIZE_MB: parseInt(process.env['MAX_CLIPBOARD_SIZE_MB'] ?? '5', 10),
  UPLOAD_DIR: process.env['UPLOAD_DIR'] ?? path.resolve('./uploads'),
  CORS_ORIGIN: process.env['CORS_ORIGIN'] ?? 'http://localhost:5173',
  NODE_ENV: process.env['NODE_ENV'] ?? 'development',
  SMTP_HOST: process.env['SMTP_HOST'] ?? 'smtp.gmail.com',
  SMTP_PORT: parseInt(process.env['SMTP_PORT'] ?? '587', 10),
  SMTP_USER: process.env['SMTP_USER'] ?? '',
  SMTP_PASS: process.env['SMTP_PASS'] ?? '',
  SMTP_FROM: process.env['SMTP_FROM'] ?? 'ModuShare <admin@extory.co>',
} as const;

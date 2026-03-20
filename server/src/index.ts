import 'dotenv/config';
import http from 'http';
import path from 'path';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { runMigrations } from './db';
import { errorHandler } from './middleware/errorHandler';
import authRouter from './routes/auth';
import clipboardRouter from './routes/clipboard';
import uploadRouter from './routes/upload';
import { attachWebSocketServer } from './websocket/wsServer';
import { authService } from './services/authService';
import { clipboardService } from './services/clipboardService';

// ─── Database ─────────────────────────────────────────────────────────────────
runMigrations();

// Prune expired refresh tokens on startup
authService.pruneExpiredTokens();

// Prune clipboard items older than 10 minutes on startup + every minute
clipboardService.pruneAgedItems();
setInterval(() => clipboardService.pruneAgedItems(), 60 * 1000);

// ─── Express app ─────────────────────────────────────────────────────────────
const app = express();

app.use(
  cors({
    origin: config.CORS_ORIGIN,
    credentials: true,
  })
);

app.use(express.json({ limit: `${config.MAX_CLIPBOARD_SIZE_MB * 2}mb` }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── API routes ───────────────────────────────────────────────────────────────
app.use('/auth', authRouter);
app.use('/clipboard', clipboardRouter);
app.use('/upload', uploadRouter);

// Serve uploaded files (auth is enforced inside the upload router)
app.use('/uploads', express.static(config.UPLOAD_DIR));

// ─── Serve web frontend in production ────────────────────────────────────────
// In Docker: /app/web/dist  |  In dev monorepo: ../../web/dist
const webDistPath = process.env['WEB_DIST_PATH']
  ? path.resolve(process.env['WEB_DIST_PATH'])
  : path.resolve(__dirname, '../../web/dist');
if (config.NODE_ENV === 'production' && fs.existsSync(webDistPath)) {
  app.use(express.static(webDistPath));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(webDistPath, 'index.html'));
  });
}

// ─── Error handler ────────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── HTTP + WebSocket server ──────────────────────────────────────────────────
const httpServer = http.createServer(app);
attachWebSocketServer(httpServer);

httpServer.listen(config.PORT, () => {
  console.log(
    `[server] ModuShare listening on http://localhost:${config.PORT}`
  );
  console.log(`[server] Environment: ${config.NODE_ENV}`);
  console.log(`[server] Database: ${config.DATABASE_URL}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[server] SIGTERM received, shutting down...');
  httpServer.close(() => {
    console.log('[server] HTTP server closed.');
    process.exit(0);
  });
});

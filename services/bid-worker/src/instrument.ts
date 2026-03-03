import 'dotenv/config';
import * as Sentry from '@sentry/node';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.RAILWAY_GIT_COMMIT_SHA || undefined,
    tracesSampleRate: 0.5,
    serverName: 'bidtomo-bid-worker',
    enableLogs: true,
  });
}

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  Sentry.captureException(error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  Sentry.captureException(reason);
});

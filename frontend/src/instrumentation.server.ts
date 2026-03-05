import * as Sentry from '@sentry/sveltekit';

Sentry.init({
  dsn: 'https://556b7249278fb084d64b001ea16a7628@o4510938072219648.ingest.us.sentry.io/4510938165346304',
  environment: process.env.PUBLIC_SENTRY_ENVIRONMENT || 'development',
  tracesSampleRate: 0.2,
});

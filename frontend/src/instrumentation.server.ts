import * as Sentry from '@sentry/sveltekit';

Sentry.init({
  dsn: 'https://556b7249278fb084d64b001ea16a7628@o4510938072219648.ingest.us.sentry.io/4510938165346304',

  tracesSampleRate: 1.0,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: import.meta.env.DEV,
});
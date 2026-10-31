// backend/instrument.js — Sentry error reporting (backend).
// Active ONLY when SENTRY_DSN is set in the environment; otherwise it does nothing.
import dotenv from 'dotenv';
dotenv.config();

let Sentry = null;

if (process.env.SENTRY_DSN) {
  try {
    Sentry = await import('@sentry/node');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'production',
      sendDefaultPii: false,
      tracesSampleRate: 0, // errors only (free quota friendly)
      beforeSend(event) {
        // Privacy: request bodies may hold passwords / personal data
        if (event.request) {
          delete event.request.data;
          delete event.request.cookies;
          if (event.request.headers) {
            for (const h of ['authorization', 'cookie', 'x-cron-secret', 'x-telegram-bot-api-secret-token', 'x-webhook-signature']) {
              delete event.request.headers[h];
            }
          }
        }
        if (event.user) event.user = { id: event.user.id };
        return event;
      },
    });

    // Most routes catch their own errors and call console.error(...) — forward those to Sentry too.
    const originalError = console.error;
    console.error = (...args) => {
      originalError(...args);
      try {
        const err = args.find((a) => a instanceof Error);
        if (err) Sentry.captureException(err);
      } catch (e) { /* ignore */ }
    };
    console.log('🔭 Sentry monitoring enabled');
  } catch (e) {
    console.error('Sentry could not start (is @sentry/node installed?):', e.message);
    Sentry = null;
  }
}

export { Sentry };

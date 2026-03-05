import rateLimit from 'express-rate-limit';

const isProduction = process.env.NODE_ENV === 'production';
const UNLIMITED = 999999; // express-rate-limit v7: max=0 blocks all, so use a high number to effectively disable

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 10 : UNLIMITED,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isProduction ? 5 : UNLIMITED,
  message: { error: 'Too many registration attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const bidLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isProduction ? 30 : UNLIMITED,
  message: { error: 'Too many bid attempts. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const analyticsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isProduction ? 120 : UNLIMITED,
  message: { error: 'Too many analytics requests.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: isProduction ? 5 : UNLIMITED,
  message: { error: 'Too many reports. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const analyticsDashboardLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isProduction ? 10 : UNLIMITED,
  message: { error: 'Too many analytics dashboard requests.' },
  standardHeaders: true,
  legacyHeaders: false,
});

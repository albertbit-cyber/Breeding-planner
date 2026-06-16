import rateLimit from "express-rate-limit";

const productionOnly = () => process.env.NODE_ENV !== "production";

export const authWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skip: productionOnly,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many authentication attempts, please try again later." },
});

export const authRefreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  skip: productionOnly,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many session refresh attempts, please try again later." },
});

export const authRecoveryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  skip: productionOnly,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many password recovery attempts, please try again later." },
});

export const marketplaceMutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  skip: productionOnly,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many marketplace changes, please try again later." },
});

export const marketplaceMessageLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 40,
  skip: productionOnly,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many marketplace messages, please try again later." },
});

export const marketplaceQrLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  skip: productionOnly,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many QR requests, please try again later." },
});

export const marketplaceUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  skip: productionOnly,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many marketplace uploads, please try again later." },
});

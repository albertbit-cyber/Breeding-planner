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

export const authVerificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  skip: productionOnly,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many verification email requests, please try again later." },
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

// The breeder network's messages, transfers and projects. A message request is capped per
// thread in the service; this caps volume across threads.
export const networkMessageLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  skip: productionOnly,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many messages, please try again in a few minutes." },
});

export const networkMutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  skip: productionOnly,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many changes, please try again later." },
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

// Animal photo uploads. Far looser than marketplace uploads: the first sync after this shipped
// moves every photo a keeper has ever taken (upload URL, bytes, complete: two calls here each),
// and a collection of a few hundred animals has photos in the thousands.
export const photoUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 4000,
  skip: productionOnly,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many photo uploads, please try again later." },
});

// Signed read URLs. A gallery asks in batches, but a busy collection still asks often.
export const photoReadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3000,
  skip: productionOnly,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many photo requests, please try again later." },
});

// Public certificate lookups. A buyer checks one or two certificates; a scanner
// checks thousands. Codes are 96 bits, so this is about load and noise rather
// than about making a guess feasible.
export const certificateVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  skip: productionOnly,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many certificate checks, please try again later." },
});

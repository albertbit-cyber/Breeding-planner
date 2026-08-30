import type { Request, Response } from "express";
import { acceptInvite, previewInvite } from "../services/organizationInviteService";
import { loginUser } from "../services/authService";
import { setAuthCookies, createCsrfToken, setCsrfCookie } from "../utils/authCookies";
import { HttpError } from "../utils/errors";

/**
 * The unauthenticated half of the invite flow: the pages an invited vendor or
 * colleague reaches from their email, before they have an account.
 *
 * Both handlers take the raw token from the URL and never trust anything else
 * about the caller — the token is the only credential, which is why the service
 * behind them stores only its hash and consumes it exactly once.
 */

const rawTokenFrom = (req: Request): string => {
  const token = String(req.params.token || req.body?.token || "").trim();
  if (!token) throw new HttpError(400, "This invitation link is not valid.");
  return token;
};

/** Renders the acceptance page: who was invited, to what, and until when. */
export const getInvite = async (req: Request, res: Response): Promise<void> => {
  res.status(200).json({ invite: await previewInvite(rawTokenFrom(req)) });
};

export const postInviteAcceptance = async (req: Request, res: Response): Promise<void> => {
  const rawToken = rawTokenFrom(req);
  const password = String(req.body?.password || "");

  const result = await acceptInvite(rawToken, req.body || {});

  // A brand-new account is signed in immediately: they just proved control of
  // the address and chose the password in the same request, so bouncing them to
  // a sign-in form would ask them to retype what they typed a second ago.
  if (password) {
    const session = await loginUser(result.email, password);
    setAuthCookies(res, session);
    const csrfToken = createCsrfToken();
    setCsrfCookie(res, csrfToken);
    res.status(201).json({
      ...session,
      csrfToken,
      organizationId: result.organizationId,
      organizationRole: result.role,
    });
    return;
  }

  // An address that already had an account keeps its existing password, which
  // we neither know nor should ask for here. They sign in normally.
  res.status(200).json({
    accepted: true,
    requiresSignIn: true,
    email: result.email,
    organizationId: result.organizationId,
    organizationRole: result.role,
  });
};

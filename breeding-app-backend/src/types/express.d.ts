import type { AuthenticatedUser } from "./auth";
import type { MembershipWithOrganization } from "../services/organizationService";

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      authSource?: "bearer" | "cookie";
      /**
       * The actor's organization, loaded once per request by `withOrgContext`
       * so a handler that makes several tenancy checks does not make several
       * membership queries. Undefined until that middleware has run; null for
       * accounts that legitimately have no org (platform staff, buyers).
       */
      membership?: MembershipWithOrganization | null;
    }
  }
}

export {};

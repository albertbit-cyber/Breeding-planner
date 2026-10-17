import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/roles";
import { networkMessageLimiter, networkMutationLimiter } from "../middleware/rateLimiters";
import { network } from "../controllers/networkController";

/**
 * The breeder network: handles, conversations, animal transfers and joint projects. Breeder
 * accounts only (and staff acting as one), the same audience as the breeder snapshot.
 */
export const networkRoutes = Router();

const guard = [requireAuth, requireRole("admin", "breeder")];
const write = [...guard, networkMutationLimiter];

networkRoutes.get("/me", ...guard, asyncHandler(network.me));
networkRoutes.get("/handle/check", ...guard, asyncHandler(network.checkHandle));
networkRoutes.put("/handle", ...write, asyncHandler(network.setHandle));
networkRoutes.get("/people", ...guard, asyncHandler(network.people));
networkRoutes.get("/summary", ...guard, asyncHandler(network.summary));

networkRoutes.get("/threads", ...guard, asyncHandler(network.threads));
networkRoutes.post("/threads", ...guard, networkMessageLimiter, asyncHandler(network.send));
networkRoutes.get("/threads/:id", ...guard, asyncHandler(network.thread));
networkRoutes.post("/threads/:id/messages", ...guard, networkMessageLimiter, asyncHandler(network.sendInThread));
networkRoutes.post("/threads/:id/read", ...guard, asyncHandler(network.read));
networkRoutes.post("/threads/:id/status", ...write, asyncHandler(network.threadStatus));
networkRoutes.post("/messages/:id/report", ...write, asyncHandler(network.report));

networkRoutes.get("/blocks", ...guard, asyncHandler(network.blocks));
networkRoutes.post("/blocks", ...write, asyncHandler(network.block));
networkRoutes.delete("/blocks/:userId", ...write, asyncHandler(network.unblock));

networkRoutes.get("/transfers", ...guard, asyncHandler(network.transfers));
networkRoutes.post("/transfers", ...write, asyncHandler(network.createTransfer));
networkRoutes.get("/transfers/:id", ...guard, asyncHandler(network.transfer));
networkRoutes.post("/transfers/:id/respond", ...write, asyncHandler(network.respondTransfer));
networkRoutes.post("/transfers/:id/return", ...write, asyncHandler(network.returnLoan));

networkRoutes.get("/projects", ...guard, asyncHandler(network.projects));
networkRoutes.post("/projects", ...write, asyncHandler(network.proposeProject));
networkRoutes.get("/projects/:id", ...guard, asyncHandler(network.project));
networkRoutes.post("/projects/:id/respond", ...write, asyncHandler(network.respondProject));
networkRoutes.post("/projects/:id/cancel", ...write, asyncHandler(network.cancelProject));
networkRoutes.post("/projects/:id/complete", ...write, asyncHandler(network.completeProject));
networkRoutes.post("/projects/:id/split-proposals", ...write, asyncHandler(network.proposeSplit));
networkRoutes.post("/split-proposals/:id/respond", ...write, asyncHandler(network.respondSplit));
networkRoutes.post("/projects/:id/shares", ...write, asyncHandler(network.offerShares));

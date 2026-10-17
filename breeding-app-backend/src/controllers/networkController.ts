import type { Request, Response } from "express";
import { HttpError } from "../utils/errors";
import { checkHandle, getNetworkMe, searchPeople, setHandle } from "../services/networkIdentityService";
import {
  blockUser,
  getNetworkSummary,
  getThread,
  listBlocks,
  listThreads,
  markThreadRead,
  reportMessage,
  sendMessage,
  setThreadStatus,
  unblockUser,
} from "../services/networkThreadService";
import { createTransfer, getTransfer, listTransfers, respondToTransfer, returnLoan } from "../services/animalTransferService";
import {
  cancelProject,
  completeProject,
  getProject,
  listProjects,
  offerShares,
  proposeProject,
  proposeSplit,
  respondToProject,
  respondToSplit,
} from "../services/jointProjectService";

const actorOf = (req: Request) => {
  if (!req.user) throw new HttpError(401, "Unauthorized");
  return req.user;
};

type Handler = (req: Request, res: Response) => Promise<void>;
const handle = (fn: (req: Request) => Promise<unknown>, status = 200): Handler => async (req, res) => {
  res.status(status).json(await fn(req));
};

export const network = {
  me: handle((req) => getNetworkMe(actorOf(req))),
  checkHandle: handle((req) => checkHandle(actorOf(req), req.query.handle)),
  setHandle: handle((req) => setHandle(actorOf(req), req.body?.handle)),
  people: handle((req) => searchPeople(actorOf(req), req.query.q)),
  summary: handle((req) => getNetworkSummary(actorOf(req))),

  threads: handle((req) => listThreads(actorOf(req), req.query.box)),
  thread: handle((req) => getThread(actorOf(req), req.params.id, { before: req.query.before })),
  send: handle((req) => sendMessage(actorOf(req), req.body || {}), 201),
  sendInThread: handle((req) => sendMessage(actorOf(req), { ...(req.body || {}), threadId: req.params.id }), 201),
  read: handle((req) => markThreadRead(actorOf(req), req.params.id)),
  threadStatus: handle((req) => setThreadStatus(actorOf(req), req.params.id, req.body?.status)),
  report: handle((req) => reportMessage(actorOf(req), req.params.id, req.body || {}), 201),

  blocks: handle((req) => listBlocks(actorOf(req))),
  block: handle((req) => blockUser(actorOf(req), req.body || {}), 201),
  unblock: handle((req) => unblockUser(actorOf(req), req.params.userId)),

  transfers: handle((req) => listTransfers(actorOf(req))),
  transfer: handle((req) => getTransfer(actorOf(req), req.params.id)),
  createTransfer: handle((req) => createTransfer(actorOf(req), req.body || {}), 201),
  respondTransfer: handle((req) => respondToTransfer(actorOf(req), req.params.id, req.body?.action)),
  returnLoan: handle((req) => returnLoan(actorOf(req), req.params.id, req.body || {})),

  projects: handle((req) => listProjects(actorOf(req))),
  project: handle((req) => getProject(actorOf(req), req.params.id)),
  proposeProject: handle((req) => proposeProject(actorOf(req), req.body || {}), 201),
  respondProject: handle((req) => respondToProject(actorOf(req), req.params.id, req.body || {})),
  cancelProject: handle((req) => cancelProject(actorOf(req), req.params.id)),
  completeProject: handle((req) => completeProject(actorOf(req), req.params.id)),
  proposeSplit: handle((req) => proposeSplit(actorOf(req), req.params.id, req.body || {}), 201),
  respondSplit: handle((req) => respondToSplit(actorOf(req), req.params.id, req.body?.action)),
  offerShares: handle((req) => offerShares(actorOf(req), req.params.id, req.body || {}), 201),
};

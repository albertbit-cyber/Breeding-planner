export type ShedWorkflowEventType =
  | "test_order_created"
  | "payment_confirmed"
  | "sample_received"
  | "testing_started"
  | "result_finalized"
  | "certificate_issued";

export interface ShedWorkflowActor {
  userId?: string;
  role?: string;
}

export interface ShedWorkflowEvent {
  id: string;
  type: ShedWorkflowEventType;
  occurredAt: string;
  orderId: string;
  labId: string;
  animalId: string;
  actor?: ShedWorkflowActor;
  metadata?: Record<string, unknown>;
}

export type ShedWorkflowEventHook = (event: ShedWorkflowEvent) => void | Promise<void>;

const hooks = new Map<string, ShedWorkflowEventHook>();
let hookCounter = 0;

const makeEventId = (type: ShedWorkflowEventType): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `lab_evt_${type}_${crypto.randomUUID()}`;
  }
  return `lab_evt_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

export const registerShedWorkflowEventHook = (hook: ShedWorkflowEventHook): (() => void) => {
  const key = `hook_${Date.now()}_${hookCounter++}`;
  hooks.set(key, hook);
  return () => {
    hooks.delete(key);
  };
};

export const emitShedWorkflowEvent = async (input: {
  type: ShedWorkflowEventType;
  orderId: string;
  labId: string;
  animalId: string;
  actor?: ShedWorkflowActor;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
}): Promise<ShedWorkflowEvent> => {
  const event: ShedWorkflowEvent = {
    id: makeEventId(input.type),
    type: input.type,
    occurredAt: input.occurredAt || new Date().toISOString(),
    orderId: String(input.orderId || "").trim(),
    labId: String(input.labId || "").trim(),
    animalId: String(input.animalId || "").trim(),
    actor: input.actor,
    metadata: input.metadata,
  };

  const listeners = Array.from(hooks.values());
  await Promise.all(
    listeners.map(async (hook) => {
      try {
        await hook(event);
      } catch {
        // Keep workflow operations resilient even if a hook subscriber fails.
      }
    })
  );

  return event;
};

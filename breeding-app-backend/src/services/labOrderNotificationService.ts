import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { enqueueEmail } from "../email/queueService";
import { createNotification } from "./notificationService";
import {
  LAB_APPLICATION_RECEIVED_TEMPLATE_KEY,
  LAB_APPLICATION_RECEIVED_TEMPLATE_VERSION,
  LAB_ORDER_STATUS_TEMPLATE_KEY,
  LAB_ORDER_STATUS_TEMPLATE_VERSION,
  LAB_PAYMENT_REQUESTED_TEMPLATE_KEY,
  LAB_PAYMENT_REQUESTED_TEMPLATE_VERSION,
  LAB_RESULTS_READY_TEMPLATE_KEY,
  LAB_RESULTS_READY_TEMPLATE_VERSION,
  type LabOrderStatusEvent,
} from "../email/templates";

/**
 * Telling people what happened to a testing order.
 *
 * Every function here is best-effort by construction: a laboratory marking an
 * order received must not fail because the mail queue was unhappy, and a
 * breeder's result must not be lost because a notification row would not write.
 * The work has already happened by the time any of this runs — these only report
 * it. Failures are logged under `[lab-notify]` so a silent gap is findable.
 */

const db = prisma as any;

const safely = async (label: string, run: () => Promise<unknown>): Promise<void> => {
  try {
    await run();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[lab-notify] ${label} failed: ${reason}`);
  }
};

const breederOrderUrl = (): string => {
  const base = String(env.publicAppUrl || "").replace(/\/$/, "");
  return base ? `${base}/#shed-terminal` : "#shed-terminal";
};

const adminLabsUrl = (): string => {
  const base = String(env.publicAppUrl || "").replace(/\/$/, "");
  return base ? `${base}/admin/labs` : "/admin/labs";
};

const orderLabel = (order: { orderNumber?: string | null; id: string }): string =>
  String(order.orderNumber || order.id || "").trim() || order.id;

const formatMoney = (amount: unknown, currency: unknown): string => {
  const value = Number(amount);
  const code = String(currency || "EUR").trim() || "EUR";
  if (!Number.isFinite(value)) return code;
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: code }).format(value);
  } catch {
    return `${code} ${value.toFixed(2)}`;
  }
};

type NotifiableOrder = {
  id: string;
  orderNumber?: string | null;
  breederId: string;
  totalPrice?: unknown;
  currency?: unknown;
  paymentRef?: string | null;
  labOrganizationId?: string | null;
  animals?: Array<{ animalId: string; animalName?: string | null }>;
};

/** The laboratory's own trading name, which is what a breeder recognizes. */
const resolveLabName = async (labOrganizationId: string | null | undefined): Promise<string> => {
  const id = String(labOrganizationId || "").trim();
  if (!id) return "The laboratory";
  const organization = await db.organization.findUnique({
    where: { id },
    select: { name: true, labAccount: { select: { labName: true } } },
  });
  return String(organization?.labAccount?.labName || organization?.name || "").trim() || "The laboratory";
};

const loadBreeder = async (breederId: string) =>
  db.user.findUnique({
    where: { id: breederId },
    select: { id: true, email: true, fullName: true },
  });

const STATUS_EVENTS: ReadonlySet<string> = new Set(["received", "in_progress", "cancelled"]);

const STATUS_TITLES: Record<LabOrderStatusEvent, string> = {
  received: "Your samples arrived at the laboratory",
  in_progress: "Testing has started",
  cancelled: "Your testing order was cancelled",
};

/**
 * Received, started, or cancelled. Completion is not handled here — see
 * `notifyResultsReady`, which carries the findings themselves.
 */
export const notifyOrderStatusChanged = async (params: {
  order: NotifiableOrder;
  previousStatus: string;
  nextStatus: string;
}): Promise<void> => {
  const { order, previousStatus, nextStatus } = params;
  if (previousStatus === nextStatus) return;
  if (!STATUS_EVENTS.has(nextStatus)) return;

  await safely(`order ${order.id} status ${nextStatus}`, async () => {
    const [breeder, labName] = await Promise.all([
      loadBreeder(order.breederId),
      resolveLabName(order.labOrganizationId),
    ]);
    if (!breeder) return;

    const event = nextStatus as LabOrderStatusEvent;
    const reference = orderLabel(order);
    const animalCount = Array.isArray(order.animals) ? order.animals.length : 0;

    await createNotification({
      recipientId: breeder.id,
      type: `lab_order_${event}`,
      title: STATUS_TITLES[event],
      message: `${labName} — order ${reference}.`,
      metadata: { orderId: order.id, orderNumber: reference, status: event },
    });

    if (!breeder.email) return;
    await enqueueEmail({
      ownerId: breeder.id,
      recipientEmail: breeder.email,
      category: "lab_orders",
      templateKey: LAB_ORDER_STATUS_TEMPLATE_KEY,
      templateVersion: LAB_ORDER_STATUS_TEMPLATE_VERSION,
      templatePayload: {
        breederName: breeder.fullName || null,
        labName,
        orderNumber: reference,
        animalCount,
        event,
        actionUrl: breederOrderUrl(),
      },
      subject: `Your shed test order ${reference}`,
      // One mail per order per status: a laboratory that re-saves the same status
      // must not send the breeder a second copy.
      idempotencyKey: `lab_order_status:${order.id}:${event}`,
      relatedEntityType: "shed_test_order",
      relatedEntityId: order.id,
    });
  });
};

const OUTCOME_WORDS: Record<string, string> = {
  positive: "visual",
  carrierDetected: "het",
  notDetected: "not detected",
  negative: "not detected",
};

/** "Jasmine — Piebald: visual, Albino: not detected" */
const buildFindingLines = (
  order: NotifiableOrder,
  results: Array<{ animalId: string; findingsJson: unknown }>
): string[] => {
  const namesById = new Map<string, string>(
    (Array.isArray(order.animals) ? order.animals : []).map((animal) => [
      String(animal.animalId),
      String(animal.animalName || "").trim() || String(animal.animalId),
    ])
  );

  return results
    .map((result) => {
      const findings = Array.isArray(result.findingsJson) ? (result.findingsJson as any[]) : [];
      const parts = findings
        .map((finding) => {
          const marker = String(finding?.marker || "").trim();
          const word = OUTCOME_WORDS[String(finding?.outcome || "")];
          return marker && word ? `${marker}: ${word}` : "";
        })
        .filter(Boolean);
      if (!parts.length) return "";
      const name = namesById.get(String(result.animalId)) || String(result.animalId);
      return `${name} — ${parts.join(", ")}`;
    })
    .filter(Boolean);
};

export const notifyResultsReady = async (params: {
  order: NotifiableOrder;
  results: Array<{ id: string; animalId: string; findingsJson: unknown }>;
}): Promise<void> => {
  const { order, results } = params;
  if (!results.length) return;

  await safely(`order ${order.id} results ready`, async () => {
    const [breeder, labName] = await Promise.all([
      loadBreeder(order.breederId),
      resolveLabName(order.labOrganizationId),
    ]);
    if (!breeder) return;

    const reference = orderLabel(order);
    const findingLines = buildFindingLines(order, results);

    await createNotification({
      recipientId: breeder.id,
      type: "lab_results_ready",
      title: "Your shed test results are ready",
      message: findingLines.length
        ? `${labName} — order ${reference}. ${findingLines.join("; ")}`
        : `${labName} has completed order ${reference}.`,
      metadata: { orderId: order.id, orderNumber: reference, animalCount: results.length },
    });

    if (!breeder.email) return;
    await enqueueEmail({
      ownerId: breeder.id,
      recipientEmail: breeder.email,
      category: "lab_orders",
      templateKey: LAB_RESULTS_READY_TEMPLATE_KEY,
      templateVersion: LAB_RESULTS_READY_TEMPLATE_VERSION,
      templatePayload: {
        breederName: breeder.fullName || null,
        labName,
        orderNumber: reference,
        findingLines,
        actionUrl: breederOrderUrl(),
      },
      subject: `Your shed test results are ready (${reference})`,
      // Keyed on the results themselves, not the order: a laboratory correcting a
      // result and resubmitting is genuinely new news and should send again.
      idempotencyKey: `lab_results_ready:${order.id}:${results.map((r) => r.id).sort().join(",")}`,
      relatedEntityType: "shed_test_order",
      relatedEntityId: order.id,
    });
  });
};

export const notifyPaymentInvoiced = async (params: {
  order: NotifiableOrder;
  previousPaymentStatus: string;
  nextPaymentStatus: string;
}): Promise<void> => {
  const { order, previousPaymentStatus, nextPaymentStatus } = params;
  if (nextPaymentStatus !== "invoiced" || previousPaymentStatus === "invoiced") return;

  await safely(`order ${order.id} invoiced`, async () => {
    const [breeder, labName] = await Promise.all([
      loadBreeder(order.breederId),
      resolveLabName(order.labOrganizationId),
    ]);
    if (!breeder) return;

    const reference = orderLabel(order);
    const amountDisplay = formatMoney(order.totalPrice, order.currency);

    await createNotification({
      recipientId: breeder.id,
      type: "lab_order_invoiced",
      title: "An invoice is waiting",
      message: `${labName} has invoiced order ${reference} for ${amountDisplay}.`,
      metadata: { orderId: order.id, orderNumber: reference, amountDisplay },
    });

    if (!breeder.email) return;
    await enqueueEmail({
      ownerId: breeder.id,
      recipientEmail: breeder.email,
      category: "lab_orders",
      templateKey: LAB_PAYMENT_REQUESTED_TEMPLATE_KEY,
      templateVersion: LAB_PAYMENT_REQUESTED_TEMPLATE_VERSION,
      templatePayload: {
        breederName: breeder.fullName || null,
        labName,
        orderNumber: reference,
        amountDisplay,
        paymentRef: order.paymentRef || null,
        actionUrl: breederOrderUrl(),
      },
      subject: `Invoice for your shed test order (${reference})`,
      idempotencyKey: `lab_order_invoiced:${order.id}`,
      relatedEntityType: "shed_test_order",
      relatedEntityId: order.id,
    });
  });
};

/**
 * A laboratory asked to join. Goes to every administrator, because an
 * application nobody sees is an application refused by silence.
 */
export const notifyLabApplicationReceived = async (application: {
  id: string;
  labName: string;
  contactPerson?: string | null;
  email: string;
  location?: string | null;
  reason?: string | null;
}): Promise<void> => {
  await safely(`lab application ${application.id}`, async () => {
    const admins = await db.user.findMany({
      where: { role: "admin" },
      select: { id: true, email: true, fullName: true },
    });
    if (!admins.length) {
      console.warn(`[lab-notify] lab application ${application.id} has no admin to notify.`);
      return;
    }

    for (const admin of admins) {
      await createNotification({
        recipientId: admin.id,
        type: "lab_application_received",
        title: "A laboratory has applied to join",
        message: `${application.labName} (${application.email}) applied to become a partner laboratory.`,
        metadata: { applicationId: application.id, labName: application.labName },
      });

      if (!admin.email) continue;
      await enqueueEmail({
        ownerId: admin.id,
        recipientEmail: admin.email,
        category: "lab_orders",
        templateKey: LAB_APPLICATION_RECEIVED_TEMPLATE_KEY,
        templateVersion: LAB_APPLICATION_RECEIVED_TEMPLATE_VERSION,
        templatePayload: {
          adminName: admin.fullName || null,
          labName: application.labName,
          contactPerson: application.contactPerson || null,
          email: application.email,
          location: application.location || null,
          reason: application.reason || null,
          actionUrl: adminLabsUrl(),
        },
        subject: `${application.labName} applied to join as a partner laboratory`,
        idempotencyKey: `lab_application:${application.id}:${admin.id}`,
        relatedEntityType: "partner_application",
        relatedEntityId: application.id,
      });
    }
  });
};

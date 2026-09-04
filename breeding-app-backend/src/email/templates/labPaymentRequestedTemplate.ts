import { escapeHtml } from "./escapeHtml";
import { renderLayout, renderPlainText } from "./layout";

/**
 * A laboratory has invoiced an order.
 *
 * The platform takes no payment, so this deliberately does not pretend to: there
 * is no "Pay now" button, because paying happens between the breeder and the
 * laboratory on the laboratory's own terms. The mail's job is to say an invoice
 * exists and who it is from.
 */
export type LabPaymentRequestedTemplateProps = {
  breederName: string | null;
  labName: string;
  orderNumber: string;
  amountDisplay: string;
  paymentRef: string | null;
  actionUrl: string;
};

export const LAB_PAYMENT_REQUESTED_TEMPLATE_KEY = "lab_payment_requested";
export const LAB_PAYMENT_REQUESTED_TEMPLATE_VERSION = 1;

export const renderLabPaymentRequestedTemplate = (props: LabPaymentRequestedTemplateProps) => {
  const greeting = props.breederName ? `Hello ${escapeHtml(props.breederName)},` : "Hello,";
  const referenceHtml = props.paymentRef
    ? `<p>Payment reference: <strong>${escapeHtml(props.paymentRef)}</strong></p>`
    : "";

  const bodyHtml = `
    <p>${greeting}</p>
    <p>${escapeHtml(props.labName)} has invoiced your testing order <strong>${escapeHtml(props.orderNumber)}</strong>.</p>
    <p>Amount: <strong>${escapeHtml(props.amountDisplay)}</strong></p>
    ${referenceHtml}
    <p>Payment is arranged directly with the laboratory — their invoice carries the details. Your order page shows the current payment status once they mark it settled.</p>
  `;

  const html = renderLayout({
    preheader: `${props.labName} has invoiced order ${props.orderNumber}.`,
    heading: "An invoice is waiting",
    bodyHtml,
    ctaLabel: "View your order",
    ctaUrl: props.actionUrl,
  });

  const text = renderPlainText([
    props.breederName ? `Hello ${props.breederName},` : "Hello,",
    "",
    `${props.labName} has invoiced your testing order ${props.orderNumber}.`,
    `Amount: ${props.amountDisplay}`,
    ...(props.paymentRef ? [`Payment reference: ${props.paymentRef}`] : []),
    "",
    "Payment is arranged directly with the laboratory — their invoice carries the details.",
    "Your order page shows the current payment status once they mark it settled.",
    "",
    `View your order: ${props.actionUrl}`,
  ]);

  return { subject: `Invoice for your shed test order (${props.orderNumber})`, html, text };
};

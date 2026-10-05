export type PaymentGateway = {
  id: string;
  bankName: string;
  connectionKey: string;
  description: string;
  updatedAt: string;
};

export const PAYMENT_GATEWAYS_STORAGE_KEY = "office-admin-payment-gateways-v1";

export function savePaymentGateways(gateways: PaymentGateway[]) {
  window.localStorage.setItem(PAYMENT_GATEWAYS_STORAGE_KEY, JSON.stringify(gateways));
}

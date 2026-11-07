"use client";

/**
 * Payment gateway data layer.
 *
 * The server stores the connection key as a secret and only ever returns a masked
 * form (``••••••1234``), so the UI must treat ``connectionKey`` as read-only.
 */

import { useCallback, useEffect, useState } from "react";
import { adminRequest } from "./admin-api";

export type PaymentGateway = {
  id: string;
  bankName: string;
  /** Masked representation returned by the API; never the real key. */
  connectionKey: string;
  hasKey: boolean;
  description: string;
  isActive: boolean;
  updatedAt: string;
};

export type PaymentGatewayInput = {
  bankName: string;
  /** Required on create; leave empty on update to keep the stored key. */
  connectionKey?: string;
  description?: string;
  isActive?: boolean;
};

export async function listPaymentGateways(activeOnly = false): Promise<PaymentGateway[]> {
  const suffix = activeOnly ? "?active_only=true" : "";
  const data = await adminRequest<{ gateways: PaymentGateway[] }>(
    `/api/payment-gateways${suffix}`,
  );
  return data.gateways;
}

export async function createPaymentGateway(input: PaymentGatewayInput): Promise<PaymentGateway> {
  const data = await adminRequest<{ gateway: PaymentGateway }>("/api/payment-gateways", {
    method: "POST",
    body: JSON.stringify({
      bank_name: input.bankName,
      connection_key: input.connectionKey ?? "",
      description: input.description ?? "",
      is_active: input.isActive ?? true,
    }),
  });
  return data.gateway;
}

export async function updatePaymentGateway(
  id: string,
  input: PaymentGatewayInput,
): Promise<PaymentGateway> {
  const data = await adminRequest<{ gateway: PaymentGateway }>(
    `/api/payment-gateways/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        bank_name: input.bankName,
        ...(input.connectionKey ? { connection_key: input.connectionKey } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
      }),
    },
  );
  return data.gateway;
}

export async function setPaymentGatewayActive(
  id: string,
  isActive: boolean,
): Promise<PaymentGateway> {
  const data = await adminRequest<{ gateway: PaymentGateway }>(
    `/api/payment-gateways/${encodeURIComponent(id)}/status`,
    { method: "PATCH", body: JSON.stringify({ is_active: isActive }) },
  );
  return data.gateway;
}

export async function removePaymentGateway(id: string): Promise<void> {
  await adminRequest(`/api/payment-gateways/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/** Loads the gateways from the API and exposes a manual ``reload`` trigger. */
export function usePaymentGateways() {
  const [gateways, setGateways] = useState<PaymentGateway[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setGateways(await listPaymentGateways());
    } catch (err) {
      setError(err instanceof Error ? err.message : "بارگذاری درگاه‌های پرداخت ناموفق بود.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { gateways, loading, error, reload, setGateways };
}

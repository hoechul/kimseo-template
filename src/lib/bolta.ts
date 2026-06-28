import { getSystemSetting } from "@/lib/system-settings";

const BOLTA_BASE_URL = process.env.BOLTA_BASE_URL || "https://xapi.bolta.io";

export type BoltaTaxInvoiceManager = {
  email: string;
  name?: string;
  telephone?: string;
};

export type BoltaTaxInvoiceSupplier = {
  identificationNumber: string;
  organizationName: string;
  representativeName: string;
  address?: string;
  businessItem?: string;
  businessType?: string;
  manager: BoltaTaxInvoiceManager;
};

export type BoltaTaxInvoiceRecipient = {
  identificationNumber: string;
  organizationName: string;
  representativeName: string;
  address?: string;
  businessItem?: string;
  businessType?: string;
  managers: BoltaTaxInvoiceManager[];
};

export type BoltaTaxInvoiceItem = {
  date: string;
  name: string;
  quantity?: number;
  unitPrice?: number;
  supplyCost: number;
  tax?: number;
  specification?: string;
  description?: string;
};

export type BoltaTaxInvoiceIssueRequest = {
  date: string;
  purpose: "RECEIPT" | "CLAIM";
  supplier: BoltaTaxInvoiceSupplier;
  supplied: BoltaTaxInvoiceRecipient;
  items: BoltaTaxInvoiceItem[];
  description?: string;
};

export type BoltaIssueResponse = {
  issuanceKey: string;
};

export type BoltaIssueStatusResponse = {
  issuanceKey: string;
  clientReferenceId: string;
  message: string;
};

export type BoltaInvoiceResponse = {
  issuanceKey: string;
  ntsTransactionId: string;
  issuedAt: string;
  invoice: BoltaTaxInvoiceIssueRequest;
};

export class BoltaApiError extends Error {
  code: string | null;
  status: number;
  payload: unknown;

  constructor(message: string, status: number, code: string | null = null, payload: unknown = null) {
    super(message);
    this.name = "BoltaApiError";
    this.code = code;
    this.status = status;
    this.payload = payload;
  }
}

async function getBoltaApiKey() {
  const value = await getSystemSetting("bolta_api_key");
  if (!value) {
    throw new Error("Bolta API 키가 설정되지 않았습니다.");
  }
  return value;
}

function getBasicAuthHeader(apiKey: string) {
  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
}

export async function getBoltaCustomerKey() {
  const value = await getSystemSetting("bolta_customer_key");
  if (!value) {
    throw new Error("Bolta Customer Key가 설정되지 않았습니다.");
  }
  return value;
}

export async function getBoltaWebhookSecret() {
  return getSystemSetting("bolta_webhook_secret");
}

async function parseBoltaResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let payload: unknown = null;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    if (!response.ok) {
      throw new BoltaApiError(
        text || "Bolta API request failed",
        response.status,
        null,
        text
      );
    }
    throw new BoltaApiError(
      `Unexpected response: ${text}`,
      response.status,
      null,
      text
    );
  }

  if (!response.ok) {
    const err = payload as Record<string, unknown> | null;
    throw new BoltaApiError(
      (err?.message as string) || "Bolta API request failed",
      response.status,
      (err?.code as string) || null,
      payload
    );
  }

  return payload as T;
}

async function boltaFetch<T>(
  path: string,
  init: RequestInit,
  options?: { customerKey?: string; clientReferenceId?: string }
) {
  const apiKey = await getBoltaApiKey();
  const headers = new Headers(init.headers);

  headers.set("Authorization", getBasicAuthHeader(apiKey));
  headers.set("Content-Type", "application/json");

  if (options?.customerKey) {
    headers.set("Customer-Key", options.customerKey);
  }

  if (options?.clientReferenceId) {
    headers.set("Bolta-Client-Reference-Id", options.clientReferenceId);
  }

  const response = await fetch(`${BOLTA_BASE_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  return parseBoltaResponse<T>(response);
}

export async function issueBoltaTaxInvoice(
  payload: BoltaTaxInvoiceIssueRequest,
  options: { customerKey: string; clientReferenceId: string }
) {
  return boltaFetch<BoltaIssueResponse>(
    "/v1/taxInvoices/issue",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    options
  );
}

export async function getBoltaIssueStatus(clientReferenceId: string) {
  const query = new URLSearchParams({ clientReferenceId });
  return boltaFetch<BoltaIssueStatusResponse>(
    `/v1/taxInvoices/issue/status?${query.toString()}`,
    { method: "GET" }
  );
}

export async function getBoltaTaxInvoice(issuanceKey: string) {
  return boltaFetch<BoltaInvoiceResponse>(
    `/v1/taxInvoices/${issuanceKey}`,
    { method: "GET" }
  );
}

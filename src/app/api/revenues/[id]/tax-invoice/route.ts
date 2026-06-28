import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import {
  BoltaApiError,
  getBoltaCustomerKey,
  getBoltaIssueStatus,
  getBoltaTaxInvoice,
  issueBoltaTaxInvoice,
  type BoltaTaxInvoiceIssueRequest,
} from "@/lib/bolta";
import { logError, logInfo } from "@/lib/logger";
import { DEFAULT_SUPPLIER } from "@/lib/quotation-constants";
import {
  getRevenueTaxInvoiceState,
  isRevenueTaxInvoiceIssuingStale,
} from "@/lib/revenue-tax-invoice";
import { createRouteAuthErrorResponse, requireRouteUser } from "@/lib/route-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSystemSetting } from "@/lib/system-settings";
import {
  getTaxInvoicePreviewMissingFields,
  mergeTaxInvoicePreview,
} from "@/lib/tax-invoice-preview";
import type { Customer, CustomerContact, Revenue } from "@/lib/types";

type RouteContext = { params: Promise<{ id: string }> };

type RevenueIssueRecord = Pick<
  Revenue,
  | "id"
  | "project_id"
  | "title"
  | "product_name"
  | "memo"
  | "revenue_date"
  | "is_paid"
  | "is_tax_invoice_issued"
  | "tax_invoice_not_required"
  | "tax_invoice_issue_status"
  | "tax_invoice_client_reference_id"
  | "tax_invoice_issuance_key"
  | "tax_invoice_issue_requested_at"
  | "tax_invoice_last_webhook_at"
  | "tax_invoice_date"
  | "tax_invoice_issued_at"
  | "tax_invoice_url"
  | "tax_invoice_nts_transaction_id"
  | "tax_invoice_error_code"
  | "tax_invoice_error_message"
  | "supply_amount"
  | "vat_amount"
>;

type TaxInvoiceMutationAction = "sync" | "force-reset";

type ProjectRecord = {
  id: string;
  name: string;
  project_number: string;
  customer_id: string | null;
};

type CustomerRecord = Pick<
  Customer,
  | "id"
  | "name"
  | "representative_name"
  | "business_number"
  | "address"
  | "contact_name"
  | "contact_email"
  | "contact_phone"
>;

type CustomerContactRecord = Pick<CustomerContact, "name" | "email" | "phone">;

type EmployeeContactRecord = {
  name: string | null;
  email: string | null;
  phone: string | null;
};

type SupplierContact = {
  name: string;
  email: string | null;
  phone: string | null;
};

type PrepareIssuePreviewResult = {
  preview: BoltaTaxInvoiceIssueRequest;
  missingFields: string[];
  structuralBlockedReasons: string[];
};

function compactJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function asTrimmed(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeBusinessNumber(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

function makeClientReferenceId(revenueId: string) {
  const compactId = revenueId.replace(/-/g, "");
  return `revenue_${compactId.slice(0, 16)}_${randomUUID().slice(0, 8)}`;
}

function getStateBlockedReasons(taxInvoiceState: string) {
  if (taxInvoiceState === "not_required") {
    return ["세금계산서 발행 대상이 아닌 매출입니다."];
  }

  if (taxInvoiceState === "issued") {
    return ["이미 세금계산서가 발행된 매출입니다."];
  }

  if (taxInvoiceState === "issuing") {
    return ["세금계산서 발행이 진행 중입니다."];
  }

  return [];
}

function getPreviewOverride(body: unknown) {
  if (!body || typeof body !== "object" || !("preview" in body)) {
    return null;
  }

  return (body as { preview?: unknown }).preview ?? null;
}

function getPatchAction(body: unknown): TaxInvoiceMutationAction | null {
  if (!body || typeof body !== "object" || !("action" in body)) {
    return null;
  }

  const action = (body as { action?: unknown }).action;
  if (action === "sync" || action === "force-reset") {
    return action;
  }

  return null;
}

function hasTaxInvoiceTrackingInfo(revenue: RevenueIssueRecord) {
  return Boolean(
    asTrimmed(revenue.tax_invoice_client_reference_id) ||
    asTrimmed(revenue.tax_invoice_issuance_key)
  );
}

function isBoltaNotFoundError(error: unknown) {
  return error instanceof BoltaApiError && error.status === 404;
}

async function selectUpdatedRevenue(revenueId: string) {
  return selectRevenueWithProject(revenueId);
}

async function syncRevenueTaxInvoiceStatus(revenue: RevenueIssueRecord) {
  const admin = createAdminClient();
  const taxInvoiceState = getRevenueTaxInvoiceState(revenue);

  if (taxInvoiceState === "issued" || taxInvoiceState === "not_required") {
    return {
      resolved: false,
      message: "현재 상태에서는 세금계산서 재확인이 필요하지 않습니다.",
      data: await selectUpdatedRevenue(revenue.id),
    };
  }

  let issuanceKey = asTrimmed(revenue.tax_invoice_issuance_key);
  let statusMessage: string | null = null;
  const clientReferenceId = asTrimmed(revenue.tax_invoice_client_reference_id);

  if (!issuanceKey) {
    if (!clientReferenceId) {
      return {
        resolved: false,
        message: "발행 추적 정보가 없어 Bolta 상태를 재확인할 수 없습니다.",
        data: await selectUpdatedRevenue(revenue.id),
      };
    }

    try {
      const issueStatus = await getBoltaIssueStatus(clientReferenceId);
      issuanceKey = asTrimmed(issueStatus.issuanceKey);
      statusMessage = asTrimmed(issueStatus.message);

      if (issuanceKey) {
        const { error: updateError } = await admin
          .from("revenues")
          .update({
            tax_invoice_issuance_key: issuanceKey,
            tax_invoice_error_code: null,
            tax_invoice_error_message: null,
          })
          .eq("id", revenue.id);

        if (updateError) {
          throw new Error(updateError.message);
        }
      }
    } catch (error) {
      if (isBoltaNotFoundError(error)) {
        return {
          resolved: false,
          message: "Bolta에서 아직 발행 추적 정보를 찾지 못했습니다. 조금 더 기다린 뒤 다시 확인하세요.",
          data: await selectUpdatedRevenue(revenue.id),
        };
      }

      throw error;
    }
  }

  if (!issuanceKey) {
    return {
      resolved: false,
      message: statusMessage ?? "Bolta에서 아직 발행 키를 반환하지 않았습니다.",
      data: await selectUpdatedRevenue(revenue.id),
    };
  }

  try {
    const boltaInvoice = await getBoltaTaxInvoice(issuanceKey);
    const issuedAt = boltaInvoice.issuedAt ?? new Date().toISOString();

    const { error: updateError } = await admin
      .from("revenues")
      .update({
        tax_invoice_issue_status: "issued",
        is_tax_invoice_issued: true,
        tax_invoice_issuance_key: issuanceKey,
        tax_invoice_date: issuedAt.slice(0, 10),
        tax_invoice_issued_at: issuedAt,
        tax_invoice_nts_transaction_id: boltaInvoice.ntsTransactionId ?? null,
        tax_invoice_error_code: null,
        tax_invoice_error_message: null,
      })
      .eq("id", revenue.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return {
      resolved: true,
      message: "Bolta 상태를 다시 확인해 발행 완료로 반영했습니다.",
      data: await selectUpdatedRevenue(revenue.id),
    };
  } catch (error) {
    if (isBoltaNotFoundError(error)) {
      return {
        resolved: false,
        message:
          statusMessage ??
          "아직 Bolta 확정 결과를 확인하지 못했습니다. 조금 더 기다리거나 발행중 해제를 진행하세요.",
        data: await selectUpdatedRevenue(revenue.id),
      };
    }

    throw error;
  }
}

async function resolveSupplierContact() {
  const admin = createAdminClient();
  const managerName = DEFAULT_SUPPLIER.supplier_manager;

  const { data } = await admin
    .from("employees")
    .select("name, email, phone")
    .eq("name", managerName)
    .eq("is_active", true)
    .maybeSingle();

  const employee = (data as EmployeeContactRecord | null) ?? null;

  return {
    name: managerName,
    email:
      asTrimmed(await getSystemSetting("bolta_supplier_manager_email")) ??
        asTrimmed(employee?.email),
    phone:
      asTrimmed(employee?.phone) ??
      asTrimmed(DEFAULT_SUPPLIER.supplier_phone),
  } satisfies SupplierContact;
}

function pickPrimaryContact(
  customer: CustomerRecord | null,
  contacts: CustomerContactRecord[]
) {
  const firstWithEmail = contacts.find((contact) => asTrimmed(contact.email));
  const firstWithPhone = contacts.find((contact) => asTrimmed(contact.phone));
  const firstWithName = contacts.find((contact) => asTrimmed(contact.name));

  return {
    representativeName:
      asTrimmed(customer?.representative_name) ??
      asTrimmed(customer?.contact_name) ??
      asTrimmed(firstWithName?.name) ??
      asTrimmed(customer?.name) ??
      "",
    managerName:
      asTrimmed(customer?.contact_name) ??
      asTrimmed(firstWithName?.name) ??
      asTrimmed(customer?.representative_name) ??
      asTrimmed(customer?.name) ??
      "",
    email:
      asTrimmed(customer?.contact_email) ??
      asTrimmed(firstWithEmail?.email),
    phone:
      asTrimmed(customer?.contact_phone) ??
      asTrimmed(firstWithPhone?.phone),
  };
}

function buildIssuePreview(args: {
  revenue: RevenueIssueRecord;
  project: ProjectRecord | null;
  customer: CustomerRecord | null;
  contacts: CustomerContactRecord[];
  supplierContact: SupplierContact;
}) {
  const { revenue, project, customer, contacts, supplierContact } = args;
  const recipient = pickPrimaryContact(customer, contacts);
  const supplierBusinessNumber = normalizeBusinessNumber(
    DEFAULT_SUPPLIER.supplier_business_number
  );
  const customerBusinessNumber = normalizeBusinessNumber(customer?.business_number);
  const today = new Date().toISOString().slice(0, 10);
  const itemDate = revenue.revenue_date ?? today;
  const itemName = asTrimmed(revenue.product_name) ?? asTrimmed(revenue.title) ?? "";

  return compactJson({
    date: today,
    purpose: revenue.is_paid ? "RECEIPT" : "CLAIM",
    supplier: {
      identificationNumber: supplierBusinessNumber,
      organizationName: DEFAULT_SUPPLIER.supplier_name,
      representativeName: DEFAULT_SUPPLIER.supplier_representative,
      address: asTrimmed(DEFAULT_SUPPLIER.supplier_address) ?? undefined,
      businessItem: asTrimmed(DEFAULT_SUPPLIER.supplier_business_category) ?? undefined,
      businessType: asTrimmed(DEFAULT_SUPPLIER.supplier_business_type) ?? undefined,
      manager: {
        email: supplierContact.email ?? "",
        name: supplierContact.name,
        telephone: supplierContact.phone ?? undefined,
      },
    },
    supplied: {
      identificationNumber: customerBusinessNumber,
      organizationName: customer?.name ?? "",
      representativeName: recipient.representativeName,
      address: asTrimmed(customer?.address) ?? undefined,
      managers: [
        {
          email: recipient.email ?? "",
          name: recipient.managerName,
          telephone: recipient.phone ?? undefined,
        },
      ],
    },
    items: [
      {
        date: itemDate,
        name: itemName,
        quantity: 1,
        unitPrice: revenue.supply_amount,
        supplyCost: revenue.supply_amount,
        tax: revenue.vat_amount > 0 ? revenue.vat_amount : undefined,
        description: asTrimmed(revenue.memo) ?? undefined,
      },
    ],
    description: project
      ? `${project.project_number} ${project.name}`.trim()
      : revenue.title,
  } satisfies BoltaTaxInvoiceIssueRequest);
}

async function selectRevenue(revenueId: string) {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("revenues")
    .select(
      [
        "id",
        "project_id",
        "title",
        "product_name",
        "memo",
        "revenue_date",
        "is_paid",
        "is_tax_invoice_issued",
        "tax_invoice_not_required",
        "tax_invoice_issue_status",
        "tax_invoice_client_reference_id",
        "tax_invoice_issuance_key",
        "tax_invoice_issue_requested_at",
        "tax_invoice_last_webhook_at",
        "tax_invoice_date",
        "tax_invoice_issued_at",
        "tax_invoice_url",
        "tax_invoice_nts_transaction_id",
        "tax_invoice_error_code",
        "tax_invoice_error_message",
        "supply_amount",
        "vat_amount",
      ].join(", ")
    )
    .eq("id", revenueId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as RevenueIssueRecord | null) ?? null;
}

async function selectProject(projectId: string) {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("projects")
    .select("id, name, project_number, customer_id")
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as ProjectRecord | null) ?? null;
}

async function selectCustomer(customerId: string) {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("customers")
    .select(
      "id, name, representative_name, business_number, address, contact_name, contact_email, contact_phone"
    )
    .eq("id", customerId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as CustomerRecord | null) ?? null;
}

async function selectCustomerContacts(customerId: string) {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("customer_contacts")
    .select("name, email, phone")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data as CustomerContactRecord[] | null) ?? [];
}

async function selectRevenueWithProject(revenueId: string) {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("revenues")
    .select(`
      *,
      projects(
        id,
        project_number,
        name,
        customer_id,
        client,
        description,
        status,
        start_date,
        end_date,
        manager,
        customers(
          id,
          name,
          customer_type,
          representative_name,
          business_number,
          contact_name,
          contact_email,
          contact_phone,
          address,
          memo
        )
      )
    `)
    .eq("id", revenueId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function prepareIssuePreview(
  revenue: RevenueIssueRecord
): Promise<PrepareIssuePreviewResult> {
  const project = revenue.project_id ? await selectProject(revenue.project_id) : null;
  const customer =
    project?.customer_id ? await selectCustomer(project.customer_id) : null;
  const contacts =
    project?.customer_id ? await selectCustomerContacts(project.customer_id) : [];
  const supplierContact = await resolveSupplierContact();
  const preview = buildIssuePreview({
    revenue,
    project,
    customer,
    contacts,
    supplierContact,
  });
  const structuralBlockedReasons: string[] = [];

  if (!revenue.project_id || !project) {
    structuralBlockedReasons.push("연결된 프로젝트가 없습니다.");
  }

  if (!project?.customer_id || !customer) {
    structuralBlockedReasons.push("연결된 고객이 없습니다.");
  }

  if (
    !(await getSystemSetting("bolta_api_key"))
  ) {
    structuralBlockedReasons.push("Bolta API 키가 설정되어 있지 않습니다.");
  }

  if (
    !(await getSystemSetting("bolta_customer_key"))
  ) {
    structuralBlockedReasons.push("Bolta Customer Key가 설정되어 있지 않습니다.");
  }

  return {
    preview,
    missingFields: getTaxInvoicePreviewMissingFields(preview),
    structuralBlockedReasons: [...new Set(structuralBlockedReasons)],
  };
}

export async function GET(_request: Request, context: RouteContext) {
  const { user, authUnavailable } = await requireRouteUser();
  if (!user) {
    return createRouteAuthErrorResponse(authUnavailable);
  }

  try {
    const { id } = await context.params;
    const revenue = await selectRevenue(id);

    if (!revenue) {
      return NextResponse.json({ error: "Revenue not found" }, { status: 404 });
    }

    const taxInvoiceState = getRevenueTaxInvoiceState(revenue);
    const { preview, missingFields, structuralBlockedReasons } =
      await prepareIssuePreview(revenue);
    const nonEditableBlockedReasons = [
      ...getStateBlockedReasons(taxInvoiceState),
      ...structuralBlockedReasons,
    ];
    const blockedReasons = [...nonEditableBlockedReasons, ...missingFields];

    return NextResponse.json({
      success: true,
      canIssue: blockedReasons.length === 0,
      taxInvoiceState,
      missingFields,
      blockedReasons,
      nonEditableBlockedReasons,
      preview,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { user, authUnavailable } = await requireRouteUser();
  if (!user) {
    return createRouteAuthErrorResponse(authUnavailable);
  }

  const { id } = await context.params;
  const admin = createAdminClient();

  try {
    const revenue = await selectRevenue(id);
    if (!revenue) {
      return NextResponse.json({ error: "Revenue not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
    const action = getPatchAction(body);

    if (!action) {
      return NextResponse.json(
        { error: "지원하지 않는 세금계산서 작업입니다." },
        { status: 400 }
      );
    }

    if (action === "sync") {
      if (!hasTaxInvoiceTrackingInfo(revenue)) {
        return NextResponse.json(
          { error: "발행 추적 정보가 없어 Bolta 상태를 재확인할 수 없습니다." },
          { status: 400 }
        );
      }

      const result = await syncRevenueTaxInvoiceStatus(revenue);

      logInfo(
        result.resolved ? "SYNC_REVENUE_TAX_INVOICE_SUCCESS" : "SYNC_REVENUE_TAX_INVOICE_PENDING",
        result.resolved
          ? `세금계산서 상태 수동 복구: ${revenue.title}`
          : `세금계산서 상태 재확인 대기: ${revenue.title}`,
        {
          resource: "revenue",
          resource_id: revenue.id,
          actor_id: user.id,
          details: {
            resolved: result.resolved,
            issuance_key: revenue.tax_invoice_issuance_key,
            client_reference_id: revenue.tax_invoice_client_reference_id,
            message: result.message,
          },
        }
      );

      return NextResponse.json({
        success: true,
        resolved: result.resolved,
        message: result.message,
        data: result.data,
        stale: isRevenueTaxInvoiceIssuingStale(revenue),
      });
    }

    if (getRevenueTaxInvoiceState(revenue) !== "issuing") {
      return NextResponse.json(
        { error: "발행중 상태인 세금계산서만 강제 취소할 수 있습니다." },
        { status: 409 }
      );
    }

    const ageMinutes =
      revenue.tax_invoice_issue_requested_at
        ? Math.max(
            0,
            Math.floor(
              (Date.now() -
                new Date(revenue.tax_invoice_issue_requested_at).getTime()) /
                60_000
            )
          )
        : null;
    const errorMessage =
      "사용자가 발행중 상태를 강제 취소했습니다. 볼타 관리자 화면에서 실제 발행 여부를 반드시 확인하세요. " +
      "웹훅이 뒤늦게 도착해 실제로는 발행이 완료될 수 있으며, 이 경우 상태 정합성이 맞지 않을 수 있습니다.";

    const { error: resetError } = await admin
      .from("revenues")
      .update({
        tax_invoice_issue_status: "failed",
        is_tax_invoice_issued: false,
        tax_invoice_date: null,
        tax_invoice_issued_at: null,
        tax_invoice_url: null,
        tax_invoice_nts_transaction_id: null,
        tax_invoice_error_code: "FORCE_CANCELLED",
        tax_invoice_error_message: errorMessage,
      })
      .eq("id", revenue.id);

    if (resetError) {
      throw new Error(resetError.message);
    }

    logError("FORCE_CANCEL_REVENUE_TAX_INVOICE", `세금계산서 발행 강제 취소: ${revenue.title}`, {
      resource: "revenue",
      resource_id: revenue.id,
      actor_id: user.id,
      details: {
        issuance_key: revenue.tax_invoice_issuance_key,
        client_reference_id: revenue.tax_invoice_client_reference_id,
        requested_at: revenue.tax_invoice_issue_requested_at,
        age_minutes: ageMinutes,
      },
    });

    return NextResponse.json({
      success: true,
      resolved: true,
      message: errorMessage,
      data: await selectUpdatedRevenue(revenue.id),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";

    logError("ERROR_REVENUE_TAX_INVOICE_PATCH", `세금계산서 상태 복구 API 오류: ${id}`, {
      resource: "revenue",
      resource_id: id,
      actor_id: user.id,
      details: {
        message,
      },
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { user, authUnavailable } = await requireRouteUser();
  if (!user) {
    return createRouteAuthErrorResponse(authUnavailable);
  }

  const { id } = await context.params;
  const admin = createAdminClient();

  try {
    const revenue = await selectRevenue(id);
    if (!revenue) {
      return NextResponse.json({ error: "Revenue not found" }, { status: 404 });
    }

    const taxInvoiceState = getRevenueTaxInvoiceState(revenue);
    if (taxInvoiceState === "not_required") {
      return NextResponse.json(
        { error: "세금계산서 발행 대상이 아닌 매출입니다." },
        { status: 400 }
      );
    }

    if (taxInvoiceState === "issued") {
      return NextResponse.json(
        { error: "이미 세금계산서가 발행된 매출입니다." },
        { status: 409 }
      );
    }

    if (taxInvoiceState === "issuing") {
      const current = await selectRevenueWithProject(id);
      return NextResponse.json(
        {
          error: "세금계산서 발행이 진행 중입니다.",
          data: current,
        },
        { status: 409 }
      );
    }

    const requestBody = (await request.json().catch(() => null)) as
      | { preview?: unknown }
      | null;
    const { preview: basePreview, structuralBlockedReasons } =
      await prepareIssuePreview(revenue);

    if (structuralBlockedReasons.length > 0) {
      return NextResponse.json(
        {
          error: "발행 준비가 완료되지 않았습니다.",
          blockedReasons: structuralBlockedReasons,
          nonEditableBlockedReasons: structuralBlockedReasons,
          preview: basePreview,
        },
        { status: 400 }
      );
    }

    const preview = mergeTaxInvoicePreview(
      basePreview,
      getPreviewOverride(requestBody)
    );
    const missingFields = getTaxInvoicePreviewMissingFields(preview);

    if (missingFields.length > 0) {
      return NextResponse.json(
        {
          error: "필수 발행 정보가 누락되어 세금계산서를 발행할 수 없습니다.",
          missingFields,
          blockedReasons: missingFields,
          nonEditableBlockedReasons: [],
          preview,
        },
        { status: 400 }
      );
    }

    const clientReferenceId = makeClientReferenceId(revenue.id);
    const issueRequestedAt = new Date().toISOString();

    const { error: pendingError } = await admin
      .from("revenues")
      .update({
        tax_invoice_issue_status: "issuing",
        tax_invoice_client_reference_id: clientReferenceId,
        tax_invoice_issue_requested_at: issueRequestedAt,
        tax_invoice_issuance_key: null,
        tax_invoice_error_code: null,
        tax_invoice_error_message: null,
        tax_invoice_request_payload: preview,
      })
      .eq("id", revenue.id);

    if (pendingError) {
      throw new Error(pendingError.message);
    }

    try {
      const issueResponse = await issueBoltaTaxInvoice(preview, {
        customerKey: await getBoltaCustomerKey(),
        clientReferenceId,
      });

      const { error: updateError } = await admin
        .from("revenues")
        .update({
          tax_invoice_issue_status: "issuing",
          tax_invoice_issuance_key: issueResponse.issuanceKey,
          tax_invoice_error_code: null,
          tax_invoice_error_message: null,
        })
        .eq("id", revenue.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      logInfo("ISSUE_REVENUE_TAX_INVOICE", `세금계산서 발행 요청: ${revenue.title}`, {
        resource: "revenue",
        resource_id: revenue.id,
        actor_id: user.id,
        details: {
          client_reference_id: clientReferenceId,
          issuance_key: issueResponse.issuanceKey,
        },
      });

      const updatedRevenue = await selectRevenueWithProject(revenue.id);

      return NextResponse.json(
        {
          success: true,
          data: updatedRevenue,
        },
        { status: 202 }
      );
    } catch (error) {
      if (error instanceof BoltaApiError) {
        try {
          const issueStatus = await getBoltaIssueStatus(clientReferenceId);

          const { error: recoveredUpdateError } = await admin
            .from("revenues")
            .update({
              tax_invoice_issue_status: "issuing",
              tax_invoice_issuance_key: issueStatus.issuanceKey,
              tax_invoice_error_code: null,
              tax_invoice_error_message: null,
            })
            .eq("id", revenue.id);

          if (recoveredUpdateError) {
            throw new Error(recoveredUpdateError.message);
          }

          logInfo(
            "RECOVER_REVENUE_TAX_INVOICE",
            `세금계산서 발행 상태 복구: ${revenue.title}`,
            {
              resource: "revenue",
              resource_id: revenue.id,
              actor_id: user.id,
              details: {
                client_reference_id: clientReferenceId,
                issuance_key: issueStatus.issuanceKey,
                message: issueStatus.message,
              },
            }
          );

          const updatedRevenue = await selectRevenueWithProject(revenue.id);

          return NextResponse.json(
            {
              success: true,
              data: updatedRevenue,
            },
            { status: 202 }
          );
        } catch {
          // Fall through to failed status update below.
        }
      }

      const errorCode = error instanceof BoltaApiError ? error.code : null;
      const errorMessage =
        error instanceof Error
          ? error.message
          : "세금계산서 발행 요청 중 오류가 발생했습니다.";

      await admin
        .from("revenues")
        .update({
          tax_invoice_issue_status: "failed",
          tax_invoice_issuance_key: null,
          tax_invoice_error_code: errorCode,
          tax_invoice_error_message: errorMessage,
        })
        .eq("id", revenue.id);

      logError("FAIL_REVENUE_TAX_INVOICE", `세금계산서 발행 요청 실패: ${revenue.title}`, {
        resource: "revenue",
        resource_id: revenue.id,
        actor_id: user.id,
        details: {
          client_reference_id: clientReferenceId,
          code: errorCode,
          message: errorMessage,
        },
      });

      return NextResponse.json(
        { error: errorMessage },
        { status: error instanceof BoltaApiError ? error.status : 500 }
      );
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error";

    logError("ERROR_REVENUE_TAX_INVOICE", `세금계산서 발행 API 오류: ${id}`, {
      resource: "revenue",
      resource_id: id,
      actor_id: user.id,
      details: {
        message,
      },
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

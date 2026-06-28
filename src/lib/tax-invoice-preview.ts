import type { BoltaTaxInvoiceIssueRequest } from "@/lib/bolta";

type UnknownRecord = Record<string, unknown>;

function compactJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRequiredString(value: unknown, fallback = "") {
  if (typeof value !== "string") {
    return fallback.trim();
  }

  return value.trim();
}

function asOptionalString(value: unknown, fallback?: string) {
  if (typeof value !== "string") {
    const trimmedFallback = fallback?.trim();
    return trimmedFallback ? trimmedFallback : undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function asNumber(value: unknown, fallback?: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim().replace(/,/g, ""));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function normalizeBusinessNumber(value: string | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

export function mergeTaxInvoicePreview(
  fallback: BoltaTaxInvoiceIssueRequest,
  input: unknown
): BoltaTaxInvoiceIssueRequest {
  const source = isRecord(input) ? input : {};
  const supplier = isRecord(source.supplier) ? source.supplier : {};
  const supplierManager = isRecord(supplier.manager) ? supplier.manager : {};
  const supplied = isRecord(source.supplied) ? source.supplied : {};
  const suppliedManagerSource = Array.isArray(supplied.managers)
    ? supplied.managers.find(isRecord)
    : null;
  const suppliedManager = suppliedManagerSource ?? {};
  const fallbackItems = fallback.items.length > 0 ? fallback.items : [];
  const rawItems = Array.isArray(source.items) && source.items.length > 0
    ? source.items
    : fallbackItems;

  return compactJson({
    date: asRequiredString(source.date, fallback.date),
    purpose:
      source.purpose === "RECEIPT" || source.purpose === "CLAIM"
        ? source.purpose
        : fallback.purpose,
    supplier: {
      identificationNumber: normalizeBusinessNumber(
        asRequiredString(
          supplier.identificationNumber,
          fallback.supplier.identificationNumber
        )
      ),
      organizationName: asRequiredString(
        supplier.organizationName,
        fallback.supplier.organizationName
      ),
      representativeName: asRequiredString(
        supplier.representativeName,
        fallback.supplier.representativeName
      ),
      address: asOptionalString(supplier.address, fallback.supplier.address),
      businessItem: asOptionalString(
        supplier.businessItem,
        fallback.supplier.businessItem
      ),
      businessType: asOptionalString(
        supplier.businessType,
        fallback.supplier.businessType
      ),
      manager: {
        email: asRequiredString(
          supplierManager.email,
          fallback.supplier.manager.email
        ),
        name: asOptionalString(
          supplierManager.name,
          fallback.supplier.manager.name
        ),
        telephone: asOptionalString(
          supplierManager.telephone,
          fallback.supplier.manager.telephone
        ),
      },
    },
    supplied: {
      identificationNumber: normalizeBusinessNumber(
        asRequiredString(
          supplied.identificationNumber,
          fallback.supplied.identificationNumber
        )
      ),
      organizationName: asRequiredString(
        supplied.organizationName,
        fallback.supplied.organizationName
      ),
      representativeName: asRequiredString(
        supplied.representativeName,
        fallback.supplied.representativeName
      ),
      address: asOptionalString(supplied.address, fallback.supplied.address),
      businessItem: asOptionalString(
        supplied.businessItem,
        fallback.supplied.businessItem
      ),
      businessType: asOptionalString(
        supplied.businessType,
        fallback.supplied.businessType
      ),
      managers: [
        {
          email: asRequiredString(
            suppliedManager.email,
            fallback.supplied.managers[0]?.email ?? ""
          ),
          name: asOptionalString(
            suppliedManager.name,
            fallback.supplied.managers[0]?.name
          ),
          telephone: asOptionalString(
            suppliedManager.telephone,
            fallback.supplied.managers[0]?.telephone
          ),
        },
      ],
    },
    items: rawItems.map((item, index) => {
      const fallbackItem = fallbackItems[index] ?? fallbackItems[0];
      const itemSource = isRecord(item) ? item : {};

      return {
        date: asRequiredString(itemSource.date, fallbackItem?.date ?? fallback.date),
        name: asRequiredString(itemSource.name, fallbackItem?.name ?? ""),
        quantity: asNumber(itemSource.quantity, fallbackItem?.quantity ?? 1),
        unitPrice: asNumber(itemSource.unitPrice, fallbackItem?.unitPrice),
        supplyCost: asNumber(itemSource.supplyCost, fallbackItem?.supplyCost ?? 0) ?? 0,
        tax: asNumber(itemSource.tax, fallbackItem?.tax),
        specification: asOptionalString(
          itemSource.specification,
          fallbackItem?.specification
        ),
        description: asOptionalString(
          itemSource.description,
          fallbackItem?.description
        ),
      };
    }),
    description: asOptionalString(source.description, fallback.description),
  } satisfies BoltaTaxInvoiceIssueRequest);
}

export function getTaxInvoicePreviewMissingFields(
  preview: BoltaTaxInvoiceIssueRequest
) {
  const missingFields: string[] = [];
  const supplierBusinessNumber = normalizeBusinessNumber(
    preview.supplier.identificationNumber
  );
  const recipientBusinessNumber = normalizeBusinessNumber(
    preview.supplied.identificationNumber
  );
  const recipientManager = preview.supplied.managers[0];
  const firstItem = preview.items[0];

  if (!preview.date) {
    missingFields.push("발행일");
  }

  if (!supplierBusinessNumber) {
    missingFields.push("공급자 사업자번호");
  } else if (supplierBusinessNumber.length !== 10) {
    missingFields.push("공급자 사업자번호 형식");
  }

  if (!preview.supplier.organizationName) {
    missingFields.push("공급자 상호");
  }

  if (!preview.supplier.representativeName) {
    missingFields.push("공급자 대표자명");
  }

  if (!preview.supplier.manager.email) {
    missingFields.push("공급자 담당자 이메일");
  }

  if (!recipientBusinessNumber) {
    missingFields.push("공급받는자 사업자번호");
  } else if (recipientBusinessNumber.length !== 10) {
    missingFields.push("공급받는자 사업자번호 형식");
  }

  if (!preview.supplied.organizationName) {
    missingFields.push("공급받는자 상호");
  }

  if (!preview.supplied.representativeName) {
    missingFields.push("공급받는자 대표자명");
  }

  if (!recipientManager?.email) {
    missingFields.push("공급받는자 담당자 이메일");
  }

  if (!firstItem) {
    missingFields.push("품목");
  } else {
    if (!firstItem.date) {
      missingFields.push("품목 일자");
    }

    if (!firstItem.name) {
      missingFields.push("품목명");
    }
  }

  return [...new Set(missingFields)];
}

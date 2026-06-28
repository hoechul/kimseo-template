function normalizePhoneDigits(value: string) {
  const digits = value.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  if (digits.startsWith("82")) {
    const localDigits = digits.slice(2);
    return localDigits.startsWith("0") ? localDigits : `0${localDigits}`;
  }

  return digits;
}

export function formatKoreanPhoneNumber(value: string | null | undefined) {
  if (typeof value !== "string") {
    return "";
  }

  const normalizedDigits = normalizePhoneDigits(value.trim());
  if (!normalizedDigits) {
    return "";
  }

  if (normalizedDigits.startsWith("02")) {
    if (normalizedDigits.length === 9) {
      return `${normalizedDigits.slice(0, 2)}-${normalizedDigits.slice(2, 5)}-${normalizedDigits.slice(5)}`;
    }

    if (normalizedDigits.length === 10) {
      return `${normalizedDigits.slice(0, 2)}-${normalizedDigits.slice(2, 6)}-${normalizedDigits.slice(6)}`;
    }
  } else {
    if (normalizedDigits.length === 10) {
      return `${normalizedDigits.slice(0, 3)}-${normalizedDigits.slice(3, 6)}-${normalizedDigits.slice(6)}`;
    }

    if (normalizedDigits.length === 11) {
      return `${normalizedDigits.slice(0, 3)}-${normalizedDigits.slice(3, 7)}-${normalizedDigits.slice(7)}`;
    }
  }

  return normalizedDigits;
}

export function asNullableFormattedKoreanPhoneNumber(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const formatted = formatKoreanPhoneNumber(value);
  return formatted || null;
}

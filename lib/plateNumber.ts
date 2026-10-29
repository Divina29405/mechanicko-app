export function sanitizePlateNumber(value: string): string {
  let result = "";
  let alphanumericCount = 0;
  let hasSpace = false;

  for (const character of value.toUpperCase()) {
    if (/^[A-Z0-9]$/.test(character)) {
      if (alphanumericCount >= 7) continue;
      result += character;
      alphanumericCount += 1;
    } else if (
      character === " " &&
      result.length > 0 &&
      !hasSpace &&
      alphanumericCount < 7
    ) {
      result += character;
      hasSpace = true;
    }
  }

  return result;
}

export function isValidPlateNumber(value: string): boolean {
  const normalized = value.trim();
  return (
    /^[A-Z0-9]+(?: [A-Z0-9]+)?$/i.test(normalized) &&
    normalized.replace(/ /g, "").length <= 7
  );
}

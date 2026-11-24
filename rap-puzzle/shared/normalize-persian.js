export function normalizePersianToken(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u0640]/gu, "")
    .replace(/[\u064A\u0649]/gu, "ی")
    .replace(/\u0643/gu, "ک")
    .replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("fa");
}

export function lastWordOf(value) {
  const words = String(value ?? "").normalize("NFKC").trim().split(/\s+/u);
  return normalizePersianToken(words.at(-1) || "");
}

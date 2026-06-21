import "server-only";

import { randomBytes } from "crypto";

export const QUERY_CODE_MIN_LENGTH = 4;
export const QUERY_CODE_MAX_LENGTH = 40;

export function generateQueryCode() {
  return randomBytes(4).toString("hex").toUpperCase();
}

export function normalizeQueryCode(value: unknown) {
  return String(value ?? "").trim().slice(0, QUERY_CODE_MAX_LENGTH);
}

export function isValidQueryCode(code: string) {
  return (
    code.length >= QUERY_CODE_MIN_LENGTH &&
    code.length <= QUERY_CODE_MAX_LENGTH &&
    !/\s/u.test(code)
  );
}

export function getQueryCodeRuleText() {
  return `${QUERY_CODE_MIN_LENGTH}-${QUERY_CODE_MAX_LENGTH} 位，不能包含空格。`;
}

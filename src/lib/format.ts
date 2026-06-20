export function formatRks(value: number) {
  return value.toFixed(3);
}

export function formatScore(value: number) {
  if (Number.isInteger(value)) {
    return value.toFixed(0);
  }

  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function formatDate(value: string | Date) {
  const date = typeof value === "string" ? new Date(`${value}T00:00:00`) : value;

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1);
  const day = String(date.getDate());

  return `${year}/${month}/${day}`;
}

export function normalizeDateInput(value: string | Date) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value.slice(0, 10);
}

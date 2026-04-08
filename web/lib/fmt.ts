// 공용 날짜 포맷 유틸
export function fmtDateTime(input: number | string | Date | null | undefined): string {
  if (input == null) return '-';
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return '-';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

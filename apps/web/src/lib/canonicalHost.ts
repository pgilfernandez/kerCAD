/** A fixed DNS name keeps browser storage independent of DHCP addresses. */
export function normalizeCanonicalHost(value: string | undefined): string {
  const host = value?.trim().toLowerCase() ?? "";
  if (!host || host === "off") return "";
  const labels = host.split(".");
  if (host.length > 253 || /^[\d.]+$/.test(host) || labels.some((label) => !/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/.test(label))) {
    throw new Error("KERCAD_CANONICAL_HOST must be a DNS hostname without a protocol, port or path (or 'off' to disable).");
  }
  return host;
}

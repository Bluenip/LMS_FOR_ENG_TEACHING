/**
 * Masks the trailing segments of IPv4/IPv6 addresses before persisting session logs
 * so audit history retains coarse origin context without storing raw client IPs.
 */
export function maskIpAddress(ip: string | null | undefined): string | null {
  if (!ip) return null;
  let clean = ip.trim();
  if (!clean || clean === "local" || clean === "unknown") return null;

  // Handle IPv4-mapped IPv6 like "::ffff:192.168.1.42"
  if (clean.toLowerCase().startsWith("::ffff:")) {
    clean = clean.slice(7);
  }

  // Standard IPv4: keep first 2 octets -> 192.168.x.x
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?::\d+)?$/.exec(clean);
  if (ipv4Match) {
    return `${ipv4Match[1]}.${ipv4Match[2]}.x.x`;
  }

  // IPv6: keep /48 prefix (first 3 hextets)
  if (clean.includes(":")) {
    if (clean === "::1") return "::1";
    const parts = clean.split(":").filter((_, idx, arr) => !(idx === arr.length - 1 && arr[idx] === ""));
    const prefix = parts.slice(0, 3).map((p) => p || "0").join(":");
    return `${prefix}::/48`;
  }

  return "masked";
}

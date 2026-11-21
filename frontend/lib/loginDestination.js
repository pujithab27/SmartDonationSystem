// Only allow known donor destinations, preserving useful search filters.
export function loginDestination(role, next) {
  const fallback = `/dashboard/${["donor", "ngo", "admin"].includes(role) ? role : "donor"}`;
  if (role !== "donor" || typeof next !== "string" || !next.startsWith("/") || /[\\\u0000-\u0020]/.test(next) || next.startsWith("//")) return fallback;
  try {
    const target = new URL(next, "https://donation.local");
    if (target.origin !== "https://donation.local") return fallback;
    const params = new URLSearchParams();
    if (["/ngos", "/dashboard/donor/ngos", "/dashboard/donor/requirements"].includes(target.pathname)) {
      for (const key of ["category", "query"]) {
        const value = target.searchParams.get(key);
        if (value) params.set(key, value.slice(0, key === "query" ? 200 : 80));
      }
      if (target.searchParams.get("needs") === "open") params.set("needs", "open");
      const pathname = target.pathname === "/dashboard/donor/ngos" ? "/dashboard/donor/requirements" : target.pathname;
      return pathname + (params.size ? `?${params}` : "");
    }
    if (/^\/donations\/[a-zA-Z0-9-]+$/.test(target.pathname)) return target.pathname;
    if (/^\/campaigns\/[a-zA-Z0-9-]+$/.test(target.pathname)) {
      const amount = target.searchParams.get("amount");
      if (amount && /^\d{1,8}(?:\.\d{1,2})?$/.test(amount) && Number(amount) >= 1 && Number(amount) <= 10000000) params.set("amount", amount);
      return target.pathname + (params.size ? `?${params}` : "") + (target.hash === "#donate" ? "#donate" : "");
    }
  } catch { /* An invalid return path falls back to the role workspace. */ }
  return fallback;
}

const retiredSections = {
  admin: ["campaigns", "reports", "verification"],
  donor: ["ngos", "campaigns", "donations", "saved", "settings", "nearby"],
  ngo: ["campaigns", "donations", "settings", "verification", "nearby"],
};

export function retiredWorkspaceDestination(role, section, searchParams = {}) {
  if (!Object.hasOwn(retiredSections, role) || !retiredSections[role].includes(section)) return null;
  if (role === "admin") return section === "verification" ? "/dashboard/admin/approvals" : "/dashboard/admin/tracking";
  if (section === "nearby") return `/dashboard/${role}`;
  if (role === "donor") {
    if (section === "donations") return "/dashboard/donor/items";
    if (section === "settings") return "/dashboard/donor";
    const params = new URLSearchParams();
    if (section === "ngos") {
      for (const key of ["category", "query"]) {
        const value = searchParams[key];
        if (typeof value === "string" && value) params.set(key, value.slice(0, key === "query" ? 200 : 80));
      }
    }
    return "/dashboard/donor/requirements" + (params.size ? `?${params}` : "");
  }
  if (section === "donations") return "/dashboard/ngo/matches";
  if (section === "verification") return "/dashboard/ngo/profile";
  return "/dashboard/ngo";
}

export function matchesSearch(text, query = "") {
  const searchable = String(text).toLowerCase();
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean).every((term) => searchable.includes(term));
}

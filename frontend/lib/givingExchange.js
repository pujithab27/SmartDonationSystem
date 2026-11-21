export const givingThemes = [
  { id: "food", category: "Food", label: "Food", caption: "Fill a pantry.", detail: "Rice, flour, cooking oil, and everyday staples.", mark: "01", tone: "grain" },
  { id: "clothing", category: "Clothing", label: "Clothing", caption: "Share some warmth.", detail: "Everyday clothing for someone’s next chapter.", mark: "02", tone: "cloth" },
  { id: "education", category: "Education", label: "Education", caption: "Make space to learn.", detail: "Books, notebooks, and the tools for a fresh start.", mark: "03", tone: "learn" },
  { id: "healthcare", category: "Healthcare", label: "Healthcare", caption: "Put care within reach.", detail: "Explore the healthcare supplies organizations request.", mark: "04", tone: "care" },
];

export function matchingNeeds(requests, category) {
  return requests.filter((request) => request.status === "Open" && request.items.some((item) => item.category === category));
}

export function directoryHref(category, query = "") {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (query) params.set("query", query);
  params.set("needs", "open");
  return `/dashboard/donor/requirements?${params.toString()}`;
}

export function readDirectoryFilters(search, categories) {
  const params = new URLSearchParams(search);
  return {
    query: (params.get("query") || "").slice(0, 200),
    category: categories.includes(params.get("category")) ? params.get("category") : "All",
    needsOnly: params.get("needs") === "open",
  };
}

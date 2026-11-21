export const categoryIcons = {
  Accessories: "heart", Clothing: "people", Education: "book", Electronics: "grid",
  Food: "food", Footwear: "leaf", Healthcare: "medical", Household: "building",
};

export function deliveryLocation(request) {
  return [request.deliveryAddress, request.deliveryCity, request.deliveryState, request.deliveryPincode].filter(Boolean).join(", ");
}

export function formatItemQuantity(item) {
  const quantity = Number(item.quantity);
  const plurals = { piece: "pieces", pair: "pairs", packet: "packets", box: "boxes", bottle: "bottles", strip: "strips", unit: "units", litre: "litres" };
  const unit = quantity === 1 ? item.unit : plurals[item.unit] || item.unit;
  return `${quantity.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ${unit}`;
}

export function requestProgress(request) {
  const items = request.items || [];
  const ratios = items.map((item) => Math.min(1, Math.max(0, Number(item.fulfilled || 0) / Number(item.quantity) || 0)));
  const complete = items.length > 0 && ratios.every((ratio) => ratio === 1);
  const percent = complete ? 100 : Math.min(99, Math.round(ratios.reduce((total, ratio) => total + ratio, 0) / (items.length || 1) * 100));
  const hasReceived = items.some((item) => Number(item.fulfilled) > 0);
  const fullyReserved = items.length > 0 && items.every((item) => Number(item.fulfilled || 0) + Number(item.reserved || 0) >= Number(item.quantity));
  const status = request.status === "Closed" ? "Closed" : complete ? "Fulfilled" : fullyReserved ? "Awaiting delivery" : hasReceived ? "Partly fulfilled" : "Open";
  return {percent, complete, status};
}

export function filterOrganizations(ngos, requests, query = "", category = "All", needsOnly = false) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return ngos.filter((ngo) => {
    if (ngo.status !== "Verified") return false;
    const open = requests.filter((request) => request.ownerEmail === ngo.email && request.status === "Open");
    if (needsOnly && !open.length) return false;
    if (category !== "All" && !open.some((request) => request.items.some((item) => item.category === category))) return false;
    const searchable = [ngo.ngoName, ngo.city, ngo.state, ngo.description,
      ...open.flatMap((request) => [request.title, request.deliveryCity, request.deliveryState, ...request.items.flatMap((item) => [item.name, item.category])]),
    ].join(" ").toLowerCase();
    return terms.every((term) => searchable.includes(term));
  });
}

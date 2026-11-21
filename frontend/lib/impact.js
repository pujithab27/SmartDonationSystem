export function donorImpact(matches = []) {
  const completed = matches.filter((match) => match.status === "Completed");
  const quantities = new Map();
  for (const match of completed) {
    const key = `${match.name}:${match.unit}`;
    const item = quantities.get(key) || { name: match.name, unit: match.unit, quantity: 0 };
    item.quantity += Number(match.quantity) || 0;
    quantities.set(key, item);
  }
  return {
    completed: [...completed].sort((a, b) => new Date(b.completedAt || b.createdAt) - new Date(a.completedAt || a.createdAt)),
    organizations: new Set(completed.map((match) => match.ngoId ?? match.ngoEmail ?? match.ngoName)).size,
    quantities: [...quantities.values()],
    inProgress: matches.filter((match) => ["Pending", "Pickup scheduled"].includes(match.status)).length,
  };
}

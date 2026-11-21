const fieldLabels = {
  email: "Email address", phone: "Phone number", pincode: "PIN code",
  ngoName: "NGO name", registrationNumber: "Registration number",
  firstName: "First name", lastName: "Last name", confirmPassword: "Confirm password",
  deliveryAddress: "Delivery address", deliveryCity: "Delivery city",
  deliveryState: "Delivery state", deliveryPincode: "Delivery PIN code",
  neededBy: "Needed-by date", need: "Target amount", itemId: "Donation item",
  contactPhone: "NGO contact phone", deliveryProof: "Delivery photo", deliveryNote: "Delivery note", pickupAt: "Pickup date and time",
  items: "Requested items", agree: "Terms agreement",
};
function label(key) {
  if (fieldLabels[key]) return fieldLabels[key];
  const words = key.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
function formatError(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(formatError).filter(Boolean).join(" ");
  if (value && typeof value === "object") {
    if (value.detail) return formatError(value.detail);
    return Object.entries(value).map(([key, message]) => {
      const text = formatError(message);
      if (!text) return "";
      return key === "non_field_errors" ? text : `${label(key)}: ${text}`;
    }).filter(Boolean).join(" ");
  }
  return "";
}
export function formErrorMessage(value) {
  return formatError(value) || "Your request could not be completed. Please try again.";
}

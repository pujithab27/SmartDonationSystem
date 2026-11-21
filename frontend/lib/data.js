export const categories = [
  "Education",
  "Food",
  "Healthcare",
  "Disaster Relief",
  "Elderly Care",
  "Child Welfare",
  "Environment",
];
export const categoryImages = {
  Education: "/images/education.jpg",
  Food: "/images/food.jpg",
  Healthcare: "/images/healthcare.jpg",
  "Disaster Relief": "/images/community.jpg",
  "Elderly Care": "/images/healthcare.jpg",
  "Child Welfare": "/images/children.jpg",
  Environment: "/images/environment.jpg",
};
export const money = (amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);
export const percent = (campaign) =>
  Math.min(100, Math.round((100 * campaign.raised) / campaign.need));
export const steps = {
  donor: [
    ["Join and get approved", "Create your donor account. An administrator reviews your registration."],
    ["Offer useful items", "Browse NGO needs or add an item with its quantity and pickup address."],
    ["Match and arrange pickup", "Choose an eligible NGO and schedule pickup with clear contact details."],
    ["See your impact", "Track the NGO receipt, view delivery proof, and celebrate confirmed deliveries."],
  ],
  ngo: [
    ["Register your organization", "Share your contact and registration details for administrator approval."],
    ["Request what you need", "List items, quantities, priority and the delivery location."],
    ["Connect with donors", "Browse available donations and follow matched offers and scheduled pickups."],
    ["Confirm physical receipt", "Check the received items, upload proof and add a note for the donor."],
  ],
};

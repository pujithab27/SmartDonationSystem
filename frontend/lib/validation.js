export function validateProfile(fields, role, signup = true) {
  const errors = {};
  const required =
    role === "ngo"
      ? [
          "ngoName",
          "registrationNumber",
          "email",
          "phone",
          "description",
          "address",
          "city",
          "state",
          "pincode",
        ]
      : [
          "firstName",
          "lastName",
          "email",
          "phone",
          "address",
          "city",
          "state",
          "pincode",
        ];
  for (const name of required)
    if (!String(fields[name] || "").trim())
      errors[name] = "This field is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email || ""))
    errors.email = "Enter a valid email address.";
  if (
    !/^(?:\+91[\s-]?)?[6-9]\d{9}$/.test(
      (fields.phone || "").replace(/[\s-]/g, ""),
    )
  )
    errors.phone = "Enter a valid 10-digit Indian mobile number.";
  if (!/^[1-9]\d{5}$/.test(fields.pincode || ""))
    errors.pincode = "Enter a valid 6-digit PIN code.";
  if (fields.website) {
    try {
      const url = new URL(fields.website);
      if (!["https:", "http:"].includes(url.protocol)) throw new Error();
    } catch {
      errors.website = "Enter a full URL, such as https://example.org.";
    }
  }
  if (signup) {
    if ((fields.password || "").length < 8)
      errors.password = "Use at least 8 characters.";
    if (fields.password !== fields.confirmPassword)
      errors.confirmPassword = "Passwords do not match.";
  }
  return errors;
}

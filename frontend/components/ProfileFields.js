import AddressMapButton from "./AddressMapButton";
import Input from "./Input";
export default function ProfileFields({
  role,
  errors = {},
  values = {},
  disabledEmail = false,
}) {
  const field = (name, label, props = {}) => (
    <Input
      key={name}
      name={name}
      label={label}
      error={errors[name]}
      defaultValue={values[name] || ""}
      {...props}
    />
  );
  return (
    <>
      {role === "ngo" ? (
        <>
          {field("ngoName", "Organization name", {
            placeholder: "Your organization’s name",
          })}
          {field("registrationNumber", "NGO registration number", {
            placeholder: "e.g. NGO-2026-001",
          })}
        </>
      ) : (
        <div className="form-grid">
          {field("firstName", "First name", {
            autoComplete: "given-name",
            placeholder: "First name",
          })}
          {field("lastName", "Last name", {
            autoComplete: "family-name",
            placeholder: "Last name",
          })}
        </div>
      )}
      <div className="form-grid">
        {field("email", "Email address", {
          type: "email",
          autoComplete: "email",
          placeholder: "you@example.com",
          readOnly: disabledEmail,
        })}
        {field("phone", "Phone number", {
          type: "tel",
          autoComplete: "tel",
          placeholder: "98765 43210",
        })}
      </div>
      {role === "ngo" && (
        <>
          {field("website", "Website (optional)", {
            type: "url",
            placeholder: "https://yourorganization.org",
            required: false,
          })}
          <div className="field">
            <label htmlFor="ngo-description">
              Your mission <span className="required">*</span>
            </label>
            <textarea
              id="ngo-description"
              name="description"
              rows={3}
              required
              defaultValue={values.description}
              placeholder="Tell us about the communities you serve."
              aria-invalid={Boolean(errors.description)}
              aria-describedby={
                errors.description ? "description-error" : undefined
              }
            />
            {errors.description && (
              <small id="description-error" className="field-error">
                {errors.description}
              </small>
            )}
          </div>
        </>
      )}
      <AddressMapButton/>
      {field("address", "Address", {
        autoComplete: "street-address",
        placeholder: "Street and locality",
      })}
      <div className="form-grid three">
        {field("city", "City", { autoComplete: "address-level2" })}
        {field("state", "State", { autoComplete: "address-level1" })}
        {field("pincode", "PIN code", {
          inputMode: "numeric",
          maxLength: 6,
          autoComplete: "postal-code",
        })}
      </div>
    </>
  );
}

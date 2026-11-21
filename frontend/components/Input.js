"use client";

import { useId, useState } from "react";
import Icon from "./Icon";
export default function Input({
  label,
  name,
  type = "text",
  required = true,
  error,
  hint,
  ...props
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div className={`field ${error ? "field-invalid" : ""}`}>
      <label htmlFor={id}>
        {label}
        {required && <span className="required"> *</span>}
      </label>
      <div className={type === "password" ? "password-input" : ""}>
        <input
          id={id}
          name={name}
          type={type === "password" && visible ? "text" : type}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={error || hint ? `${id}-help` : undefined}
          {...props}
        />
        {type === "password" && (
          <button
            type="button"
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            onClick={() => setVisible(!visible)}
          >
            <Icon name={visible ? "eyeOff" : "eye"} size={19} />
          </button>
        )}
      </div>
      {(error || hint) && (
        <small
          id={`${id}-help`}
          className={error ? "field-error" : "field-hint"}
        >
          {error || hint}
        </small>
      )}
    </div>
  );
}

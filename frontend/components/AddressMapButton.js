"use client";

import { useRef, useState } from "react";
import LocationPicker from "./dashboard/LocationPicker";
import Icon from "./Icon";

export default function AddressMapButton({ onChoose, disabled = false }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  function confirm(location) {
    if (onChoose) onChoose(location);
    else {
      const form = trigger.current?.form;
      for (const [name, value] of Object.entries(location)) {
        const input = form?.elements.namedItem(name);
        if (!input || input.disabled) continue;
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
    setOpen(false);
  }
  return <>
    <button ref={trigger} type="button" className="pickup-map-trigger" disabled={disabled} onClick={() => setOpen(true)}><Icon name="pin" size={17}/>Choose address on map</button>
    {open && <LocationPicker onClose={() => setOpen(false)} onConfirm={confirm}/>}
  </>;
}

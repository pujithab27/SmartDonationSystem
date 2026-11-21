"use client";
import { forwardRef, useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { beginDictation, dictationValue, speechSupported } from "../lib/speechInput";

const eligibleTypes = ["text", "search", "email", "tel", "url", "number"];

const VoiceField = forwardRef(function VoiceField({ as: Tag = "input", ...props }, forwardedRef) {
  const field = useRef(null), cancel = useRef(null);
  const [supported, setSupported] = useState(false), [listening, setListening] = useState(false), [message, setMessage] = useState("");
  const [phase, setPhase] = useState("");
  const eligible = props["data-voice"] !== "off" && (Tag === "textarea" || eligibleTypes.includes(props.type || "text")) && !props.readOnly;
  useEffect(() => { setSupported(speechSupported()); return () => cancel.current?.(); }, []);
  function bind(node) { field.current = node; if (typeof forwardedRef === "function") forwardedRef(node); else if (forwardedRef) forwardedRef.current = node; }
  function speak() {
    if (listening) { cancel.current?.stop?.(); return; }
    const node = field.current;
    if (!node || node.matches(":disabled") || node.readOnly) return;
    const before = node.value;
    setMessage(""); setListening(true);
    cancel.current = beginDictation({
      onText(text) {
        if (!node.isConnected || node.matches(":disabled") || node.readOnly) return;
        if (node.value !== before) { setMessage("You edited this field while listening. Speak again to replace it."); return; }
        try {
          const value = dictationValue(text, props);
          const prototype = Tag === "textarea" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
          Object.getOwnPropertyDescriptor(prototype, "value").set.call(node, value);
          node.dispatchEvent(new Event("input", { bubbles: true }));
          // React's controlled fields and uncontrolled FormData both receive
          // the dictated value through the same input event as typing.
          setMessage("Voice added. Review this field before saving.");
        } catch (error) { setMessage(error.message); }
      },
      onError: setMessage,
      onStatus: (text, nextPhase) => { setMessage(text); setPhase(nextPhase); },
      onEnd: () => { setListening(false); setPhase(""); },
    });
  }
  const control = <Tag {...props} ref={bind}/>;
  if (!eligible) return control;
  const label = props["aria-label"] || props.placeholder || props.name?.replace(/([A-Z])/g, " $1") || "this field";
  return <span className={`voice-field${listening ? " listening" : ""}`}>
    <span className="voice-field-control">{control}<button type="button" className="field-microphone" aria-label={`${listening ? phase === "recording" ? "Done recording for" : "Cancel voice input for" : "Dictate"} ${label}`} aria-pressed={listening} disabled={!supported || props.disabled} onClick={speak} title={supported ? "Send up to 20 seconds of audio to Gemini for transcription. Select Done when finished." : "Voice needs a supported browser on HTTPS or localhost"}>{listening ? phase === "recording" ? "Done" : "Cancel" : <Icon name="mic" size={17}/>}</button></span>
    {(listening || message) && <small className="voice-field-message" role="status">{message}</small>}
  </span>;
});

export const VoiceInput = forwardRef(function VoiceInput(props, ref) { return <VoiceField {...props} ref={ref}/>; });
export const VoiceTextarea = forwardRef(function VoiceTextarea(props, ref) { return <VoiceField {...props} as="textarea" ref={ref}/>; });

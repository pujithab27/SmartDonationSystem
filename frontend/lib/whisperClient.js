let worker;
let sequence = 0;
const pending = new Map();

function reset(message) {
  worker?.terminate(); worker = null;
  for (const job of pending.values()) { clearTimeout(job.timer); job.reject(new Error(message)); }
  pending.clear();
}

function call(type, audio, onProgress) {
  if (!worker) {
    worker = new Worker(new URL("./whisper.worker.js", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }) => {
      const job = pending.get(data.id);
      if (!job) return;
      if (data.type === "progress") { job.onProgress?.(data.progress); return; }
      clearTimeout(job.timer); pending.delete(data.id);
      if (data.type === "error") job.reject(new Error(data.message));
      else job.resolve(data.result);
    };
    worker.onerror = () => reset("Voice processing could not start. Refresh the page and try again.");
  }
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => reset("Voice processing took too long. Try a shorter recording or type the details."), type === "load" ? 120000 : 180000);
    pending.set(id, { resolve, reject, onProgress, timer });
    worker.postMessage({ id, type, audio }, audio ? [audio.buffer] : []);
  });
}

export const loadSpeechModel = (onProgress) => call("load", undefined, onProgress);
export const transcribeAudio = (audio) => call("transcribe", audio);
// Terminating the worker interrupts WASM inference as well as queued jobs.
// Keep an idle worker warm for the next recording.
export const cancelSpeechProcessing = () => { if (pending.size) reset("Voice input cancelled."); };

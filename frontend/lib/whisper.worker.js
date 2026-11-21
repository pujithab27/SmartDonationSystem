import { env, pipeline } from "@huggingface/transformers";
import { VOICE_MODEL } from './voiceModel.js';

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = '/voice/models/';
env.backends.onnx.wasm.wasmPaths = '/voice/runtime/';
// A single WASM thread also works without cross-origin-isolation headers.
env.backends.onnx.wasm.numThreads = 1;
let model;
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  queue = queue.then(async () => {
    try {
      model ||= pipeline("automatic-speech-recognition", VOICE_MODEL, {
        device: "wasm", dtype: "q8",
        progress_callback: (progress) => self.postMessage({ id: data.id, type: "progress", progress }),
      }).catch((error) => { model = null; throw error; });
      const transcriber = await model;
      if (data.type === "load") {
        self.postMessage({ id: data.id, type: "result", result: true });
      } else {
        const result = await transcriber(data.audio, { chunk_length_s: 25, stride_length_s: 4, max_new_tokens: 256, num_beams: 1, do_sample: false });
        self.postMessage({ id: data.id, type: "result", result: result.text.trim() });
      }
    } catch {
      self.postMessage({ id: data.id, type: "error", message: data.type === "load"
        ? "Voice files could not be loaded from this app. Refresh and try again. If this continues, ask the administrator to finish voice setup."
        : "The recording could not be transcribed. Try a shorter recording or type the details." });
    }
  });
};

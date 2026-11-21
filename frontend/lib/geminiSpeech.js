import { request } from './api.js';

let active;
export const speechSupported = () => typeof window !== 'undefined' && window.isSecureContext
  && Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder && window.AudioContext && window.OfflineAudioContext);

export async function decodeRecording(blob) {
  const context = new window.AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const offline = new window.OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    return (await offline.startRendering()).getChannelData(0);
  } finally { await context.close(); }
}

// Dependencies are injectable to exercise permissions, cancellation and failures
// without using a real microphone in automated tests.
export function createDictation({transcribe = (audio, mode, signal) => request('speech/transcribe/', {method:'POST', body:{audio, mode}, signal}), decode = decodeRecording, supported = speechSupported} = {}) {
  return function begin({onText, onError, onEnd, onStatus = () => {}, mode}) {
    active?.();
    let finished = false, processing = false, stream, recorder, timer, permissionTimer;
    const controller = new AbortController();
    const cancelProcessing = () => controller.abort();
    const chunks = [];
    const stopTracks = () => stream?.getTracks().forEach(track => track.stop());
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer); clearTimeout(permissionTimer);
      if (recorder) {
        recorder.ondataavailable = recorder.onstop = recorder.onerror = null;
        if (recorder.state !== 'inactive') recorder.stop();
      }
      stopTracks();
      if (active === cancel) active = null;
      onEnd();
    };
    const fail = error => {
      if (finished) return;
      onError(error?.name === 'NotAllowedError' ? 'Microphone access was blocked. Allow it or type your details.'
        : error?.name === 'NotFoundError' ? 'No microphone was found. Connect one or type your details.'
        : error?.name === 'NotReadableError' ? 'The microphone could not be read. Check the browser’s selected microphone and whether another app is using it, then try again.'
        : error?.message || 'Voice input could not finish. Try again or type your details.');
      cancelProcessing(); finish();
    };
    const cancel = () => {
      if (finished) return;
      cancelProcessing();
      onStatus('Voice input cancelled.', 'idle'); finish();
    };
    cancel.stop = () => {
      if (finished) return;
      if (!recorder || processing) { cancel(); return; }
      processing = true;
      clearTimeout(timer);
      onStatus('Transcribing with Gemini...', 'processing');
      recorder.stop();
      stopTracks();
    };
    active = cancel;
    if (!supported()) { fail(new Error('Voice needs a supported browser on HTTPS or localhost. You can type instead.')); return cancel; }
    onStatus('Allow microphone access to begin.', 'loading');
    (async () => {
      try {
        permissionTimer = setTimeout(() => fail(new Error('Microphone access did not start. Check permission and try again.')), 30000);
        stream = await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
        clearTimeout(permissionTimer);
        if (finished) { stopTracks(); return; }
        recorder = new window.MediaRecorder(stream);
        recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        recorder.onerror = () => fail(new Error('Microphone recording failed. Try again or type your details.'));
        recorder.onstop = async () => {
          stopTracks();
          if (finished) return;
          try {
            const samples = await decode(new Blob(chunks, {type:recorder.mimeType}));
            if (finished) return;
            let energy = 0;
            for (const sample of samples) energy += sample * sample;
            if (samples.length < 5600 || Math.sqrt(energy / samples.length) < 0.001) throw new Error('No clear speech was recorded. Move closer to the microphone and try again.');
            const result = await transcribe(encodeWav(samples), mode || 'dictation', controller.signal);
            const text = result.text?.trim();
            if (finished) return;
            if (!text) throw new Error('No words were recognized. Try again or type your details.');
            if (/\b(?:inaudible|unintelligible)\b|\[(?:silence|blank_audio|no speech)\]/i.test(text)) {
              throw new Error('The recording was unclear. Check the microphone selected in your browser, use headphones during calls, and speak closer to the mic. No fields were changed.');
            }
            onText(text, result);
            finish();
          } catch (error) { fail(error); }
        };
        recorder.start();
        onStatus('Listening… select Done when finished.', 'recording');
        timer = setTimeout(cancel.stop, 20000);
      } catch (error) { fail(error); }
    })();
    return cancel;
  };
}

export const beginDictation = createDictation();

export function encodeWav(samples) {
  const count = Math.min(samples.length, 320000);
  const buffer = new ArrayBuffer(44 + count * 2), view = new DataView(buffer);
  const word = (offset, value) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  word(0, 'RIFF'); view.setUint32(4, 36 + count * 2, true); word(8, 'WAVE'); word(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  word(36, 'data'); view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++) { const value = Math.max(-1, Math.min(1, samples[i])); view.setInt16(44 + i * 2, value * (value < 0 ? 32768 : 32767), true); }
  let binary = '';
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

import { loadSpeechModel, transcribeAudio, cancelSpeechProcessing } from './whisperClient.js';

let active;
export const speechSupported = () => typeof window !== 'undefined' && window.isSecureContext
  && Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder && window.AudioContext && window.OfflineAudioContext && window.Worker);

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
export function createDictation({load = loadSpeechModel, transcribe = transcribeAudio, decode = decodeRecording,
  cancelProcessing = cancelSpeechProcessing, supported = speechSupported} = {}) {
  return function begin({onText, onError, onEnd, onStatus = () => {}, mode}) {
    active?.();
    let finished = false, processing = false, stream, recorder, timer, permissionTimer, modelLoaded = false;
    let preparationStatus = 'Preparing speech model… your recording is kept while it loads.';
    const downloads = new Map();
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
      onStatus(modelLoaded ? 'Transcribing on your device…' : preparationStatus, 'processing');
      recorder.stop();
      stopTracks();
    };
    active = cancel;
    if (!supported()) { fail(new Error('Local voice needs a supported browser on HTTPS or localhost. You can type instead.')); return cancel; }
    onStatus('Allow microphone access to begin.', 'loading');
    // Request the microphone in the click's activation window. A large model
    // download must not delay permission or silently discard speech spoken then.
    const modelReady = Promise.resolve().then(() => {
      if (finished) return false;
      return load(progress => {
        if (finished || modelLoaded) return;
        if (progress.status === 'progress' && Number.isFinite(progress.loaded)) {
          downloads.set(progress.file, progress.loaded);
          const megabytes = [...downloads.values()].reduce((sum, bytes) => sum + bytes, 0) / 1048576;
          preparationStatus = `Preparing speech model… ${megabytes.toFixed(1)} MB loaded. Your recording is kept.`;
        }
        if (processing) onStatus(preparationStatus, 'processing');
      });
    }).then(() => {
      if (finished) return false;
      modelLoaded = true;
      if (processing) onStatus('Transcribing on your device…', 'processing');
      return true;
    }).catch(error => { fail(error); return false; });
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
            if (!await modelReady || finished) return;
            const text = (await transcribe(samples)).trim();
            if (finished) return;
            if (!text) throw new Error('No words were recognized. Try again or type your details.');
            if (/\b(?:inaudible|unintelligible)\b|\[(?:silence|blank_audio|no speech)\]/i.test(text)) {
              throw new Error('The recording was unclear. Check the microphone selected in your browser, use headphones during calls, and speak closer to the mic. No fields were changed.');
            }
            onText(text, {text});
            finish();
          } catch (error) { fail(error); }
        };
        recorder.start();
        onStatus('Listening… select Done when finished.', 'recording');
        timer = setTimeout(cancel.stop, mode === 'donation' ? 90000 : 30000);
      } catch (error) { fail(error); }
    })();
    return cancel;
  };
}

export const beginDictation = createDictation();

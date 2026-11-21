let active;

const recognitionType = () => typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
export const speechSupported = () => typeof window !== 'undefined' && window.isSecureContext && Boolean(recognitionType());

export function beginDictation({onText, onError, onEnd, onStatus = () => {}, onPreview = () => {}, mode}) {
  active?.();
  if (!speechSupported()) {
    onError('Speech recognition is unavailable in this browser. Try Chrome or type your details.');
    onEnd();
    return () => {};
  }
  let recognition, finished = false, started = false, stopping = false, timer, deadline;
  let finalText = '';
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer); clearTimeout(deadline);
    if (active === cancel) active = null;
    if (recognition) {
      recognition.onstart = recognition.onresult = recognition.onerror = recognition.onend = null;
      try { recognition.abort(); } catch { /* Already ended. */ }
    }
    onEnd();
  };
  const fail = message => { if (!finished) { onError(message); finish(); } };
  const complete = () => {
    if (finished) return;
    if (!finalText) { fail('No words were recognized. Speak clearly and try again, or type your details.'); return; }
    try { onText(finalText, {text: finalText}); } finally { finish(); }
  };
  const cancel = () => {
    if (finished) return;
    onStatus('Voice input cancelled.', 'idle'); finish();
  };
  cancel.stop = () => {
    if (finished) return;
    if (!started) { cancel(); return; }
    if (stopping) return;
    stopping = true;
    clearTimeout(timer);
    onStatus('Finishing...', 'processing');
    deadline = setTimeout(() => {
      if (finalText) complete();
      else fail('Speech recognition took too long. Try again or type your details.');
    }, 3000);
    try { recognition.stop(); } catch { complete(); }
  };
  active = cancel;
  try {
    const Recognition = recognitionType();
    recognition = new Recognition();
    recognition.lang = 'en-IN';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      if (finished) return;
      started = true; clearTimeout(deadline);
      onStatus('Listening... select Done when finished.', 'recording');
      timer = setTimeout(() => cancel.stop(), mode === 'donation' ? 90000 : 30000);
    };
    recognition.onresult = event => {
      if (finished) return;
      // Each event carries the complete current result list. Rebuild instead
      // of appending revised or repeated interim results to earlier text.
      const parts = [], preview = [];
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (typeof result[0]?.transcript === 'string') preview.push(result[0].transcript.trim());
        if (result.isFinal && typeof result[0]?.transcript === 'string') parts.push(result[0].transcript.trim());
      }
      finalText = parts.filter(Boolean).join(' ').trim();
      onPreview(preview.filter(Boolean).join(' '));
    };
    recognition.onerror = event => {
      // Keep completed sentences if the service disconnects after recognizing
      // them. Never promote an unfinished hypothesis to a confirmed field.
      if (finalText && ['network', 'no-speech'].includes(event.error)) {
        complete();
        onError('Recording ended early. Recognized details were kept; review the transcript and add anything missing.');
        return;
      }
      const messages = {
        'not-allowed': 'Microphone access was blocked. Allow it in your browser or type instead.',
        'service-not-allowed': 'Your browser speech service is unavailable. Check browser settings or type instead.',
        'audio-capture': 'No microphone could be opened. Check its connection and browser permission.',
        'network': 'Your browser could not reach its speech service. Check your internet connection and try again.',
        'no-speech': 'No speech was detected. Speak clearly and try again.',
        'language-not-supported': 'This browser does not support the selected speech language. You can type instead.',
        'aborted': 'Voice input was interrupted. Please try again.',
      };
      fail(messages[event.error] || 'Speech recognition could not finish. Try again or type your details.');
    };
    recognition.onend = complete;
    onStatus('Allow microphone access to begin.', 'loading');
    deadline = setTimeout(() => fail('Microphone access did not start. Check browser permission and try again.'), 30000);
    recognition.start();
  } catch {
    fail('Speech recognition could not start. Check browser permission or type your details.');
  }
  return cancel;
}

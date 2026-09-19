// Direct test harness: records audio, posts it to the backend, shows the reply.
// This is not the VoiceController module (barge-in, priority speak queue, SSE
// push) yet, just enough to confirm the round trip works end to end.

const BACKEND_URL = `${location.protocol}//${location.hostname}:8000`;
const sessionId = crypto.randomUUID();

const talkButton = document.getElementById("talk") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLDivElement;
const transcriptEl = document.getElementById("transcript") as HTMLDivElement;
const logEl = document.getElementById("log") as HTMLDivElement;

let stream: MediaStream | null = null;
let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let audioUnlocked = false;
let recordingStartedAt = 0;
const MIN_HOLD_MS = 500;

function setStatus(text: string) {
  statusEl.textContent = text;
}

function addEntry(who: string, text: string, isError = false) {
  const el = document.createElement("div");
  el.className = "entry" + (isError ? " error" : "");
  el.innerHTML = `<div class="who">${who}</div><div>${text}</div>`;
  transcriptEl.appendChild(el);
  el.scrollIntoView({ behavior: "smooth", block: "end" });
}

function logLatency(ms: number, label: string) {
  const el = document.createElement("div");
  el.textContent = `${label}: ${ms.toFixed(0)}ms`;
  logEl.prepend(el);
}

function unlockAudio() {
  if (audioUnlocked) return;
  // Mobile browsers block the first speechSynthesis call unless it happens
  // inside a user gesture. Empty utterances are ignored by some engines, so
  // speak a real one at zero volume.
  const utter = new SpeechSynthesisUtterance("ready");
  utter.volume = 0;
  speechSynthesis.speak(utter);
  audioUnlocked = true;
}

function speak(text: string) {
  if (!("speechSynthesis" in window)) {
    addEntry("error", "This browser has no speechSynthesis", true);
    return;
  }
  const clean = text.replace(/[*_`#>]/g, "").replace(/\s+/g, " ").trim();
  // Chrome cuts off long utterances, so speak one sentence at a time.
  const sentences = clean.match(/[^.!?]+[.!?]*/g) ?? [clean];
  speechSynthesis.cancel();
  for (const sentence of sentences) {
    const utter = new SpeechSynthesisUtterance(sentence.trim());
    utter.onerror = (e) => {
      if (e.error !== "canceled" && e.error !== "interrupted") addEntry("error", `speech failed: ${e.error}`, true);
    };
    speechSynthesis.speak(utter);
  }
}

async function ensureStream(): Promise<MediaStream> {
  if (stream) return stream;
  stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  return stream;
}

function pickMimeType(): string {
  const candidates = ["audio/webm", "audio/mp4", "audio/ogg"];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return ""; // let the browser choose (Safari picks mp4 on its own)
}

async function startRecording() {
  unlockAudio();
  if (!stream) {
    // The permission prompt steals the press, so the first tap only grants the mic.
    try {
      await ensureStream();
      setStatus("mic ready, now hold the button and speak");
    } catch (err) {
      setStatus("mic access failed");
      addEntry("error", String(err), true);
    }
    return;
  }
  const mimeType = pickMimeType();
  recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  recorder.start();
  recordingStartedAt = performance.now();
  talkButton.classList.add("recording");
  talkButton.textContent = "Recording...";
  setStatus("listening");
}

async function finishRecording() {
  talkButton.classList.remove("recording");
  talkButton.textContent = "Hold to talk";
  if (!recorder || recorder.state !== "recording") return;
  const heldMs = performance.now() - recordingStartedAt;
  const blob = await stopRecording();
  if (!blob || heldMs < MIN_HOLD_MS) {
    setStatus("too short, keep holding while you speak");
    return;
  }
  await sendAudio(blob);
}

function stopRecording(): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (!recorder || recorder.state === "inactive") {
      resolve(null);
      return;
    }
    recorder.onstop = () => {
      const mimeType = recorder?.mimeType || "audio/webm";
      resolve(chunks.length ? new Blob(chunks, { type: mimeType }) : null);
    };
    recorder.stop();
  });
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("wav")) return "wav";
  return "webm";
}

async function sendAudio(blob: Blob) {
  addEntry("you", `(${(blob.size / 1024).toFixed(1)} KB audio, ${blob.type || "unknown type"})`);
  setStatus("sending...");
  const form = new FormData();
  form.append("audio", blob, `clip.${extensionFor(blob.type)}`);
  form.append("session_id", sessionId);

  const started = performance.now();
  try {
    const response = await fetch(`${BACKEND_URL}/api/voice`, { method: "POST", body: form });
    const elapsed = performance.now() - started;
    logLatency(elapsed, "round trip");
    const data = await response.json();
    if (!response.ok) {
      addEntry("error", data.detail || JSON.stringify(data), true);
      setStatus("error, see log above");
      return;
    }
    addEntry("chef", data.text || "(empty response)");
    setStatus("hold the button to talk");
    if (data.text) speak(data.text);
  } catch (err) {
    logLatency(performance.now() - started, "round trip (failed)");
    addEntry("error", String(err), true);
    setStatus("request failed, see log above");
  }
}

talkButton.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  startRecording();
});

talkButton.addEventListener("pointerup", finishRecording);
talkButton.addEventListener("pointerleave", finishRecording);

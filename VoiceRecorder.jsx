import { useEffect, useRef, useState } from 'react';
import { Mic, Square, X } from 'lucide-react';
export default function VoiceRecorder({ onRecorded, onError, disabled }) {
  const recorder = useRef(null), stream = useRef(null), chunks = useRef([]), timer = useRef(null), mounted = useRef(true), cancelled = useRef(false);
  const [recording, setRecording] = useState(false), [seconds, setSeconds] = useState(0), [starting, setStarting] = useState(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; cancelled.current = true; clearInterval(timer.current); if (recorder.current?.state === 'recording') recorder.current.stop(); stream.current?.getTracks().forEach(t => t.stop()); }; }, []);
  function stop(cancel = false) { cancelled.current = cancel; if (recorder.current?.state === 'recording') recorder.current.stop(); stream.current?.getTracks().forEach(t => t.stop()); clearInterval(timer.current); setRecording(false); }
  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return onError('Voice recording is unavailable here. Use HTTPS or localhost in a supported browser, or attach an audio file.');
    setStarting(true);
    try {
      const activeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) { activeStream.getTracks().forEach(t => t.stop()); return; }
      stream.current = activeStream; cancelled.current = false; chunks.current = [];
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
      recorder.current = new MediaRecorder(activeStream, mimeType ? { mimeType } : {});
      recorder.current.ondataavailable = event => { if (event.data.size) chunks.current.push(event.data); };
      recorder.current.onstop = () => {
        activeStream.getTracks().forEach(t => t.stop()); clearInterval(timer.current);
        if (!mounted.current || cancelled.current) return;
        const type = recorder.current.mimeType || 'audio/webm';
        const blob = new Blob(chunks.current, { type });
        if (blob.size) onRecorded(new File([blob], `voice.${type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm'}`, { type }));
        setRecording(false);
      };
      recorder.current.onerror = () => { stop(true); onError('Recording stopped unexpectedly. Please try again.'); };
      recorder.current.start(250); setRecording(true); setSeconds(0);
      const began = Date.now();
      timer.current = setInterval(() => { const elapsed = Math.floor((Date.now() - began) / 1000); setSeconds(elapsed); if (elapsed >= 60) stop(); }, 250);
    } catch { stream.current?.getTracks().forEach(t => t.stop()); onError('Microphone access was unavailable. Check your browser permission or attach an audio file.'); }
    finally { if (mounted.current) setStarting(false); }
  }
  return recording ? <div className="recording-controls"><span className="record-dot"/><span>{seconds}s / 60s</span><button className="icon-button" type="button" onClick={() => stop()} aria-label="Stop recording and preview"><Square size={17}/></button><button className="icon-button" type="button" onClick={() => stop(true)} aria-label="Cancel recording"><X size={17}/></button></div> : <button className="icon-button" type="button" onClick={start} disabled={disabled || starting} aria-label="Record a voice message" title="Record a voice message"><Mic size={21}/></button>;
}

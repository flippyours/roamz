"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Check, CheckCheck, Compass, Flag, Footprints, HelpCircle, LoaderCircle, LockKeyhole, MapPin, MessageCircle, Pause, Play, Repeat2, RotateCcw, ShieldCheck, Sparkles, UserPlus, Volume2, VolumeX, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import type { GameSnapshot, RoamzGame } from "@/lib/roamz-game";
import { GATE, SIGNALS, normalizeEntry } from "@/lib/route-rules";

type Mode = "intro" | "starting" | "playing" | "finishing" | "complete";
type RouteEvent = { event: "signal" | "finish"; index?: number };
// Replace this dummy post ID when the WL announcement is live.
const X_PROFILE_URL = "https://x.com/roamznft";
const ANNOUNCEMENT_URL = "https://x.com/roamznft";
const initialSnapshot: GameSnapshot = { count: 0, seconds: 0, dash: 1, next: "The first step", distance: 6, heading: 0, x: 0, z: 7 };
const time = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;

export default function RoamzExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const game = useRef<RoamzGame | null>(null);
  const [ready, setReady] = useState(false);
  const [webglError, setWebglError] = useState(false);
  const [mode, setMode] = useState<Mode>("intro");
  const [state, setState] = useState(initialSnapshot);
  const [sound, setSound] = useState(false);
  const [paused, setPaused] = useState(false);
  const [help, setHelp] = useState(false);
  const [claim, setClaim] = useState(false);
  const [formStep, setFormStep] = useState<"pass" | "tasks" | "form" | "success">("pass");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [savedCount, setSavedCount] = useState(0);
  const [hasPass, setHasPass] = useState(false);
  const [resultTime, setResultTime] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [fields, setFields] = useState({ x_handle: "", wallet_address: "", comment_url: "", company: "" });
  const [formError, setFormError] = useState("");
  const [invalidField, setInvalidField] = useState("");
  const [sending, setSending] = useState(false);
  const [entryId, setEntryId] = useState("");
  const [consent, setConsent] = useState(false);
  const [socialTasks, setSocialTasks] = useState([false, false, false]);
  const [joystick, setJoystick] = useState({ x: 0, y: 0 });
  const joyPointer = useRef<number | null>(null);
  const events = useRef<RouteEvent[]>([]);
  const busy = useRef(false);
  const alive = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const runSeconds = useRef(0);

  const toast = useCallback((message: string) => {
    setNotice(message); if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setNotice(""), 3500);
  }, []);

  const flush = useCallback(async () => {
    if (busy.current) return;
    busy.current = true; setSyncing(true); setError("");
    try {
      while (events.current.length && alive.current) {
        const event = events.current[0];
        const response = await fetch("/api/route", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event) });
        const body = await response.json();
        if (!response.ok) {
          if (response.status === 425 && body.retry_after_ms) { await new Promise(resolve => setTimeout(resolve, Math.min(body.retry_after_ms + 100, 15000))); continue; }
          throw new Error(body.error || "Your signal could not be saved. Try again.");
        }
        events.current.shift(); setSavedCount(body.collected ?? 5);
        if (event.event === "finish") {
          setHasPass(true); setMode("complete"); setResultTime(runSeconds.current); setFormStep("pass"); setClaim(true);
        }
      }
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "Connection interrupted. Your progress is still here—retry saving it."); }
    finally { busy.current = false; if (alive.current) setSyncing(false); }
  }, []);

  useEffect(() => {
    alive.current = true; let cancelled = false;
    import("@/lib/roamz-game").then(({ createRoamzGame }) => {
      if (cancelled || !canvasRef.current) return;
      try {
        game.current = createRoamzGame(canvasRef.current, {
          onReady: () => setReady(true), onError: () => setWebglError(true), onUpdate: setState,
          onHint: toast,
          onSignal: index => { toast(index === 4 ? "All five signals found. Find the arch!" : `${index + 1} of 5 · ${SIGNALS[index].name}`); events.current.push({ event: "signal", index }); void flush(); },
          onFinish: seconds => { runSeconds.current = seconds; setMode("finishing"); events.current.push({ event: "finish" }); void flush(); },
        });
      } catch { setWebglError(true); }
    }).catch(() => setWebglError(true));
    fetch("/api/route", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(data => {
      if (cancelled || !data) return;
      setSavedCount(data.submitted ? 0 : data.collected ?? 0); setHasPass(Boolean(data.completed && !data.submitted));
      if (data.duration) setResultTime(data.duration);
    }).catch(() => {});
    return () => { cancelled = true; alive.current = false; game.current?.destroy(); game.current = null; if (timerRef.current) clearTimeout(timerRef.current); if (countdownTimer.current) clearInterval(countdownTimer.current); };
  }, [flush, toast]);

  useEffect(() => { game.current?.setPaused(paused || help || claim); }, [paused, help, claim]);
  useEffect(() => {
    const visibility = () => { if (document.hidden && mode === "playing") setPaused(true); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && mode === "playing" && !help && !claim) { e.preventDefault(); setPaused(p => !p); } };
    document.addEventListener("visibilitychange", visibility); window.addEventListener("keydown", key);
    return () => { document.removeEventListener("visibilitychange", visibility); window.removeEventListener("keydown", key); };
  }, [mode, help, claim]);

  async function start() {
    if (!ready || mode === "starting") return;
    if (hasPass) { setFormStep("pass"); setClaim(true); return; }
    setMode("starting"); setError("");
    try {
      const response = await fetch("/api/route", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "start" }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not start your route. Please try again.");
      if (data.completed && !data.submitted) { setHasPass(true); setMode("complete"); setClaim(true); return; }
      events.current = []; setSavedCount(data.collected ?? 0); setPaused(false);
      stageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      setCountdown(3); let count = 3;
      countdownTimer.current = setInterval(() => {
        count--; setCountdown(count);
        if (count === 0) { if (countdownTimer.current) clearInterval(countdownTimer.current); setMode("playing"); game.current?.start(data.collected ?? 0); canvasRef.current?.focus({ preventScroll: true }); }
      }, 650);
    } catch (e) { setMode("intro"); setError(e instanceof Error ? e.message : "Connection interrupted. Please try again."); }
  }

  function moveJoy(e: React.PointerEvent<HTMLDivElement>) {
    if (joyPointer.current !== e.pointerId) return;
    const rect = e.currentTarget.getBoundingClientRect(), dx = e.clientX - rect.left - rect.width / 2, dy = e.clientY - rect.top - rect.height / 2;
    const length = Math.hypot(dx, dy), scale = length > 34 ? 34 / length : 1;
    setJoystick({ x: dx * scale, y: dy * scale }); game.current?.setJoystick(dx * scale / 34, dy * scale / 34);
  }
  function endJoy() { joyPointer.current = null; setJoystick({ x: 0, y: 0 }); game.current?.setJoystick(0, 0); }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setFormError(""); setInvalidField("");
    if (!socialTasks.every(Boolean)) { setFormError("COMPLETE AND CONFIRM ALL THREE X TASKS FIRST."); setFormStep("tasks"); return; }
    const parsed = normalizeEntry(fields);
    if (parsed.error) { setFormError(parsed.error); setInvalidField(parsed.field!); document.getElementById(parsed.field!)?.focus(); return; }
    if (!consent) { setFormError("Please acknowledge how your details will be used."); return; }
    setSending(true);
    try {
      const response = await fetch("/api/whitelist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...parsed.value, company: fields.company, consent: true, social_tasks_complete: true }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Your entry could not be saved. Please try again.");
      setEntryId(body.entry_id); setFormStep("success"); setHasPass(false); setSavedCount(0);
    } catch (e) { setFormError(e instanceof Error ? e.message : "Connection interrupted. Your form has not been cleared—please retry."); }
    finally { setSending(false); }
  }

  const active = mode === "playing" || mode === "finishing";
  return (
    <main className={`roamz-app ${active ? "in-route" : ""}`}>
      <header className="site-header">
        <a href="/" className="wordmark" aria-label="ROAMZ HOME">ROAMZ<span>®</span></a>
        <span className="header-tag">NO FIXED DESTINATION.</span>
        <div className="edition"><span>THE COLLECTION</span><strong>1,111</strong></div>
      </header>

      <div className="experience">
        <aside className="route-panel">
          <div className="eyebrow"><span className="tiny-cross">✳</span> THE LOST ROUTE <span className="edition-number">/ 001</span></div>
          <h1>ENTER THE<br /><span>LOST ROUTE.</span></h1>
          <p className="intro-copy">RESTORE THE SIGNAL. REACH GATE 404.<br />EARN ACCESS TO THE WL FORM.</p>

          <div className="mission-card">
            <div className="mission-heading"><Compass size={18} /><span>ROUTE OBJECTIVES</span><span className="mission-time">~1 MIN</span></div>
            <ol className="mission-list">
              <li className={state.count > 0 || hasPass ? "done" : "current"}><span>{state.count === 5 || hasPass ? <Check size={16} /> : "01"}</span><div><strong>RESTORE 5 SIGNALS</strong><small>FOLLOW THE COMPASS ACROSS THE ISLAND.</small></div></li>
              <li className={hasPass ? "done" : state.count === 5 ? "current" : ""}><span>{hasPass ? <Check size={16} /> : "02"}</span><div><strong>REACH GATE 404</strong><small>THE GATE OPENS AFTER THE FINAL SIGNAL.</small></div></li>
              <li className={hasPass ? "current" : ""}><span>03</span><div><strong>COMPLETE X TASKS</strong><small>FOLLOW, LIKE, REPOST AND REPLY.</small></div></li>
              <li><span>04</span><div><strong>SUBMIT EVM ADDRESS</strong><small>ONE APPLICATION PER WANDERER.</small></div></li>
            </ol>
          </div>

          {!active ? <button className="primary-button start-button" onClick={start} disabled={!ready || webglError || mode === "starting"}>
            {mode === "starting" || !ready ? <LoaderCircle className="spin" size={19} /> : hasPass ? <CheckCheck size={20} /> : <Footprints size={20} />}
            <span>{!ready ? "LOADING THE ROUTE…" : mode === "starting" ? "ENTERING THE ROUTE…" : hasPass ? "OPEN ROUTE PASS" : savedCount > 0 ? "CONTINUE ROUTE" : "ENTER THE LOST ROUTE"}</span><ArrowRight size={21} />
          </button> : <div className="side-progress"><div><span>SIGNALS RESTORED</span><strong>{state.count}<em>/ 5</em></strong></div><div className="signal-slots" aria-label={`${state.count} OF 5 SIGNALS FOUND`}>{SIGNALS.map((_, i) => <span key={i} className={i < state.count ? "found" : ""}><Sparkles size={18} /></span>)}</div><p>{state.count === 5 ? "RETURN TO GATE 404." : "FOLLOW THE COMPASS TO THE NEXT SIGNAL."}</p></div>}

          <p className="start-note"><LockKeyhole size={12} /> NO WALLET CONNECTION. NO SIGNATURE.</p>
          <div className="collection-strip">
            <div className="art-stack"><div className="nft-crop art-one"><img src="/roamz-artwork.png" alt="Roamz artwork: black oval head, white eyes, yellow bucket and tactical vest" /></div><div className="nft-crop art-two"><img src="/roamz-explorer.png" alt="Roamz artwork: explorer bucket, cyan tech jacket and rear bone frame" /></div></div>
            <div><span className="collection-label">1,111 WANDERERS.<br />NO FIXED DESTINATION.</span><small>BUILT FOR ROBINHOOD CHAIN.</small></div>
          </div>
        </aside>

        <section className={`game-stage ${active ? "is-playing" : ""}`} ref={stageRef} aria-label="The Lost Route 3D minigame">
          <canvas ref={canvasRef} className="game-canvas" tabIndex={0} aria-label="Roamz game. Use WASD or arrow keys to move. Space to dash. Escape to pause." />
          <div className="stage-grain" aria-hidden="true" />
          <div className="stage-top">
            <div className="place-label"><MapPin size={17} /><div><strong>FOREST CLEARING</strong><span>ROUTE SECTOR 001</span></div></div>
            <div className="stage-tools">
              <button className="icon-button" aria-label={sound ? "Mute sound" : "Enable sound"} aria-pressed={sound} onClick={() => { const next = !sound; setSound(next); game.current?.setSound(next); }}>{sound ? <Volume2 size={19} /> : <VolumeX size={19} />}</button>
              <button className="icon-button" aria-label="How to play" onClick={() => setHelp(true)}><HelpCircle size={19} /></button>
              {active && <button className="icon-button" aria-label={paused ? "Resume game" : "Pause game"} onClick={() => setPaused(p => !p)}>{paused ? <Play size={19} /> : <Pause size={19} />}</button>}
            </div>
          </div>

          {!ready && !webglError && <div className="stage-loading"><Compass className="spin-slow" size={36} /><span>LOADING ROUTE 001…</span></div>}
          {webglError && <div className="stage-loading error-loading"><Compass size={34} /><strong>This route needs WebGL.</strong><p>Try a recent browser with hardware acceleration enabled.</p><button className="secondary-button" onClick={() => location.reload()}>Try again <RotateCcw size={16} /></button></div>}
          {countdown > 0 && <div className="countdown" role="status" key={countdown}><span>{countdown}</span><small>OFF WE GO</small></div>}

          {active && <>
            <div className="game-hud"><div className="signal-counter"><Sparkles size={18} /><strong>{state.count}<span> / 5</span></strong></div><div className="run-clock">{time(state.seconds)}</div></div>
            <div className="mini-map" aria-label="Map showing your location, five signals and Gate 404">
              <svg viewBox="0 0 120 110" role="img"><title>Route map</title><ellipse cx="60" cy="55" rx="52" ry="45" fill="#73846a" opacity=".4" /><path d="M60 83 L36 71 L28 43 L56 27 L88 39 L88 71 L60 48" fill="none" stroke="#d4dfbc" strokeWidth="1.5" strokeDasharray="3 4" opacity=".5" />{SIGNALS.map((s, i) => <circle key={i} cx={60 + s.x * 4} cy={55 + s.z * 4} r={i === state.count ? 4 : 2.5} fill={i < state.count ? "#53674f" : i === state.count ? "#d2fb89" : "#a2b78f"} />)}<rect x={60 + GATE.x * 4 - 3} y={55 + GATE.z * 4 - 3} width="6" height="6" fill={state.count === 5 ? "#d2fb89" : "none"} stroke="#d2fb89" /><circle cx={60 + state.x * 4} cy={55 + state.z * 4} r="3.5" fill="#fff8de" stroke="#253629" strokeWidth="1.5" /></svg>
              <span>YOU ARE SOMEWHERE</span>
            </div>
            <div className="direction-pill"><ArrowUpRight size={18} style={{ transform: `rotate(${state.heading - 45}deg)` }} /><span>{state.count === 5 ? "GATE 404" : `SIGNAL 0${state.count + 1}`}</span><span className="direction-distance">{state.distance}m</span></div>
            <div className="mobile-controls">
              <div className="joystick" role="group" aria-label="Touch joystick: drag to move" onPointerDown={e => { if (joyPointer.current !== null) return; e.preventDefault(); joyPointer.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); moveJoy(e); }} onPointerMove={moveJoy} onPointerUp={endJoy} onPointerCancel={endJoy} onLostPointerCapture={endJoy}>
                <div className="joystick-cross" /><span className="joystick-thumb" style={{ transform: `translate(${joystick.x}px, ${joystick.y}px)` }} /><small>MOVE</small>
              </div>
              <button className="dash-button" aria-label="Dash" disabled={state.dash < .99 || paused} onPointerDown={e => { e.preventDefault(); game.current?.dash(); }} onClick={e => { if (e.detail === 0) game.current?.dash(); }}><Zap size={25} /><span>{state.dash >= .99 ? "DASH" : "…"}</span></button>
            </div>
          </>}

          {notice && active && <div className="game-toast" role="status"><Sparkles size={17} />{notice}</div>}
          {paused && active && <div className="pause-screen"><span className="eyebrow">ROUTE PAUSED</span><h2>SIGNAL HOLD.</h2><p>YOUR PROGRESS IS SAFE.</p><button className="primary-button" onClick={() => { setPaused(false); canvasRef.current?.focus(); }}><Play size={18} />CONTINUE ROUTE</button></div>}
          {mode === "finishing" && !error && <div className="saving-pass"><LoaderCircle className="spin" size={18} />Saving your route pass…</div>}
          {error && <div className="connection-error" role="alert"><span>{error}</span><button onClick={() => events.current.length ? void flush() : void start()} disabled={syncing}>{syncing ? "Saving…" : "Retry"}</button></div>}

          <div className="stage-bottom">
            <div className="stage-caption"><span className="caption-cross">+</span><span>{active ? "A DETOUR IS STILL A DIRECTION." : "NO MAP. NO PROMISES. KEEP ROAMING."}</span></div>
            {!active && <span className="stage-stamp">ROAMZ<br /><strong>EXPEDITION 001</strong></span>}
            {active && <div className="desktop-controls"><span><kbd>W A S D</kbd> move</span><span><kbd>SPACE</kbd> dash</span></div>}
          </div>
          {!active && ready && !webglError && <button className="mobile-start primary-button" onClick={start} disabled={mode === "starting"}><Footprints size={19} />{hasPass ? "OPEN ROUTE PASS" : mode === "starting" ? "ENTERING…" : "START ROUTE"}<ArrowRight size={19} /></button>}
        </section>
      </div>

      <footer className="site-footer"><span>© ROAMZ <span className="footer-separator">/</span> ROBINHOOD CHAIN <span className="footer-separator">/</span> 1,111 WANDERERS.</span><button onClick={() => setHelp(true)}>HOW TO PLAY <ArrowUpRight size={14} /></button></footer>

      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="roamz-dialog help-dialog">
          <span className="eyebrow">ROUTE GUIDE</span><DialogTitle>HOW TO PLAY.</DialogTitle><DialogDescription>RESTORE FIVE SIGNALS IN ORDER. FOLLOW THE COMPASS, THEN RETURN TO GATE 404.</DialogDescription>
          <div className="help-steps"><div><Footprints /><strong>WASD / ARROW KEYS</strong><p>MOVE ACROSS THE ISLAND. ON DESKTOP, YOU CAN ALSO CLICK A DESTINATION.</p></div><div><Zap /><strong>SPACE / SHIFT TO DASH</strong><p>USE A SHORT SPEED BURST TO PASS THROUGH THE PINK STATIC.</p></div><div><Compass /><strong>FOLLOW THE SIGNAL</strong><p>THE COMPASS AND MINI-MAP POINT TO THE NEXT OBJECTIVE. THERE IS NO TIME LIMIT.</p></div></div>
          <p className="help-mobile">MOBILE: USE THE LEFT JOYSTICK TO MOVE AND THE RIGHT BUTTON TO DASH.</p>
          <p className="privacy-note">COMPLETING THE ROUTE UNLOCKS AN APPLICATION, NOT A GUARANTEED WL SPOT.</p>
          <button className="primary-button" onClick={() => setHelp(false)}>ENTER THE ROUTE <ArrowRight size={18} /></button>
        </DialogContent>
      </Dialog>

      <Dialog open={claim} onOpenChange={v => { if (!sending) setClaim(v); }}>
        <DialogContent className="roamz-dialog claim-dialog">
          {formStep === "pass" && <>
            <div className="pass-icon"><Flag size={31} /></div><span className="eyebrow">WL ACCESS 01 / 03</span><DialogTitle>ROUTE COMPLETE.</DialogTitle><DialogDescription>GATE 404 IS OPEN. COMPLETE THE X TASKS TO UNLOCK THE WL FORM.</DialogDescription>
            <div className="route-ticket"><div><span>ROUTE PASS</span><Compass size={22} /></div><strong>THE LOST ROUTE</strong><div className="ticket-stats"><div><small>SIGNALS</small><b>05 / 05</b></div><div><small>YOUR TIME</small><b>{time(resultTime)}</b></div><div><small>DESTINATION</small><b>UNKNOWN</b></div></div><div className="ticket-footer"><CheckCheck size={16} /> JOURNEY RECORDED <span>GATE 404</span></div></div>
            <button className="primary-button" onClick={() => setFormStep("tasks")}>CONTINUE TO X TASKS <ArrowRight size={19} /></button><p className="privacy-note">NO WALLET CONNECTION OR TRANSACTION REQUIRED.</p>
          </>}
          {formStep === "tasks" && <>
            <span className="eyebrow"><ShieldCheck size={15} /> WL ACCESS 02 / 03</span><DialogTitle>COMPLETE X TASKS.</DialogTitle><DialogDescription>OPEN EACH TASK, COMPLETE IT ON X, THEN CONFIRM IT BELOW.</DialogDescription>
            <div className="social-tasks">
              {[
                { icon: <UserPlus />, title: "FOLLOW @ROAMZNFT", text: "FOLLOW THE OFFICIAL ROAMZ ACCOUNT.", url: X_PROFILE_URL },
                { icon: <Repeat2 />, title: "LIKE + REPOST", text: "BOOST THE WL ANNOUNCEMENT POST.", url: ANNOUNCEMENT_URL },
                { icon: <MessageCircle />, title: "REPLY TO THE POST", text: "DROP YOUR SIGNAL ON THE ANNOUNCEMENT.", url: ANNOUNCEMENT_URL },
              ].map((task, index) => <div className={`social-task ${socialTasks[index] ? "task-done" : ""}`} key={task.title}>
                <div className="task-icon">{task.icon}</div><div className="task-copy"><strong>{task.title}</strong><span>{task.text}</span></div>
                <a className="task-open" href={task.url} target="_blank" rel="noopener noreferrer" aria-label={`OPEN ${task.title} ON X`}>OPEN <ArrowUpRight size={15} /></a>
                <label className="task-confirm" htmlFor={`task-${index}`}><Checkbox id={`task-${index}`} checked={socialTasks[index]} onCheckedChange={value => setSocialTasks(current => current.map((item, i) => i === index ? value === true : item))} /><span>{socialTasks[index] ? "CONFIRMED" : "MARK DONE"}</span></label>
              </div>)}
            </div>
            <button className="primary-button" disabled={!socialTasks.every(Boolean)} onClick={() => { setFormError(""); setFormStep("form"); }}>UNLOCK WL FORM <ArrowRight size={19} /></button>
            <p className="privacy-note">TASKS ARE SELF-CONFIRMED. X LINKS OPEN IN A NEW TAB.</p>
          </>}
          {formStep === "form" && <>
            <span className="eyebrow"><ShieldCheck size={15} /> WL ACCESS 03 / 03</span><DialogTitle>SUBMIT YOUR ADDRESS.</DialogTitle><DialogDescription>ENTER YOUR X HANDLE, EVM ADDRESS AND REPLY LINK FOR WL REVIEW.</DialogDescription>
            <form onSubmit={submit} className="wl-form" noValidate>
              <label htmlFor="x_handle">X handle<div className="input-wrap"><span>@</span><input id="x_handle" name="x_handle" autoComplete="username" placeholder="yourhandle" maxLength={16} value={fields.x_handle} aria-invalid={invalidField === "x_handle"} aria-describedby={invalidField === "x_handle" ? "form-error" : undefined} onChange={e => { setFields({ ...fields, x_handle: e.target.value }); setInvalidField(""); }} /></div></label>
              <label htmlFor="wallet_address">EVM wallet address<input id="wallet_address" name="wallet_address" autoComplete="off" spellCheck={false} placeholder="0x…" maxLength={42} value={fields.wallet_address} aria-invalid={invalidField === "wallet_address"} aria-describedby={invalidField === "wallet_address" ? "form-error" : "wallet-help"} onChange={e => { setFields({ ...fields, wallet_address: e.target.value }); setInvalidField(""); }} /><small id="wallet-help">Only your public address. Never your seed phrase.</small></label>
              <label htmlFor="comment_url">Your X post / reply link<input id="comment_url" name="comment_url" type="url" inputMode="url" autoComplete="url" spellCheck={false} placeholder="https://x.com/yourhandle/status/…" maxLength={300} value={fields.comment_url} aria-invalid={invalidField === "comment_url"} aria-describedby={invalidField === "comment_url" ? "form-error" : "reply-help"} onChange={e => { setFields({ ...fields, comment_url: e.target.value }); setInvalidField(""); }} /><small id="reply-help">Use a post or reply from the same X account.</small></label>
              <div className="honeypot" aria-hidden="true"><label>Company<input name="company" tabIndex={-1} autoComplete="off" value={fields.company} onChange={e => setFields({ ...fields, company: e.target.value })} /></label></div>
              <label className="consent-label" htmlFor="consent"><Checkbox id="consent" checked={consent} onCheckedChange={v => setConsent(v === true)} /><span>I agree that Roamz may store these details to review my application. This is not a guaranteed spot.</span></label>
              {formError && <p id="form-error" className="form-error" role="alert">{formError}</p>}
              <button type="submit" className="primary-button" disabled={sending}>{sending ? <LoaderCircle className="spin" size={19} /> : <ArrowUpRight size={19} />}{sending ? "Sending your signal…" : "Send my application"}</button>
            </form>
          </>}
          {formStep === "success" && <><div className="pass-icon"><CheckCheck size={34} /></div><span className="eyebrow">APPLICATION RECEIVED</span><DialogTitle>SIGNAL SUBMITTED.</DialogTitle><DialogDescription>YOUR APPLICATION IS PENDING REVIEW. FOLLOW @ROAMZNFT FOR WL UPDATES.</DialogDescription><div className="submission-receipt"><span>REFERENCE</span><strong>{entryId}</strong><span className="review-status">PENDING REVIEW</span></div><button className="primary-button" onClick={() => setClaim(false)}>RETURN TO ROAMZ <Check size={18} /></button></>}
        </DialogContent>
      </Dialog>
    </main>
  );
}

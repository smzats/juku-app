'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Orbitron } from 'next/font/google';

const orbitron = Orbitron({
  weight: '700',
  subsets: ['latin'],
  display: 'swap',
});

const IS_TEST_MODE = false;

const TICK_SECONDS = 300;
const MAX_MINUTES = 180;
const MIN_MINUTES = 5;
const STEP_MINUTES = 5;
const RING_RADIUS = 84;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const PINCH_SECONDS = 600;

const RING_BOX = {
  left: '7.231%',
  top: '25.943%',
  width: '85.538%',
  height: '48.115%',
} as const;

type CyberTimeAttackProps = {
  running: boolean;
  startedAt: number | null;
  targetMin: number;
  onTargetMin: (minutes: number) => void;
  onStart: (minutes: number) => void;
  onTimeUp: (minutes: number) => void;
  onPause: () => void;
  onSaveElapsed: (seconds: number) => void;
  onBack: () => void;
};

function clampTarget(minutes: number): number {
  const stepped = Math.round(minutes / STEP_MINUTES) * STEP_MINUTES;
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, stepped));
}

function studySeconds(startedAt: number | null, now = Date.now()): number {
  if (!startedAt) return 0;
  const realSeconds = Math.max(0, (now - startedAt) / 1000);
  return IS_TEST_MODE ? realSeconds * 60 : realSeconds;
}

function dashForTicks(lit: number, skip: number): { array: string; offset: number } {
  if (lit <= 0) return { array: `0 ${RING_CIRCUMFERENCE}`, offset: 0 };
  const marks = Array.from({ length: lit }, () => '3 8.0').join(' ');
  const consumed = lit * 11;
  const rest = Math.max(0, RING_CIRCUMFERENCE - consumed);
  return { array: `${marks} 0 ${rest}`, offset: skip * 11 };
}

function formatRemain(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function playFanfare() {
  const audio = new Audio('/audio/fanfare.mp3');
  audio.volume = 0.7;
  void audio.play().catch(() => {});
}

export default function CyberTimeAttack({
  running,
  startedAt,
  targetMin,
  onTargetMin,
  onStart,
  onTimeUp,
  onPause,
  onSaveElapsed,
  onBack,
}: CyberTimeAttackProps) {
  const target = clampTarget(targetMin);
  const targetSec = target * 60;
  const [remainSec, setRemainSec] = useState(targetSec);
  const [timeUpOpen, setTimeUpOpen] = useState(false);
  const [abortOpen, setAbortOpen] = useState(false);
  const [abortElapsed, setAbortElapsed] = useState(0);
  const finishedRef = useRef(false);
  const onTimeUpRef = useRef(onTimeUp);
  onTimeUpRef.current = onTimeUp;

  useEffect(() => {
    if (!running || !startedAt) {
      finishedRef.current = false;
      setRemainSec(targetSec);
      return;
    }
    const tick = () => {
      const spent = studySeconds(startedAt);
      const left = Math.max(0, targetSec - spent);
      setRemainSec(left);
      if (left <= 0 && !finishedRef.current) {
        finishedRef.current = true;
        setTimeUpOpen(true);
        playFanfare();
        onTimeUpRef.current(target);
      }
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [running, startedAt, target, targetSec]);

  const shown = running ? remainSec : targetSec;
  const totalTicks = target / STEP_MINUTES;
  const lit = shown <= 0 ? 0 : Math.min(totalTicks, Math.ceil(shown / TICK_SECONDS));
  const skip = Math.max(0, totalTicks - lit);
  const dash = dashForTicks(lit, skip);
  const pinch = running && shown > 0 && shown <= PINCH_SECONDS;
  const stroke = pinch ? '#ff0055' : '#00e5ff';
  const glow = pinch
    ? 'drop-shadow(0 0 4px #ff0055) drop-shadow(0 0 12px #ff0055)'
    : 'drop-shadow(0 0 4px #00e5ff) drop-shadow(0 0 10px #00e5ff)';

  const handleAbort = () => {
    const spent = Math.min(targetSec, Math.floor(studySeconds(startedAt)));
    setAbortElapsed(spent);
    onPause();
    setAbortOpen(true);
  };

  return (
    <div className="mx-auto mt-2 w-full max-w-[280px]">
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: '1 / 1' }}>
        <div
          className="absolute left-0 w-full"
          style={{ aspectRatio: '1080 / 1920', top: '50%', transform: 'translateY(-50%)', containerType: 'inline-size' }}
        >
          <img
            src="/images/bg-timer.png"
            alt=""
            width={1080}
            height={1920}
            className="absolute inset-0 h-full w-full"
          />
          <svg viewBox="0 0 200 200" className="absolute overflow-visible" style={RING_BOX} aria-hidden="true">
            <g transform="rotate(-90 100 100)">
              <circle
                cx="100"
                cy="100"
                r={RING_RADIUS}
                fill="none"
                stroke="rgba(0, 212, 255, 0.1)"
                strokeWidth="6"
                strokeDasharray="3 8.0"
              />
              <circle
                cx="100"
                cy="100"
                r={RING_RADIUS}
                fill="none"
                stroke={stroke}
                strokeWidth="6"
                strokeDasharray={dash.array}
                strokeDashoffset={dash.offset}
                style={{ filter: glow }}
              />
            </g>
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            {!running ? (
              <>
                <p
                  className={`${orbitron.className} leading-none`}
                  style={{
                    fontSize: 'clamp(1.4rem, 10cqi, 2.2rem)',
                    color: '#00e5ff',
                    textShadow: '0 0 8px #00e5ff, 0 0 16px rgba(0, 229, 255, 0.85)',
                  }}
                >
                  {target}
                </p>
                <p
                  className={`${orbitron.className} mt-1 tracking-[0.22em]`}
                  style={{ fontSize: 'clamp(0.5rem, 2.8cqi, 0.75rem)', color: 'rgba(0, 229, 255, 0.85)' }}
                >
                  MINS
                </p>
              </>
            ) : (
              <>
                <p
                  className={`${orbitron.className} leading-none tracking-wider`}
                  style={{
                    fontSize: 'clamp(1.1rem, 8cqi, 1.8rem)',
                    color: stroke,
                    textShadow: pinch ? '0 0 8px #ff0055, 0 0 16px #ff0055' : '0 0 8px #00e5ff, 0 0 16px rgba(0, 229, 255, 0.85)',
                    animation: pinch ? 'cyber-pinch 0.8s steps(2, end) infinite' : undefined,
                  }}
                >
                  {formatRemain(shown)}
                </p>
                <p
                  className={`${orbitron.className} mt-1 tracking-[0.18em]`}
                  style={{ fontSize: 'clamp(0.45rem, 2.4cqi, 0.7rem)', color: pinch ? '#ff0055' : 'rgba(0, 229, 255, 0.85)' }}
                >
                  REMAINING
                </p>
              </>
            )}
          </div>
        </div>
      </div>
      {!running ? (
        <div className="mt-2 space-y-2">
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => onTargetMin(clampTarget(target - STEP_MINUTES))}
              className="h-10 w-10 cursor-pointer rounded-full bg-slate-100 text-lg font-black text-slate-700"
            >
              −
            </button>
            <label className="text-[11px] font-black text-slate-500">
              分数
              <input
                type="number"
                min={MIN_MINUTES}
                max={MAX_MINUTES}
                step={STEP_MINUTES}
                value={target}
                onChange={(event) => onTargetMin(clampTarget(Number(event.target.value) || MIN_MINUTES))}
                className={`${orbitron.className} mt-1 w-24 rounded-xl border border-slate-200 bg-slate-50 p-2 text-center text-lg text-slate-900`}
              />
            </label>
            <button
              type="button"
              onClick={() => onTargetMin(clampTarget(target + STEP_MINUTES))}
              className="h-10 w-10 cursor-pointer rounded-full bg-slate-100 text-lg font-black text-slate-700"
            >
              ＋
            </button>
          </div>
          <button
            type="button"
            onClick={() => onStart(target)}
            className={`${orbitron.className} w-full cursor-pointer rounded-2xl bg-sky-600 py-3 text-sm font-black tracking-[0.14em] text-white`}
          >
            MISSION START
          </button>
          <button type="button" onClick={onBack} className="w-full cursor-pointer py-1 text-center text-[11px] font-bold text-slate-400 underline">
            通常の計測に戻る
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleAbort}
          className={`${orbitron.className} mt-2 w-full cursor-pointer rounded-2xl bg-rose-600 py-3 text-sm font-black tracking-[0.12em] text-white`}
        >
          ABORT（中断）
        </button>
      )}
      <style>{'@keyframes cyber-pinch { 0%, 100% { opacity: 1; } 50% { opacity: 0.2; } }'}</style>
      {timeUpOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/75 px-4">
          <div className="w-full max-w-sm rounded-3xl bg-slate-950 px-6 py-8 text-center text-white shadow-2xl">
            <p className={`${orbitron.className} text-sm tracking-[0.2em] text-cyan-300`}>TIME UP</p>
            <p className="mt-3 text-xl font-black">タイムアップ！</p>
            <p className="mt-2 text-sm font-bold text-slate-300">目標の {target} 分を学習記録に残しました。</p>
          </div>
        </div>,
        document.body,
      )}
      {abortOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/75 px-4">
          <div className="w-full max-w-sm rounded-3xl bg-white px-6 py-6 text-center shadow-2xl">
            <p className="text-base font-black text-slate-900">タイムアタックを中断しました</p>
            <p className="mt-2 text-sm font-bold text-slate-600">
              ここまでの {Math.max(0, Math.round(abortElapsed / 60))} 分を学習記録に残しますか？
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setAbortOpen(false)}
                className="flex-1 cursor-pointer rounded-2xl bg-slate-100 py-3 text-sm font-black text-slate-600"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => {
                  setAbortOpen(false);
                  onSaveElapsed(abortElapsed);
                }}
                className="flex-1 cursor-pointer rounded-2xl bg-sky-600 py-3 text-sm font-black text-white"
              >
                記録する
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

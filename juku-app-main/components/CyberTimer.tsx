'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Orbitron } from 'next/font/google';

const orbitron = Orbitron({
  weight: '700',
  subsets: ['latin'],
  display: 'swap',
});

const IS_TEST_MODE = false;

const TICK_COUNT = 48;
const TICK_SECONDS = 300;
const MAX_SECONDS = TICK_COUNT * TICK_SECONDS;
const RING_RADIUS = 84;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const RING_BOX = {
  left: '7.231%',
  top: '25.943%',
  width: '85.538%',
  height: '48.115%',
} as const;

type CyberTimerProps = {
  running: boolean;
  startedAt: number | null;
  onStart: () => void;
  onStop: (seconds: number) => void;
};

function measuredSeconds(startedAt: number | null, now = Date.now()): number {
  if (!startedAt) return 0;
  const realSeconds = Math.max(0, (now - startedAt) / 1000);
  const scaled = IS_TEST_MODE ? realSeconds * TICK_SECONDS : realSeconds;
  return Math.min(MAX_SECONDS, scaled);
}

function litDasharray(lit: number): string {
  if (lit <= 0) return `0 ${RING_CIRCUMFERENCE}`;
  const marks = Array.from({ length: lit }, () => '3 8.0').join(' ');
  const consumed = lit * 11;
  const rest = Math.max(0, RING_CIRCUMFERENCE - consumed);
  return `${marks} 0 ${rest}`;
}

function formatHourClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.min(MAX_SECONDS, Math.floor(totalSeconds)));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function CyberTimer({ running, startedAt, onStart, onStop }: CyberTimerProps) {
  const [displaySec, setDisplaySec] = useState(0);

  useEffect(() => {
    if (!running || !startedAt) {
      setDisplaySec(0);
      return;
    }
    const tick = () => setDisplaySec(measuredSeconds(startedAt));
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [running, startedAt]);

  useEffect(() => {
    if (!running) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [running]);

  const shown = running ? displaySec : 0;
  const lit = Math.min(TICK_COUNT, Math.floor(shown / TICK_SECONDS));
  const complete = shown >= MAX_SECONDS;
  const activeStroke = complete ? '#ffffff' : '#00e5ff';
  const activeGlow = complete
    ? 'drop-shadow(0 0 6px #ffffff) drop-shadow(0 0 16px #ffffff)'
    : 'drop-shadow(0 0 4px #00e5ff) drop-shadow(0 0 10px #00e5ff)';

  const face = (
    <div className="relative h-full max-h-full w-auto max-w-full" style={{ aspectRatio: '1080 / 1920', containerType: 'inline-size' }}>
      <svg viewBox="0 0 200 200" className="absolute overflow-visible" style={RING_BOX} aria-hidden="true">
        <g transform="rotate(-90 100 100)">
          <circle cx="100" cy="100" r={RING_RADIUS} fill="none" stroke="rgba(0, 212, 255, 0.1)" strokeWidth="6" strokeDasharray="3 8.0" />
          <circle
            cx="100"
            cy="100"
            r={RING_RADIUS}
            fill="none"
            stroke={activeStroke}
            strokeWidth="6"
            strokeDasharray={litDasharray(complete ? TICK_COUNT : lit)}
            style={{ filter: activeGlow }}
          />
        </g>
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <p
          className={`${orbitron.className} leading-none tracking-wider`}
          style={{
            fontSize: 'clamp(1.6rem, 8cqi, 3rem)',
            color: complete ? '#ffffff' : '#00e5ff',
            textShadow: complete ? '0 0 8px #ffffff, 0 0 18px #ffffff' : '0 0 8px #00e5ff, 0 0 16px rgba(0, 229, 255, 0.85)',
          }}
        >
          {formatHourClock(shown)}
        </p>
        <p className={`${orbitron.className} mt-1 tracking-[0.18em]`} style={{ fontSize: 'clamp(0.7rem, 3cqi, 1rem)', color: 'rgba(0, 229, 255, 0.8)' }}>
          MAX 4H
        </p>
      </div>
    </div>
  );

  if (running && typeof document !== 'undefined') {
    return createPortal(
      <div
        className="fixed inset-0 w-screen h-screen z-[9999] bg-[#030811] flex flex-col items-center justify-between p-4 overflow-hidden"
        style={{
          backgroundImage: 'url(/images/bg-timer.png)',
          backgroundSize: 'contain',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        <div className="flex min-h-0 w-full flex-1 items-center justify-center">{face}</div>
        <button
          type="button"
          onClick={() => onStop(Math.floor(measuredSeconds(startedAt)))}
          className={`${orbitron.className} w-full max-w-sm cursor-pointer rounded-2xl bg-amber-500 py-4 text-base font-black tracking-[0.2em] text-white`}
        >
          STOP
        </button>
      </div>,
      document.body,
    );
  }

  return (
    <div className="mx-auto mt-2 w-full max-w-[280px]">
      {face}
      <button
        type="button"
        onClick={onStart}
        className={`${orbitron.className} mt-2 w-full cursor-pointer rounded-2xl bg-sky-600 py-3 text-sm font-black tracking-[0.2em] text-white`}
      >
        START
      </button>
    </div>
  );
}

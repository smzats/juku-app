'use client';

import { Component, useRef, useState, type ReactNode } from 'react';

type IsbnBarcodeScannerProps = {
  onIsbn: (isbn: string) => void;
  onClose: () => void;
};

const REGION_ID = 'isbn-photo-decoder';

function isbn13(raw: string): string | null {
  try {
    const digits = String(raw || '').replace(/\D/g, '');
    if (digits.length !== 13) return null;
    if (!digits.startsWith('978') && !digits.startsWith('979')) return null;
    return digits;
  } catch {
    return null;
  }
}

function releaseObjectUrls(urls: string[]) {
  urls.forEach((url) => {
    try { URL.revokeObjectURL(url); } catch { /* 解放済み */ }
  });
}

async function scanStillImage(file: File): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const host = document.getElementById(REGION_ID);
  if (!host) return null;
  const created: string[] = [];
  const original = URL.createObjectURL.bind(URL);
  URL.createObjectURL = ((object: Blob | MediaSource) => {
    const url = original(object);
    created.push(url);
    return url;
  }) as typeof URL.createObjectURL;
  try {
    const loaded = await import('html5-qrcode');
    const reader = new loaded.Html5Qrcode(REGION_ID, {
      formatsToSupport: [loaded.Html5QrcodeSupportedFormats.EAN_13],
      useBarCodeDetectorIfSupported: false,
      verbose: false,
    });
    try {
      const text = await reader.scanFile(file, false);
      return isbn13(text);
    } finally {
      const leftover = (reader as { lastScanImageFile?: string | null }).lastScanImageFile;
      if (leftover) {
        try { URL.revokeObjectURL(leftover); } catch { /* 解放済み */ }
        (reader as { lastScanImageFile?: string | null }).lastScanImageFile = null;
      }
      try { reader.clear(); } catch { /* 停止済み */ }
      host.replaceChildren();
    }
  } finally {
    URL.createObjectURL = original;
    releaseObjectUrls(created);
  }
}

async function readIsbnFromPhoto(file: File): Promise<string | null> {
  const direct = await scanStillImage(file).catch(() => null);
  if (direct) return direct;
  if (typeof createImageBitmap !== 'function') return null;
  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const bands = [0, 0.35, 0.6];
    for (const start of bands) {
      const canvas = document.createElement('canvas');
      const height = Math.max(1, Math.floor(bitmap.height * 0.45));
      const y = Math.min(bitmap.height - height, Math.floor(bitmap.height * start));
      canvas.width = bitmap.width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) continue;
      context.drawImage(bitmap, 0, y, bitmap.width, height, 0, 0, bitmap.width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      canvas.width = 0;
      canvas.height = 0;
      if (!blob) continue;
      const piece = new File([blob], 'band.jpg', { type: 'image/jpeg' });
      const found = await scanStillImage(piece).catch(() => null);
      if (found) return found;
    }
    return null;
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}

function ScannerFrame({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/70" onClick={onClose}>
      <div className="w-full max-w-lg space-y-3 rounded-t-3xl bg-white p-4 pb-8" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-black">バーコードで本を追加</h3>
          <button type="button" onClick={onClose} className="cursor-pointer text-xs font-black text-slate-400">閉じる</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ScannerBody({ onIsbn, onClose }: IsbnBarcodeScannerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [isbnValue, setIsbnValue] = useState('');
  const [hint, setHint] = useState('978 または 979 ではじまる13桁を確認してください。');
  const [reading, setReading] = useState(false);

  const onPick = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!file || typeof window === 'undefined') return;
    setReading(true);
    setHint('写真からISBNを読み取っています。');
    try {
      const isbn = await readIsbnFromPhoto(file);
      if (isbn) {
        setIsbnValue(isbn);
        setHint('読み取った数字を確認して、必要なら修正してください。');
        try { navigator.vibrate?.(200); } catch { /* 振動できない端末はそのまま進む */ }
      } else {
        setHint('写真からISBNを読み取れませんでした。13桁を入力してください。');
      }
    } catch {
      setHint('写真からISBNを読み取れませんでした。13桁を入力してください。');
    } finally {
      setReading(false);
    }
  };

  const submit = () => {
    const isbn = isbn13(isbnValue);
    if (!isbn) {
      setHint('978 または 979 ではじまる13桁のISBNを入力してください。');
      return;
    }
    try {
      onIsbn(isbn);
    } catch {
      setHint('ISBNの確認に失敗しました。もう一度入力してください。');
    }
  };

  return (
    <ScannerFrame onClose={onClose}>
      <div id={REGION_ID} className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0" aria-hidden />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          void onPick(file);
        }}
      />
      <button
        type="button"
        disabled={reading}
        onClick={() => fileRef.current?.click()}
        className="w-full cursor-pointer rounded-2xl bg-slate-900 py-3 text-sm font-black text-white disabled:opacity-60"
      >
        📷 バーコードを撮影して選択
      </button>
      <label className="block text-[11px] font-black text-slate-500">
        ISBN
        <input
          value={isbnValue}
          inputMode="numeric"
          autoComplete="off"
          onChange={(event) => setIsbnValue(event.target.value)}
          placeholder="978 または 979 ではじまる13桁"
          className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-900"
        />
      </label>
      <p className="text-xs font-bold text-slate-500">{hint}</p>
      <button type="button" onClick={submit} className="w-full cursor-pointer rounded-2xl bg-sky-600 py-3 text-sm font-black text-white">
        このISBNで確認
      </button>
    </ScannerFrame>
  );
}

class ScannerErrorBoundary extends Component<
  IsbnBarcodeScannerProps & { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <ScannerFrame onClose={this.props.onClose}>
          <p className="text-sm font-black leading-relaxed text-amber-800">写真からISBNを読み取れませんでした。13桁を入力してください。</p>
          <IsbnFallback onIsbn={this.props.onIsbn} />
        </ScannerFrame>
      );
    }
    return this.props.children;
  }
}

function IsbnFallback({ onIsbn }: { onIsbn: (isbn: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        const isbn = isbn13(value);
        if (isbn) onIsbn(isbn);
      }}
    >
      <input
        value={value}
        inputMode="numeric"
        onChange={(event) => setValue(event.target.value)}
        placeholder="978 または 979 ではじまる13桁"
        className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-900"
      />
      <button type="submit" className="w-full cursor-pointer rounded-2xl bg-sky-600 py-3 text-sm font-black text-white">
        このISBNで確認
      </button>
    </form>
  );
}

export default function IsbnBarcodeScanner(props: IsbnBarcodeScannerProps) {
  if (typeof window === 'undefined') return null;
  return (
    <ScannerErrorBoundary {...props}>
      <ScannerBody {...props} />
    </ScannerErrorBoundary>
  );
}

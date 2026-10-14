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

const DECODE_WIDTH = 800;

async function loadPhotoSource(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  try {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => { try { bitmap.close(); } catch { /* 解放済み */ } },
      };
    }
  } catch { /* 向き補正つきの読み込みに失敗したら通常の画像読み込みへ */ }
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image'));
      img.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => { try { URL.revokeObjectURL(url); } catch { /* 解放済み */ } },
    };
  } catch (error) {
    try { URL.revokeObjectURL(url); } catch { /* 解放済み */ }
    throw error;
  }
}

function scaledCanvas(source: CanvasImageSource, srcW: number, srcH: number, cropY: number, cropH: number): HTMLCanvasElement | null {
  try {
    const targetW = Math.min(DECODE_WIDTH, Math.max(1, srcW));
    const scale = targetW / srcW;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(srcW * scale));
    canvas.height = Math.max(1, Math.round(cropH * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(source, 0, cropY, srcW, cropH, 0, 0, canvas.width, canvas.height);
    return canvas;
  } catch {
    return null;
  }
}

function releaseCanvas(canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  try {
    canvas.width = 0;
    canvas.height = 0;
  } catch { /* 解放済み */ }
}

function rotateCanvas(source: HTMLCanvasElement): HTMLCanvasElement | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = source.height;
    canvas.height = source.width;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(Math.PI / 2);
    context.drawImage(source, -source.width / 2, -source.height / 2);
    return canvas;
  } catch {
    return null;
  }
}

async function textsFromCanvas(canvas: HTMLCanvasElement): Promise<string[]> {
  const found: string[] = [];
  try {
    const zxing = await import('@zxing/library');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context || canvas.width < 1 || canvas.height < 1) return found;
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = new Int32Array(canvas.width * canvas.height);
    for (let offset = 0, index = 0; offset < image.data.length; offset += 4, index += 1) {
      const red = image.data[offset];
      const green = image.data[offset + 1];
      const blue = image.data[offset + 2];
      pixels[index] = (0xff << 24) | (red << 16) | (green << 8) | blue;
    }
    const hints = new Map();
    hints.set(zxing.DecodeHintType.POSSIBLE_FORMATS, [zxing.BarcodeFormat.EAN_13]);
    hints.set(zxing.DecodeHintType.TRY_HARDER, true);
    const source = new zxing.RGBLuminanceSource(pixels, canvas.width, canvas.height);
    const reader = new zxing.MultiFormatReader();
    reader.setHints(hints);
    for (const Binarizer of [zxing.HybridBinarizer, zxing.GlobalHistogramBinarizer]) {
      try {
        const text = reader.decode(new zxing.BinaryBitmap(new Binarizer(source))).getText();
        if (text) found.push(String(text));
      } catch { /* この切り出しではバーコードが見つからない */ }
      try { reader.reset(); } catch { /* 次の二値化へ進む */ }
    }
  } catch { /* 解析ライブラリの失敗は次の画像へ進む */ }
  return found;
}

function chooseIsbn(texts: string[]): string | null {
  for (const text of texts) {
    const isbn = isbn13(text);
    if (isbn) return isbn;
  }
  return null;
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
  let frame: Awaited<ReturnType<typeof loadPhotoSource>> | null = null;
  const canvases: HTMLCanvasElement[] = [];
  try {
    frame = await loadPhotoSource(file);
    if (frame.width < 1 || frame.height < 1) return null;
    const crops = [0, 0.18, 0.36, 0.54, 0.7].map((start) => ({
      y: Math.floor(frame.height * start),
      h: Math.max(1, Math.floor(frame.height * 0.36)),
    }));
    crops.push({ y: 0, h: frame.height });
    const collected: string[] = [];
    let fullCanvas: HTMLCanvasElement | null = null;
    for (const crop of crops) {
      const y = Math.min(frame.height - 1, Math.max(0, crop.y));
      const height = Math.min(frame.height - y, crop.h);
      const canvas = scaledCanvas(frame.source, frame.width, frame.height, y, height);
      if (!canvas) continue;
      canvases.push(canvas);
      if (crop.h === frame.height) fullCanvas = canvas;
      collected.push(...await textsFromCanvas(canvas));
      const isbn = chooseIsbn(collected);
      if (isbn) return isbn;
    }
    if (fullCanvas) {
      const turned = rotateCanvas(fullCanvas);
      if (turned) {
        canvases.push(turned);
        collected.push(...await textsFromCanvas(turned));
        const isbn = chooseIsbn(collected);
        if (isbn) return isbn;
      }
    }
    for (const canvas of canvases) {
      try {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
        if (!blob) continue;
        const piece = new File([blob], 'isbn.jpg', { type: 'image/jpeg' });
        const found = await scanStillImage(piece).catch(() => null);
        if (found) return found;
      } catch { /* 縮小画像の再解析に失敗したら次の切り出しへ */ }
    }
    return null;
  } catch {
    return null;
  } finally {
    canvases.forEach(releaseCanvas);
    frame?.close();
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
        setHint('ISBNを読み取りました。書籍を確認しています。');
        try { navigator.vibrate?.(200); } catch { /* 振動できない端末はそのまま進む */ }
        try { onIsbn(isbn); } catch { setHint('ISBNの確認に失敗しました。もう一度入力してください。'); }
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
        className="w-full cursor-pointer rounded-2xl bg-violet-600 py-3 text-sm font-black text-white disabled:opacity-60"
      >
        📷 バーコードを撮影してね
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
      <button
        type="button"
        onClick={submit}
        disabled={!isbn13(isbnValue)}
        className={`w-full rounded-2xl py-3 text-sm font-black ${isbn13(isbnValue) ? 'cursor-pointer bg-sky-600 text-white' : 'cursor-not-allowed bg-slate-300 text-slate-500'}`}
      >
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
      <button
        type="submit"
        disabled={!isbn13(value)}
        className={`w-full rounded-2xl py-3 text-sm font-black ${isbn13(value) ? 'cursor-pointer bg-sky-600 text-white' : 'cursor-not-allowed bg-slate-300 text-slate-500'}`}
      >
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

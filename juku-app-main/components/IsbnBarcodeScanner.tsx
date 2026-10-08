'use client';

import { Component, useEffect, useRef, useState, type ReactNode } from 'react';

type IsbnBarcodeScannerProps = {
  onIsbn: (isbn: string) => void;
  onClose: () => void;
};

const CAMERA_FAILURE = '⚠️ カメラの起動に失敗しました。カメラ権限を許可するか、直接ISBNを入力してください';

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

function ManualIsbnForm({ onIsbn }: { onIsbn: (isbn: string) => void }) {
  const [value, setValue] = useState('');
  const [hint, setHint] = useState('');

  const submit = () => {
    const isbn = isbn13(value);
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
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label className="block text-[11px] font-black text-slate-500">
        ISBN
        <input
          value={value}
          inputMode="numeric"
          autoComplete="off"
          onChange={(event) => setValue(event.target.value)}
          placeholder="978 または 979 ではじまる13桁"
          className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-900"
        />
      </label>
      {hint ? <p className="text-[11px] font-bold text-amber-700">{hint}</p> : null}
      <button type="submit" className="w-full cursor-pointer rounded-2xl bg-slate-900 py-3 text-sm font-black text-white">
        このISBNで探す
      </button>
    </form>
  );
}

function ScannerFrame({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
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
  const [message, setMessage] = useState('カメラを起動しています。');
  const [failed, setFailed] = useState(false);
  const onIsbnRef = useRef(onIsbn);
  onIsbnRef.current = onIsbn;
  const regionId = 'isbn-barcode-reader';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let stopped = false;
    let scanner: { stop: () => Promise<void>; clear: () => void } | null = null;

    const fail = () => {
      if (!stopped) setFailed(true);
    };

    const stopScanner = () => {
      const current = scanner;
      scanner = null;
      if (!current) return;
      void current.stop().catch(() => {}).finally(() => {
        try { current.clear(); } catch { /* 停止済み */ }
      });
    };

    const onWindowError = (event: ErrorEvent) => {
      const text = `${event.message || ''} ${event.error || ''}`;
      if (!/qrbox|Html5Qrcode|getUserMedia|camera|scanner|Barcode|removeChild/i.test(text)) return;
      event.preventDefault();
      fail();
      stopScanner();
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const text = String(event.reason?.message || event.reason || '');
      if (!/qrbox|Html5Qrcode|getUserMedia|camera|scanner|Barcode|removeChild/i.test(text)) return;
      event.preventDefault();
      fail();
      stopScanner();
    };
    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onRejection);

    const start = async () => {
      try {
        if (typeof window === 'undefined') return;
        const canUseCamera = !!window.navigator?.mediaDevices?.getUserMedia;
        if (!canUseCamera) {
          fail();
          return;
        }
        const region = document.getElementById(regionId);
        if (!region) {
          fail();
          return;
        }
        const loaded = await import('html5-qrcode');
        if (stopped) return;
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = loaded;
        const reader = new Html5Qrcode(regionId, {
          formatsToSupport: [Html5QrcodeSupportedFormats.EAN_13],
          useBarCodeDetectorIfSupported: false,
          verbose: false,
        });
        scanner = reader;
        if (stopped) {
          stopScanner();
          return;
        }
        await reader.start(
          { facingMode: 'environment' },
          { fps: 8 },
          (decodedText) => {
            try {
              const isbn = isbn13(decodedText);
              if (!isbn || stopped) return;
              stopped = true;
              try { navigator.vibrate?.(200); } catch { /* 振動できない端末はそのまま進む */ }
              void reader.stop().catch(() => {}).finally(() => {
                try { reader.clear(); } catch { /* 停止済み */ }
                try { onIsbnRef.current(isbn); } catch { fail(); }
              });
            } catch {
              fail();
            }
          },
          () => {},
        );
        if (stopped) {
          stopScanner();
          return;
        }
        setMessage('978 または 979 ではじまる書籍バーコードをかざしてください。');
      } catch {
        fail();
        stopScanner();
      }
    };

    void start();
    return () => {
      stopped = true;
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onRejection);
      stopScanner();
    };
  }, []);

  return (
    <ScannerFrame onClose={onClose}>
      <div id={regionId} className="h-64 w-full overflow-hidden rounded-2xl bg-slate-900" />
      {failed ? (
        <>
          <p className="text-sm font-black leading-relaxed text-amber-800">{CAMERA_FAILURE}</p>
          <ManualIsbnForm onIsbn={onIsbn} />
        </>
      ) : (
        <p className="text-xs font-bold text-slate-500">{message}</p>
      )}
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
          <p className="text-sm font-black leading-relaxed text-amber-800">{CAMERA_FAILURE}</p>
          <ManualIsbnForm onIsbn={this.props.onIsbn} />
        </ScannerFrame>
      );
    }
    return this.props.children;
  }
}

export default function IsbnBarcodeScanner(props: IsbnBarcodeScannerProps) {
  if (typeof window === 'undefined') return null;
  return (
    <ScannerErrorBoundary {...props}>
      <ScannerBody {...props} />
    </ScannerErrorBoundary>
  );
}

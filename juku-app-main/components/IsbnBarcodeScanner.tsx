'use client';

import { useEffect, useRef, useState } from 'react';

type IsbnBarcodeScannerProps = {
  onIsbn: (isbn: string) => void;
  onClose: () => void;
};

function isbn13(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 13) return null;
  if (!digits.startsWith('978') && !digits.startsWith('979')) return null;
  return digits;
}

export default function IsbnBarcodeScanner({ onIsbn, onClose }: IsbnBarcodeScannerProps) {
  const [message, setMessage] = useState('カメラを起動しています。');
  const onIsbnRef = useRef(onIsbn);
  onIsbnRef.current = onIsbn;
  const regionId = 'isbn-barcode-reader';

  useEffect(() => {
    let stopped = false;
    let scanner: { stop: () => Promise<void>; clear: () => void } | null = null;

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMessage('カメラアクセスを許可してください');
        return;
      }
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
        if (stopped) return;
        const reader = new Html5Qrcode(regionId, {
          formatsToSupport: [Html5QrcodeSupportedFormats.EAN_13],
          useBarCodeDetectorIfSupported: false,
          verbose: false,
        });
        scanner = reader;
        await reader.start(
          { facingMode: 'environment' },
          { fps: 8, qrbox: { width: 260, height: 140 } },
          (decodedText) => {
            const isbn = isbn13(decodedText);
            if (!isbn || stopped) return;
            stopped = true;
            navigator.vibrate?.(200);
            void reader.stop().catch(() => {}).finally(() => {
              try { reader.clear(); } catch { /* 停止済み */ }
              onIsbnRef.current(isbn);
            });
          },
          () => {},
        );
        if (!stopped) setMessage('978 または 979 ではじまる書籍バーコードをかざしてください。');
      } catch {
        if (!stopped) setMessage('カメラアクセスを許可してください');
      }
    };

    void start();
    return () => {
      stopped = true;
      const current = scanner;
      if (!current) return;
      void current.stop().catch(() => {}).finally(() => {
        try { current.clear(); } catch { /* 停止済み */ }
      });
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/70 flex items-end justify-center" onClick={onClose}>
      <div className="bg-white w-full max-w-lg rounded-t-3xl p-4 pb-8 space-y-3" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-black text-base">バーコードで本を追加</h3>
          <button type="button" onClick={onClose} className="text-xs font-black text-slate-400 cursor-pointer">閉じる</button>
        </div>
        <div id={regionId} className="w-full overflow-hidden rounded-2xl bg-slate-900" />
        <p className="text-xs font-bold text-slate-500">{message}</p>
      </div>
    </div>
  );
}

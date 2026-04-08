'use client';
// 레이어형 alert/confirm. window.alert/confirm 대체.
// 사용:
//   const modal = useModal();
//   await modal.alert('메시지');
//   const ok = await modal.confirm('정말?');
//   <ModalHost />  ← 루트(layout.tsx)에 한 번 마운트
import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type Variant = 'info' | 'warn' | 'danger';
interface DialogState {
  id: number;
  title?: string;
  message: ReactNode;
  variant: Variant;
  confirmLabel: string;
  cancelLabel?: string; // undefined → alert
  resolve: (v: boolean) => void;
}

let _push: ((d: Omit<DialogState, 'id'>) => Promise<boolean>) | null = null;

export function useModal() {
  return {
    alert: (message: ReactNode, opts: { title?: string; variant?: Variant; confirmLabel?: string } = {}) =>
      _push ? _push({ message, title: opts.title, variant: opts.variant ?? 'info', confirmLabel: opts.confirmLabel ?? '확인', resolve: () => {} }) : Promise.resolve(true),
    confirm: (message: ReactNode, opts: { title?: string; variant?: Variant; confirmLabel?: string; cancelLabel?: string } = {}) =>
      _push ? _push({ message, title: opts.title, variant: opts.variant ?? 'warn', confirmLabel: opts.confirmLabel ?? '확인', cancelLabel: opts.cancelLabel ?? '취소', resolve: () => {} }) : Promise.resolve(false),
  };
}

export function ModalHost() {
  const [stack, setStack] = useState<DialogState[]>([]);

  const push = useCallback((d: Omit<DialogState, 'id'>) => {
    return new Promise<boolean>((resolve) => {
      const id = Date.now() + Math.random();
      setStack(s => [...s, { ...d, id, resolve }]);
    });
  }, []);

  // register global pusher
  if (_push !== push) _push = push;

  const close = (d: DialogState, val: boolean) => {
    d.resolve(val);
    setStack(s => s.filter(x => x.id !== d.id));
  };

  if (stack.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative flex flex-col gap-3">
        {stack.map(d => {
          const accent =
            d.variant === 'danger' ? 'border-red/60' :
            d.variant === 'warn'   ? 'border-yellow-500/60' :
                                     'border-blue-500/60';
          const icon = d.variant === 'danger' ? '⛔' : d.variant === 'warn' ? '⚠' : 'ℹ';
          const btnClass = d.variant === 'danger' ? 'bg-red text-white hover:opacity-90' : 'btn-primary';
          return (
            <div key={d.id} className={`relative w-[min(92vw,440px)] rounded-xl border ${accent} bg-[#0d1117] shadow-2xl p-5 space-y-4`}>
              <div className="flex items-start gap-3">
                <span className="text-2xl leading-none">{icon}</span>
                <div className="flex-1">
                  {d.title && <h3 className="font-semibold text-base mb-1">{d.title}</h3>}
                  <div className="text-sm text-white/90 whitespace-pre-wrap">{d.message}</div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                {d.cancelLabel && (
                  <button onClick={() => close(d, false)} className="btn btn-ghost text-sm">{d.cancelLabel}</button>
                )}
                <button onClick={() => close(d, true)} className={`btn text-sm ${btnClass}`} autoFocus>{d.confirmLabel}</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

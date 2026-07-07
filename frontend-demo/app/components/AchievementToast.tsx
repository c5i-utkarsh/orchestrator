"use client";

import { useEffect, useRef, useState } from "react";

export interface Toast {
  id: string;
  icon: string;
  title: string;
  body: string;
}

let listeners: ((t: Toast) => void)[] = [];

export function fireAchievement(icon: string, title: string, body: string) {
  const t: Toast = { id: `${Date.now()}-${Math.random()}`, icon, title, body };
  listeners.forEach(fn => fn(t));
}

export default function AchievementToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const handler = (t: Toast) => {
      setToasts(prev => [...prev, t]);
      timersRef.current[t.id] = setTimeout(() => {
        setToasts(prev => prev.filter(x => x.id !== t.id));
        delete timersRef.current[t.id];
      }, 4500);
    };
    listeners.push(handler);
    return () => {
      listeners = listeners.filter(fn => fn !== handler);
      Object.values(timersRef.current).forEach(clearTimeout);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-3 items-end pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-start gap-3 bg-white border border-gg/30 rounded-2xl shadow-xl px-5 py-4 max-w-sm animate-slide-in"
        >
          <div className="text-2xl flex-shrink-0 mt-0.5">{t.icon}</div>
          <div>
            <div className="text-[12px] font-bold text-t1">{t.title}</div>
            <div className="text-[11px] text-t2 mt-0.5">{t.body}</div>
          </div>
          <div className="w-1 self-stretch rounded-full bg-gg/50 flex-shrink-0 ml-1" />
        </div>
      ))}
    </div>
  );
}

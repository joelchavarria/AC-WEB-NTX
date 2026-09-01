"use client";

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { CheckCircle, Info, WarningCircle, X } from "@phosphor-icons/react";

type NoticeTone = "success" | "error" | "info";

type Notice = {
  id: number;
  title: string;
  description?: string;
  tone: NoticeTone;
};

type NoticeInput = Omit<Notice, "id">;

const NoticeContext = createContext<{ showNotice: (notice: NoticeInput) => void } | null>(null);

const icons = {
  success: CheckCircle,
  error: WarningCircle,
  info: Info,
};

export function NoticeCenterProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);

  const showNotice = useCallback((notice: NoticeInput) => {
    const id = Date.now() + Math.random();
    setNotices((current) => [...current, { ...notice, id }]);
    window.setTimeout(() => {
      setNotices((current) => current.filter((entry) => entry.id !== id));
    }, 4200);
  }, []);

  const value = useMemo(() => ({ showNotice }), [showNotice]);

  return <NoticeContext.Provider value={value}>{children}<div className="notice-stack" aria-live="polite" aria-atomic="true">{notices.map((notice) => { const Icon = icons[notice.tone]; return <article key={notice.id} className={`notice-card ${notice.tone}`}><div className="notice-icon"><Icon weight="fill" /></div><div className="notice-copy"><strong>{notice.title}</strong>{notice.description ? <p>{notice.description}</p> : null}</div><button type="button" className="notice-close" aria-label="Cerrar notificacion" onClick={() => setNotices((current) => current.filter((entry) => entry.id !== notice.id))}><X /></button></article>; })}</div></NoticeContext.Provider>;
}

export function useNoticeCenter() {
  const context = useContext(NoticeContext);

  if (!context) {
    throw new Error("useNoticeCenter must be used within NoticeCenterProvider.");
  }

  return context;
}

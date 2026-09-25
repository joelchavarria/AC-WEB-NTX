"use client";

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { CheckCircle, Info, WarningCircle, X } from "@phosphor-icons/react";

type NoticeTone = "success" | "error" | "info";
export type NoticeCategory = "checkout" | "auth" | "catalog" | "cart" | "system";

type Notice = {
  id: number;
  title: string;
  description?: string;
  tone: NoticeTone;
  reportable?: boolean;
  category?: NoticeCategory;
  code?: string;
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
  const [reportingIds, setReportingIds] = useState<Set<number>>(new Set());

  const showNotice = useCallback((notice: NoticeInput) => {
    const id = Date.now() + Math.random();
    setNotices((current) => [...current, { ...notice, id }]);
    if (notice.tone !== "error") {
      window.setTimeout(() => {
        setNotices((current) => current.filter((entry) => entry.id !== id));
      }, 4200);
    }
  }, []);

  const value = useMemo(() => ({ showNotice }), [showNotice]);

  async function reportNotice(notice: Notice) {
    if (reportingIds.has(notice.id)) return;
    setReportingIds((current) => new Set(current).add(notice.id));
    try {
      const response = await fetch("/api/error-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: notice.title,
          description: notice.description,
          category: notice.category,
          code: notice.code,
          pageUrl: window.location.href,
          userAgent: navigator.userAgent,
        }),
      });
      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(errorData?.error ?? "No pudimos registrar el reporte.");
      }
      const data = (await response.json().catch(() => null)) as {
        referenceId?: string;
      } | null;
      setNotices((current) => current.filter((entry) => entry.id !== notice.id));
      showNotice({
        tone: "success",
        title: "Reporte registrado",
        description: data?.referenceId
          ? `Gracias. Referencia: ${data.referenceId.slice(0, 8)}.`
          : "Gracias por ayudarnos a mejorar ONDIE.",
      });
    } catch (error) {
      showNotice({
        tone: "error",
        reportable: false,
        category: "system",
        title: "No pudimos registrar el reporte",
        description: error instanceof Error ? error.message : "Intenta nuevamente.",
      });
    } finally {
      setReportingIds((current) => {
        const next = new Set(current);
        next.delete(notice.id);
        return next;
      });
    }
  }

  return <NoticeContext.Provider value={value}>{children}<div className="notice-stack" aria-live="polite" aria-atomic="true">{notices.map((notice) => { const Icon = icons[notice.tone]; const canReport = notice.tone === "error" && notice.reportable !== false; const isReporting = reportingIds.has(notice.id); return <article key={notice.id} className={`notice-card ${notice.tone}`}><div className="notice-icon"><Icon weight="fill" /></div><div className="notice-copy"><strong>{notice.title}</strong>{notice.description ? <p>{notice.description}</p> : null}{canReport ? <button type="button" className="notice-report" onClick={() => void reportNotice(notice)} disabled={isReporting}>{isReporting ? "Registrando..." : "Reportar error"}</button> : null}</div><div className="notice-actions"><button type="button" className="notice-close" aria-label="Cerrar notificación" onClick={() => setNotices((current) => current.filter((entry) => entry.id !== notice.id))}><X /></button></div></article>; })}</div></NoticeContext.Provider>;
}

export function useNoticeCenter() {
  const context = useContext(NoticeContext);

  if (!context) {
    throw new Error("useNoticeCenter must be used within NoticeCenterProvider.");
  }

  return context;
}

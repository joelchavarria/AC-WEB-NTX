"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle,
  EnvelopeSimple,
  LockKey,
  PaperPlaneTilt,
  WarningCircle,
} from "@phosphor-icons/react";
import { supabase } from "@/lib/supabase";

const RECOVERY_URL =
  process.env.NEXT_PUBLIC_AUTH_RECOVERY_URL?.trim() ||
  "https://ondie.devtester.lat/auth/recovery";
const RECOVERY_SESSION_KEY = "ondie.password-recovery.active";
const MINIMUM_PASSWORD_LENGTH = 12;

type Screen = "request" | "validating" | "reset" | "saving" | "sent" | "complete";

type RecoveryPayload = {
  accessToken: string | null;
  code: string | null;
  error: string | null;
  refreshToken: string | null;
};

function getRecoveryPayload(): RecoveryPayload {
  if (typeof window === "undefined") {
    return { accessToken: null, code: null, error: null, refreshToken: null };
  }

  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  return {
    accessToken: hash.get("access_token"),
    code: query.get("code"),
    error: query.get("error_description") || query.get("error") || hash.get("error_description") || hash.get("error"),
    refreshToken: hash.get("refresh_token"),
  };
}

function readableRecoveryError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("rate limit") || normalized.includes("too many requests")) {
    return "Espera unos minutos antes de solicitar otro correo.";
  }

  if (normalized.includes("password should be at least")) {
    return `Tu nueva contraseña debe tener al menos ${MINIMUM_PASSWORD_LENGTH} caracteres.`;
  }

  return "No pudimos procesar la solicitud. Intenta nuevamente.";
}

function clearRecoveryUrl() {
  if (typeof window !== "undefined") {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

export function PasswordRecoveryClient() {
  const [screen, setScreen] = useState<Screen>("request");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    const payload = getRecoveryPayload();
    const hasRecoveryPayload = Boolean(payload.code || (payload.accessToken && payload.refreshToken));
    const isRecoveryInProgress = window.sessionStorage.getItem(RECOVERY_SESSION_KEY) === "true";

    async function prepareRecovery() {
      if (payload.error) {
        window.sessionStorage.removeItem(RECOVERY_SESSION_KEY);
        if (active) {
          setMessage("Este enlace ya no es válido. Solicita uno nuevo para continuar.");
        }
        clearRecoveryUrl();
        return;
      }

      if (!hasRecoveryPayload && !isRecoveryInProgress) {
        return;
      }

      if (active) {
        setScreen("validating");
        setMessage("");
      }

      try {
        if (payload.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(payload.code);
          if (error) throw error;
        } else if (payload.accessToken && payload.refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: payload.accessToken,
            refresh_token: payload.refreshToken,
          });
          if (error) throw error;
        }

        const { data, error } = await supabase.auth.getSession();
        if (error || !data.session) {
          throw error || new Error("No se encontró una sesión de recuperación válida.");
        }

        window.sessionStorage.setItem(RECOVERY_SESSION_KEY, "true");
        clearRecoveryUrl();

        if (active) {
          setScreen("reset");
        }
      } catch {
        window.sessionStorage.removeItem(RECOVERY_SESSION_KEY);
        clearRecoveryUrl();
        if (active) {
          setScreen("request");
          setMessage("Este enlace venció, ya fue utilizado o no es válido. Solicita uno nuevo.");
        }
      }
    }

    void prepareRecovery();

    return () => {
      active = false;
    };
  }, []);

  async function requestRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim();

    if (!normalizedEmail || screen === "validating") return;

    setScreen("validating");
    setMessage("");

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: RECOVERY_URL,
      });
      if (error) throw error;

      setScreen("sent");
    } catch (error) {
      setScreen("request");
      setMessage(readableRecoveryError(error instanceof Error ? error.message : ""));
    }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (newPassword.length < MINIMUM_PASSWORD_LENGTH) {
      setMessage(`Usa al menos ${MINIMUM_PASSWORD_LENGTH} caracteres en tu nueva contraseña.`);
      return;
    }

    if (newPassword !== confirmation) {
      setMessage("Las dos contraseñas no coinciden.");
      return;
    }

    setScreen("saving");
    setMessage("");

    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      window.sessionStorage.removeItem(RECOVERY_SESSION_KEY);
      clearRecoveryUrl();
      await supabase.auth.signOut({ scope: "local" });
      setNewPassword("");
      setConfirmation("");
      setScreen("complete");
    } catch (error) {
      setScreen("reset");
      setMessage(readableRecoveryError(error instanceof Error ? error.message : ""));
    }
  }

  const isWorking = screen === "validating" || screen === "saving";

  return (
    <main className="auth-confirmation-page auth-recovery-page">
      <div className="auth-confirmation-orb auth-confirmation-orb-one" />
      <div className="auth-confirmation-orb auth-confirmation-orb-two" />
      <section className="auth-confirmation-shell" aria-labelledby="recovery-title">
        <Link href="/account" className="auth-recovery-back"><ArrowLeft /> Volver a iniciar sesión</Link>
        <div className="auth-confirmation-brand">
          <span className="auth-confirmation-brand-mark">O</span>
          <span>ONDIE</span>
        </div>

        <section className={`auth-confirmation-card${message ? " is-error" : ""}`}>
          <div className="auth-confirmation-icon" aria-hidden="true">
            {message ? <WarningCircle weight="fill" /> : screen === "complete" || screen === "sent" ? <CheckCircle weight="fill" /> : <LockKey weight="fill" />}
          </div>

          {screen === "request" || screen === "validating" ? (
            <>
              <p className="auth-confirmation-eyebrow">SEGURIDAD DE TU CUENTA</p>
              <h1 id="recovery-title">Recupera tu contraseña</h1>
              <p className="auth-confirmation-description">Escribe tu correo y te enviaremos un enlace seguro para crear una nueva contraseña.</p>
              <form className="auth-recovery-form" onSubmit={requestRecovery}>
                <label>
                  <span>Correo electrónico</span>
                  <div><EnvelopeSimple /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="tu@correo.com" disabled={isWorking} required /></div>
                </label>
                {message && <p className="auth-recovery-message" role="alert">{message}</p>}
                <button className="auth-confirmation-primary" type="submit" disabled={isWorking}>
                  <PaperPlaneTilt weight="bold" /> {isWorking ? "Enviando…" : "Enviar enlace"}
                </button>
              </form>
            </>
          ) : null}

          {screen === "sent" ? (
            <>
              <p className="auth-confirmation-eyebrow">REVISA TU CORREO</p>
              <h1 id="recovery-title">Enlace enviado</h1>
              <p className="auth-confirmation-description">Si existe una cuenta con ese correo, recibirá un enlace para crear una nueva contraseña. Revisa también correo no deseado.</p>
              <button className="auth-confirmation-primary" type="button" onClick={() => { setScreen("request"); setMessage(""); }}>
                Enviar a otro correo
              </button>
            </>
          ) : null}

          {screen === "reset" || screen === "saving" ? (
            <>
              <p className="auth-confirmation-eyebrow">NUEVA CONTRASEÑA</p>
              <h1 id="recovery-title">Crea tu nueva clave</h1>
              <p className="auth-confirmation-description">Usa al menos {MINIMUM_PASSWORD_LENGTH} caracteres y no compartas esta clave con nadie.</p>
              <form className="auth-recovery-form" onSubmit={resetPassword}>
                <label>
                  <span>Nueva contraseña</span>
                  <div><LockKey /><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={MINIMUM_PASSWORD_LENGTH} disabled={isWorking} required /></div>
                </label>
                <label>
                  <span>Confirmar nueva contraseña</span>
                  <div><LockKey /><input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" minLength={MINIMUM_PASSWORD_LENGTH} disabled={isWorking} required /></div>
                </label>
                {message && <p className="auth-recovery-message" role="alert">{message}</p>}
                <button className="auth-confirmation-primary" type="submit" disabled={isWorking}>
                  <LockKey weight="bold" /> {isWorking ? "Guardando…" : "Guardar nueva contraseña"}
                </button>
              </form>
            </>
          ) : null}

          {screen === "complete" ? (
            <>
              <p className="auth-confirmation-eyebrow">CONTRASEÑA ACTUALIZADA</p>
              <h1 id="recovery-title">Ya puedes iniciar sesión</h1>
              <p className="auth-confirmation-description">Tu contraseña fue actualizada correctamente. Inicia sesión con tu correo y la nueva clave.</p>
              <Link className="auth-confirmation-primary" href="/account">Ir a iniciar sesión</Link>
            </>
          ) : null}
        </section>
      </section>
    </main>
  );
}

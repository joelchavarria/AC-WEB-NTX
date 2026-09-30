"use client";

import { CheckCircle, Rocket, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

const MOBILE_AUTH_CALLBACK_URL = "ondie://auth/callback";
const APP_STORE_URL = process.env.NEXT_PUBLIC_ONDIE_APP_STORE_URL?.trim();
const GOOGLE_PLAY_URL = process.env.NEXT_PUBLIC_ONDIE_GOOGLE_PLAY_URL?.trim();

function getMobileCallbackUrl() {
  if (typeof window === "undefined") return MOBILE_AUTH_CALLBACK_URL;
  return `${MOBILE_AUTH_CALLBACK_URL}${window.location.search}${window.location.hash}`;
}

function readConfirmationError() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return Boolean(params.get("error") || params.get("error_code"));
}

export function AuthConfirmationClient() {
  const [opening, setOpening] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [showInstallHint, setShowInstallHint] = useState(false);

  useEffect(() => {
    const callbackHasAuthPayload =
      window.location.hash.includes("access_token") ||
      window.location.search.includes("code=") ||
      readConfirmationError();

    setHasError(readConfirmationError());

    if (!callbackHasAuthPayload) return;

    const timer = window.setTimeout(() => {
      setOpening(true);
      window.location.assign(getMobileCallbackUrl());
      window.setTimeout(() => setShowInstallHint(true), 1400);
    }, 350);

    return () => window.clearTimeout(timer);
  }, []);

  const openApp = () => {
    setOpening(true);
    setShowInstallHint(false);
    window.location.assign(getMobileCallbackUrl());
    window.setTimeout(() => setShowInstallHint(true), 1400);
  };

  return (
    <main className="auth-confirmation-page">
      <div className="auth-confirmation-orb auth-confirmation-orb-one" />
      <div className="auth-confirmation-orb auth-confirmation-orb-two" />
      <section className="auth-confirmation-shell" aria-labelledby="confirmation-title">
        <div className="auth-confirmation-brand">
          <span className="auth-confirmation-brand-mark">O</span>
          <span>ONDIE</span>
        </div>

        <div className={`auth-confirmation-card${hasError ? " is-error" : ""}`}>
          <div className="auth-confirmation-icon" aria-hidden="true">
            {hasError ? <WarningCircle weight="fill" /> : <CheckCircle weight="fill" />}
          </div>
          <p className="auth-confirmation-eyebrow">Bienvenido a ONDIE</p>
          <h1 id="confirmation-title">
            {hasError ? "No pudimos confirmar tu correo" : "Correo confirmado correctamente"}
          </h1>
          <p className="auth-confirmation-description">
            {hasError
              ? "El enlace puede haber expirado o ya fue utilizado. Solicita un nuevo correo de confirmación e inténtalo otra vez."
              : "Tu cuenta ya está lista. Sigue estos pasos para comenzar a usar ONDIE."}
          </p>

          <button type="button" className="auth-confirmation-primary" onClick={openApp}>
            <Rocket weight="bold" />
            {opening ? "Intentando abrir ONDIE…" : "Abrir aplicación"}
          </button>

          <div className="auth-confirmation-help">
            <strong>{showInstallHint ? "¿No se abrió la aplicación?" : "Sigue estos pasos"}</strong>
            <p>
              {hasError
                ? "Puedes volver a registrarte o iniciar sesión con tu cuenta desde la app."
                : "La aplicación se abrirá automáticamente si ya está instalada en este dispositivo."}
            </p>
            {!hasError && (
              <ol className="auth-confirmation-steps">
                <li><span>1</span><div><strong>Abre la aplicación</strong><small>Si no se abrió, toca el botón de arriba nuevamente.</small></div></li>
                <li><span>2</span><div><strong>Inicia sesión</strong><small>Usa el correo y la contraseña con los que creaste tu cuenta.</small></div></li>
                <li><span>3</span><div><strong>Comienza en ONDIE</strong><small>Ya puedes configurar tu cuenta y administrar tu tienda.</small></div></li>
              </ol>
            )}
            {!hasError && !APP_STORE_URL && !GOOGLE_PLAY_URL && (
              <p className="auth-confirmation-store-note">
                La aplicación móvil todavía no está publicada en las tiendas. Cuando esté disponible, podrás instalarla desde esta página.
              </p>
            )}
            {(APP_STORE_URL || GOOGLE_PLAY_URL) && (
              <div className="auth-confirmation-downloads">
                {APP_STORE_URL && <a href={APP_STORE_URL} target="_blank" rel="noreferrer">Instalar en App Store</a>}
                {GOOGLE_PLAY_URL && <a href={GOOGLE_PLAY_URL} target="_blank" rel="noreferrer">Instalar en Google Play</a>}
              </div>
            )}
          </div>

        </div>
      </section>
    </main>
  );
}

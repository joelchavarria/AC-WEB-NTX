"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export function LoginGate() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/checkout` : undefined,
      },
    });

    setLoading(false);
    setMessage(error ? error.message : "Te enviamos un enlace para continuar tu compra.");
  }

  return (
    <div className="card stack">
      <span className="eyebrow">Acceso seguro</span>
      <h3>Inicia sesion para finalizar la compra</h3>
      <p className="muted">La web es publica. Solo pedimos login al momento de finalizar la compra.</p>
      <input
        className="input"
        type="email"
        placeholder="tu@correo.com"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <button className="button" onClick={handleLogin} disabled={loading || !email}>
        {loading ? "Enviando..." : "Enviar enlace"}
      </button>
      {message ? <p className="muted">{message}</p> : null}
    </div>
  );
}

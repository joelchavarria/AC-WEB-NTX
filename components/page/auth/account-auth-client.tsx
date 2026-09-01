"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, EnvelopeSimple, LockKey, SignIn } from "@phosphor-icons/react";
import { useNoticeCenter } from "@/components/page/feedback/notice-center";
import { supabase } from "@/lib/supabase";

type Mode = "login" | "signup";

const copyByMode: Record<Mode, { title: string; description: string; action: string; success: string }> = {
  login: {
    title: "Inicia sesion",
    description: "Accede a tu cuenta para seguir tus pedidos y guardar tu informacion como cliente.",
    action: "Entrar",
    success: "Sesion iniciada correctamente.",
  },
  signup: {
    title: "Crea tu cuenta",
    description: "Registra tu cuenta de cliente para comprar mas rapido y llevar historial de pedidos.",
    action: "Crear cuenta",
    success: "Tu cuenta fue creada. Revisa tu correo si tu acceso requiere confirmacion.",
  },
};

function readableAuthError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "Tu correo o contrasena no coinciden. Revísalos e intenta nuevamente.";
  }

  if (normalized.includes("user already registered")) {
    return "Ya existe una cuenta con este correo. Intenta iniciar sesion.";
  }

  if (normalized.includes("password should be at least")) {
    return "Tu contrasena debe tener al menos 6 caracteres.";
  }

  if (normalized.includes("unable to validate email address")) {
    return "Escribe un correo valido para continuar.";
  }

  return "No pudimos completar tu solicitud en este momento. Intenta nuevamente.";
}

export function AccountAuthClient() {
  const router = useRouter();
  const { showNotice } = useNoticeCenter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const nextEmail = data.user?.email ?? null;

      if (nextEmail) {
        router.replace("/");
      }
    });
  }, [router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!email.trim() || !password.trim() || loading) {
      return;
    }

    setLoading(true);

    try {
      const authAction = mode === "login"
        ? supabase.auth.signInWithPassword({ email: email.trim(), password })
        : supabase.auth.signUp({
            email: email.trim(),
            password,
            options: {
              emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/account` : undefined,
              data: { audience: "customer" },
            },
          });

      const { data, error: authError } = await authAction;

      if (authError) {
        throw authError;
      }

      showNotice({ tone: "success", title: copyByMode[mode].success, description: mode === "login" ? "Te llevaremos al panel principal de tiendas." : "Ya puedes iniciar sesion con tu nueva cuenta." });
      router.replace("/");
      if (mode === "signup") {
        setMode("login");
      }
    } catch (authError) {
      showNotice({ tone: "error", title: "No pudimos completar tu acceso", description: readableAuthError(authError instanceof Error ? authError.message : "") });
    } finally {
      setLoading(false);
    }
  }

  const copy = copyByMode[mode];

  return <main className="account-page"><div className="account-shell"><Link href="/" className="account-back"><ArrowLeft /> Volver al inicio</Link><section className="account-auth-card"><div className="account-auth-copy"><span>{mode === "login" ? "CUENTA CLIENTE" : "NUEVO CLIENTE"}</span><h1>{copy.title}</h1><p>{copy.description}</p></div><div className="account-auth-tabs"><button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Iniciar sesion</button><button type="button" className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>Registrarse</button></div><form className="account-auth-form" onSubmit={handleSubmit}><label><span>Correo electronico</span><div><EnvelopeSimple /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="tu@correo.com" autoComplete="email" required /></div></label><label><span>Contrasena</span><div><LockKey /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimo 6 caracteres" autoComplete={mode === "login" ? "current-password" : "new-password"} required /></div></label><button type="submit" className="account-auth-submit" disabled={loading}><SignIn weight="bold" /> {loading ? "Procesando..." : copy.action}</button></form><p className="account-auth-note">Una misma cuenta puede comprar como cliente y tambien administrar una tienda si ya existe en la app movil.</p></section></div></main>;
}

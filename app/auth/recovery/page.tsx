import type { Metadata } from "next";
import { PasswordRecoveryClient } from "@/components/page/auth/password-recovery-client";

export const metadata: Metadata = {
  title: "Recuperar contraseña | ONDIE",
  description: "Solicita un enlace seguro para crear una nueva contraseña de ONDIE.",
  robots: { index: false, follow: false },
};

export default function PasswordRecoveryPage() {
  return <PasswordRecoveryClient />;
}

import type { Metadata } from "next";
import { AuthConfirmationClient } from "@/components/page/auth/auth-confirmation-client";

export const metadata: Metadata = {
  title: "Correo confirmado | ONDIE",
  description: "Confirma tu correo y continúa en la aplicación ONDIE.",
  robots: { index: false, follow: false },
};

export default function ConfirmedEmailPage() {
  return <AuthConfirmationClient />;
}

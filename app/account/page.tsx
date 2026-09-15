export const metadata = { robots: { index: false, follow: true } };

import { AccountAuthClient } from "@/components/page/auth/account-auth-client";

export default function AccountPage() {
  return <AccountAuthClient />;
}

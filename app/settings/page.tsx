import type { Metadata } from "next";
import { SettingsPage } from "@/components/settings/settings-page";
import { requireSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Configurações",
};

export default async function Settings() {
  await requireSessionUser();
  return <SettingsPage />;
}

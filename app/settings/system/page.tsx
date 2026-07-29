import type { Metadata } from "next";
import { SystemPage } from "@/components/settings/system-page";
import { requirePageSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sistema" };

export default async function SettingsSystemPage() {
  await requirePageSessionUser("/settings/system");
  return <SystemPage />;
}

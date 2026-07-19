import type { Metadata } from "next";
import { MemoryPage } from "@/components/settings/memory-page";
import { requireSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Memórias" };

export default async function SettingsMemoryPage() {
  await requireSessionUser();
  return <MemoryPage />;
}

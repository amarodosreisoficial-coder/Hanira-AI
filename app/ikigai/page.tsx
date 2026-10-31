import type { Metadata } from "next";
import { IkigaiPage } from "@/components/ikigai/ikigai-page";
import { requirePageSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Ikigai" };

export default async function Ikigai() {
  await requirePageSessionUser("/ikigai");
  return <IkigaiPage />;
}

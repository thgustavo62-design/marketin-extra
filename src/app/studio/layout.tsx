import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import "@/features/studio/studio.css";
export const metadata = {
  title: "Encartiva Studio — Editor de designs e promoções",
};
export default async function StudioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.mustChange) redirect("/configuracoes/conta?trocar=1");
  return children;
}

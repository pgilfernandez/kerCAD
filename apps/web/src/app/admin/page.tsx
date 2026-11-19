import { notFound } from "next/navigation";
import { AdminPanel } from "./AdminPanel";
import { adminPasswordRequired, readAdminSlug } from "@/lib/adminMetrics";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (await readAdminSlug() !== "admin") notFound();
  return <AdminPanel slug="admin" passwordRequired={await adminPasswordRequired()} />;
}

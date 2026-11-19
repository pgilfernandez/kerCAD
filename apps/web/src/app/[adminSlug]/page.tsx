import { notFound } from "next/navigation";
import { AdminPanel } from "../admin/AdminPanel";
import { readAdminSlug } from "@/lib/adminMetrics";

export const dynamic = "force-dynamic";

export default async function CustomAdminPage({ params }: { params: Promise<{ adminSlug: string }> }) {
  const { adminSlug } = await params;
  if (adminSlug !== await readAdminSlug()) notFound();
  return <AdminPanel slug={adminSlug} />;
}

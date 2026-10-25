import { redirect } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";

export default async function AdminHome() {
  await requireAdminPage();
  redirect("/staff/admin/menu");
}

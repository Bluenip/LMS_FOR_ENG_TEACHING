import { redirect } from "next/navigation";

/** Self-registration is disabled; accounts are provisioned by admins and teachers. */
export default function RegisterPage() {
  redirect("/login?reason=no-register");
}

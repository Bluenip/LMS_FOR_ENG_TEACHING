"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, KeyRound, UserPlus } from "lucide-react";
import type { Role } from "@prisma/client";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface StudentOption {
  id: string;
  name: string;
  email: string;
}

interface CreateAccountFormProps {
  /** POST endpoint: `/api/admin/users` (admin) or `/api/classes/{id}/accounts` (teacher) */
  endpoint: string;
  roles: Role[];
  /** students a new PARENT can be linked to */
  students?: StudentOption[];
  onCreated?: () => void;
  title?: string;
  description?: string;
}

interface CreatedInfo {
  name: string;
  email: string;
  role: Role;
  temporaryPassword: string | null;
  linkedExistingParent: boolean;
}

export function CreateAccountForm({
  endpoint,
  roles,
  students = [],
  onCreated,
  title,
  description,
}: CreateAccountFormProps) {
  const { m, tr } = useI18n();
  const [role, setRole] = useState<Role>(roles[0] ?? "STUDENT");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [studentId, setStudentId] = useState("");
  const [relation, setRelation] = useState("");
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<CreatedInfo | null>(null);

  const needsStudent = role === "PARENT" && students.length > 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (role === "PARENT" && endpoint.includes("/api/classes/") && !studentId) {
      toast.error(tr("Vui lòng chọn học sinh để liên kết.", "Please choose the student to link."));
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          role,
          password: password || undefined,
          studentId: role === "PARENT" ? studentId || undefined : undefined,
          relation: role === "PARENT" ? relation || undefined : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? m.common.errorGeneric);
      setCreated({
        name: json.user.name,
        email: json.user.email,
        role: json.user.role,
        temporaryPassword: json.temporaryPassword,
        linkedExistingParent: json.linkedExistingParent,
      });
      toast.success(
        json.linkedExistingParent
          ? tr("Đã liên kết phụ huynh có sẵn với học sinh.", "Existing parent linked to the student.")
          : tr("Đã tạo tài khoản.", "Account created.")
      );
      setName("");
      setEmail("");
      setPassword("");
      setRelation("");
      onCreated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : m.common.errorGeneric);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <UserPlus className="h-4 w-4 text-[#4F46E5]" />
        <h3 className="text-sm font-bold text-[#0B1C30]">
          {title ?? tr("Tạo tài khoản", "Create account")}
        </h3>
      </div>
      {description && <p className="text-xs text-[#464555]">{description}</p>}

      <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label className="text-xs">{m.auth.role}</Label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#4F46E5]"
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {m.roles[r]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">{m.auth.fullName}</Label>
          <Input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">{m.auth.email}</Label>
          <Input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">{tr("Mật khẩu (bỏ trống = tự sinh)", "Password (empty = generate)")}</Label>
          <Input
            type="text"
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1"
          />
        </div>

        {needsStudent && (
          <>
            <div className="sm:col-span-1 lg:col-span-2">
              <Label className="text-xs">{tr("Phụ huynh của học sinh", "Parent of student")}</Label>
              <select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#4F46E5]"
              >
                <option value="">{tr("— Chọn học sinh —", "— Choose a student —")}</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.email})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">{tr("Quan hệ", "Relationship")}</Label>
              <Input
                value={relation}
                onChange={(e) => setRelation(e.target.value)}
                placeholder={tr("Bố / Mẹ / Người giám hộ", "Father / Mother / Guardian")}
                className="mt-1"
              />
            </div>
          </>
        )}

        <div className="flex items-end">
          <Button type="submit" disabled={saving} className="w-full">
            <UserPlus className="h-4 w-4" />
            {saving ? m.common.saving : tr("Tạo tài khoản", "Create account")}
          </Button>
        </div>
      </form>

      {created && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-[#0B1C30]">
          <p className="font-semibold">
            {created.linkedExistingParent
              ? tr("Đã liên kết tài khoản phụ huynh có sẵn:", "Linked existing parent account:")
              : tr("Đã tạo tài khoản:", "Account created:")}{" "}
            {created.name} — {created.email} ({m.roles[created.role]})
          </p>
          {created.temporaryPassword && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <KeyRound className="h-4 w-4 text-emerald-700" />
              <span>{tr("Mật khẩu tạm (chỉ hiện một lần):", "Temporary password (shown once):")}</span>
              <code className="rounded bg-white px-2 py-0.5 font-mono text-sm font-bold">
                {created.temporaryPassword}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(`${created.email} / ${created.temporaryPassword}`);
                  toast.success(m.common.copied);
                }}
              >
                <Copy className="h-3.5 w-3.5" />
                {m.common.copy}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

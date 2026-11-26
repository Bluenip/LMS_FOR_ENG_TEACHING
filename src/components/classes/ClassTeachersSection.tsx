"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Trash2, UserPlus, Users } from "lucide-react";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ClassTeacherItem {
  id: string;
  userId: string;
  role: "CO_TEACHER" | "ASSISTANT" | "OWNER";
  user: { id: string; name: string; email: string; role?: string };
}

export function ClassTeachersSection({
  classId,
  owner,
  initialTeachers,
  canManage,
}: {
  classId: string;
  owner: { id: string; name: string; email: string };
  initialTeachers: ClassTeacherItem[];
  canManage: boolean;
}) {
  const { tr } = useI18n();
  const [teachers, setTeachers] = useState<ClassTeacherItem[]>(initialTeachers);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"CO_TEACHER" | "ASSISTANT">("CO_TEACHER");
  const [submitting, setSubmitting] = useState(false);
  const [removing, setRemoving] = useState<ClassTeacherItem | null>(null);

  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      const res = await apiFetchJson<{ teachers: ClassTeacherItem[] }>(
        `/api/classes/${classId}/teachers`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), role }),
        }
      );
      setTeachers(res.teachers);
      setEmail("");
      toast.success(tr("Đã thêm giáo viên vào lớp!", "Teacher added to class!"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Thêm thất bại", "Failed to add teacher"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangeRole = async (userId: string, nextRole: "CO_TEACHER" | "ASSISTANT") => {
    try {
      const res = await apiFetchJson<{ teachers: ClassTeacherItem[] }>(
        `/api/classes/${classId}/teachers`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, role: nextRole }),
        }
      );
      setTeachers(res.teachers);
      toast.success(tr("Đã cập nhật vai trò.", "Role updated."));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Cập nhật thất bại", "Update failed"));
    }
  };

  const handleConfirmRemove = async () => {
    if (!removing) return;
    try {
      const res = await apiFetchJson<{ teachers: ClassTeacherItem[] }>(
        `/api/classes/${classId}/teachers?userId=${encodeURIComponent(removing.userId)}`,
        { method: "DELETE" }
      );
      setTeachers(res.teachers);
      setRemoving(null);
      toast.success(tr("Đã gỡ khỏi lớp.", "Removed from class."));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Gỡ thất bại", "Remove failed"));
    }
  };

  return (
    <div className="stitch-card p-5 space-y-4" data-testid="class-teachers-section">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-[#4F46E5]" />
        <h3 className="text-sm font-bold text-[#0B1C30] dark:text-slate-100">
          {tr("Đồng giáo viên & Trợ giảng", "Co-teachers & Teaching Assistants")}
        </h3>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs">
          <div>
            <p className="font-semibold text-[#0B1C30] dark:text-slate-100">{owner.name}</p>
            <p className="text-slate-400">{owner.email}</p>
          </div>
          <Badge variant="indigo">{tr("Chủ lớp", "Owner")}</Badge>
        </div>

        {teachers.map((ct) => (
          <div
            key={ct.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 dark:border-slate-800 px-3 py-2 text-xs"
          >
            <div>
              <p className="font-semibold text-[#0B1C30] dark:text-slate-100">{ct.user.name}</p>
              <p className="text-slate-400">{ct.user.email}</p>
            </div>
            <div className="flex items-center gap-2">
              {canManage ? (
                <>
                  <select
                    value={ct.role}
                    onChange={(e) =>
                      handleChangeRole(
                        ct.userId,
                        e.target.value as "CO_TEACHER" | "ASSISTANT"
                      )
                    }
                    className="h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs"
                  >
                    <option value="CO_TEACHER">{tr("Đồng giáo viên", "Co-teacher")}</option>
                    <option value="ASSISTANT">{tr("Trợ giảng", "Assistant")}</option>
                  </select>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-9 w-9 p-0 text-red-600"
                    onClick={() => setRemoving(ct)}
                    aria-label={tr("Gỡ", "Remove")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <Badge variant="sky">
                  {ct.role === "ASSISTANT"
                    ? tr("Trợ giảng", "Assistant")
                    : tr("Đồng giáo viên", "Co-teacher")}
                </Badge>
              )}
            </div>
          </div>
        ))}
      </div>

      {canManage && (
        <form onSubmit={handleAddTeacher} className="flex flex-wrap items-center gap-2 pt-2">
          <Input
            type="email"
            placeholder={tr("Email giáo viên cần mời…", "Teacher email to invite…")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="flex-1 min-w-[180px] h-10"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as "CO_TEACHER" | "ASSISTANT")}
            className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs"
          >
            <option value="CO_TEACHER">{tr("Đồng giáo viên", "Co-teacher")}</option>
            <option value="ASSISTANT">{tr("Trợ giảng (chỉ chấm & xem)", "Assistant (grade & view)")}</option>
          </select>
          <Button type="submit" size="sm" disabled={submitting} className="min-h-10">
            <UserPlus className="h-4 w-4" />
            {tr("Mời", "Invite")}
          </Button>
        </form>
      )}

      <Dialog open={Boolean(removing)} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{tr("Gỡ khỏi lớp học?", "Remove teacher?")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#464555] dark:text-slate-300">
            {tr(
              `Gỡ ${removing?.user.name ?? ""} khỏi danh sách giáo viên lớp này?`,
              `Remove ${removing?.user.name ?? ""} from this class's teaching team?`
            )}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              {tr("Huỷ", "Cancel")}
            </Button>
            <Button variant="destructive" onClick={handleConfirmRemove}>
              {tr("Gỡ", "Remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

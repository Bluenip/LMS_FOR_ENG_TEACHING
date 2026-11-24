"use client";

import { Suspense, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetchJson } from "@/lib/api-client";
import { DriveAdminCard } from "@/components/drive/DriveAdminCard";
import { toast } from "sonner";
import {
  ArrowRightLeft,
  BookOpen,
  FileText,
  GraduationCap,
  KeyRound,
  Link2,
  Lock,
  RotateCcw,
  Shield,
  Trash2,
  Unlock,
  Users,
} from "lucide-react";
import type { Role } from "@prisma/client";
import { formatDateTime } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CreateAccountForm } from "@/components/accounts/CreateAccountForm";
import {
  ResetPasswordDialog,
  type ResetPasswordTarget,
} from "@/components/accounts/ResetPasswordDialog";
import {
  DeleteAccountDialog,
  type DeleteAccountTarget,
} from "@/components/accounts/DeleteAccountDialog";
import {
  TransferOwnershipDialog,
  type TransferOwnershipTarget,
} from "@/components/admin/TransferOwnershipDialog";
import { BulkImportUsersCard } from "@/components/admin/BulkImportUsersCard";

interface AdminOverview {
  stats: {
    totalUsers: number;
    teachers: number;
    students: number;
    parents: number;
    classes: number;
    worksheets: number;
    assignments: number;
    submissions: number;
  };
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: Role;
    isLocked: boolean;
    createdAt: string;
    _count: { classesTaught: number; worksheets: number; enrollments: number; submissions: number };
  }>;
  parentLinks: Array<{
    id: string;
    relation: string | null;
    verifiedAt: string | null;
    parent: { id: string; name: string; email: string };
    student: { id: string; name: string; email: string };
  }>;
  trash: Array<{
    id: string;
    name: string;
    email: string;
    role: Role;
    deletedAt: string;
    purgeAt: string;
    _count: { classesTaught: number; worksheets: number; submissions: number };
  }>;
}

export default function AdminPortalPage() {
  const { m: vi, tr } = useI18n();
  const queryClient = useQueryClient();

  const [resetTarget, setResetTarget] = useState<ResetPasswordTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteAccountTarget | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<DeleteAccountTarget | null>(null);
  const [transferTarget, setTransferTarget] = useState<TransferOwnershipTarget | null>(null);
  const [roleDialog, setRoleDialog] = useState<{
    user: { id: string; name: string; email: string; role: Role };
    nextRole: Role;
    error: string | null;
    isRoleHasContent: boolean;
    saving: boolean;
  } | null>(null);

  const handleRestore = async (id: string) => {
    const res = await fetch(`/api/admin/users/${id}/restore`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.error ?? vi.common.errorGeneric);
      return;
    }
    toast.success(tr("Đã khôi phục tài khoản.", "Account restored."));
    queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
  };
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [selectedParentId, setSelectedParentId] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [relation, setRelation] = useState("");

  const { data, isLoading } = useQuery<AdminOverview>({
    queryKey: ["admin-overview", search, roleFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (roleFilter) params.set("role", roleFilter);
      return apiFetchJson<AdminOverview>(
        `/api/admin/overview?${params.toString()}`,
        undefined,
        tr("Không tải được dữ liệu quản trị", "Could not load admin data")
      );
    },
  });

  const handleUpdateUser = async (
    userId: string,
    patch: { role?: Role; isLocked?: boolean }
  ): Promise<{ ok: boolean; error?: string; code?: string }> => {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const json = await res.json();
    if (!res.ok) {
      const errMsg = (json.error as string | undefined) ?? tr("Cập nhật thất bại", "Update failed");
      if (!patch.role) {
        toast.error(errMsg);
      }
      return { ok: false, error: errMsg, code: json.code as string | undefined };
    }
    toast.success(tr("Đã cập nhật tài khoản!", "Account updated!"));
    queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    return { ok: true };
  };

  const handleConfirmRoleChange = async () => {
    if (!roleDialog) return;
    setRoleDialog((prev) => (prev ? { ...prev, saving: true, error: null } : null));
    const result = await handleUpdateUser(roleDialog.user.id, { role: roleDialog.nextRole });
    if (result.ok) {
      setRoleDialog(null);
      return;
    }
    setRoleDialog((prev) =>
      prev
        ? {
            ...prev,
            saving: false,
            error: result.error ?? tr("Cập nhật thất bại", "Update failed"),
            isRoleHasContent: result.code === "ROLE_HAS_CONTENT",
          }
        : null
    );
  };

  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParentId || !selectedStudentId) return;
    const res = await fetch("/api/admin/parent-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parentId: selectedParentId,
        studentId: selectedStudentId,
        relation: relation.trim() || tr("Phụ huynh", "Parent"),
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? tr("Liên kết thất bại", "Linking failed"));
      return;
    }
    toast.success(tr("Đã liên kết phụ huynh và học sinh!", "Parent and student linked!"));
    setSelectedParentId("");
    setSelectedStudentId("");
    queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
  };

  const handleDeleteLink = async (linkId: string) => {
    const res = await fetch("/api/admin/parent-links", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkId }),
    });
    if (res.ok) {
      toast.success(tr("Đã gỡ liên kết.", "Link removed."));
      queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    }
  };

  if (isLoading || !data) {
    return (
      <div className="stitch-card p-12 text-center text-sm text-slate-400">
        {vi.common.loading}
      </div>
    );
  }

  const parents = data.users.filter((u) => u.role === "PARENT");
  const students = data.users.filter((u) => u.role === "STUDENT");

  return (
    <div className="space-y-8 pb-10">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#4F46E5] text-white">
          <Shield className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-[#0B1C30]">{vi.admin.title}</h1>
          <p className="text-sm text-[#464555]">
            {tr("Quản lý tài khoản, phân quyền, khoá tài khoản và liên kết phụ huynh – học sinh.", "Manage accounts, roles, account locks and parent – student links.")}
          </p>
        </div>
      </div>

      {/* System Stats Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="stitch-card p-4">
          <p className="text-xs font-semibold text-slate-500">{vi.admin.stats.totalUsers}</p>
          <p className="mt-1.5 text-2xl font-bold text-[#0B1C30] tabular-nums">
            {data.stats.totalUsers}
          </p>
        </div>
        <div className="stitch-card p-4">
          <p className="text-xs font-semibold text-slate-500 flex items-center gap-1">
            <GraduationCap className="h-3.5 w-3.5 text-[#4F46E5]" /> {vi.admin.stats.teachers}
          </p>
          <p className="mt-1.5 text-2xl font-bold text-[#3525CD] tabular-nums">
            {data.stats.teachers}
          </p>
        </div>
        <div className="stitch-card p-4">
          <p className="text-xs font-semibold text-slate-500 flex items-center gap-1">
            <Users className="h-3.5 w-3.5 text-emerald-600" /> {vi.admin.stats.students}
          </p>
          <p className="mt-1.5 text-2xl font-bold text-emerald-700 tabular-nums">
            {data.stats.students}
          </p>
        </div>
        <div className="stitch-card p-4">
          <p className="text-xs font-semibold text-slate-500">{vi.admin.stats.parents}</p>
          <p className="mt-1.5 text-2xl font-bold text-[#EA580C] tabular-nums">
            {data.stats.parents}
          </p>
        </div>
        <div className="stitch-card p-4">
          <p className="text-xs font-semibold text-slate-500 flex items-center gap-1">
            <BookOpen className="h-3.5 w-3.5 text-[#4F46E5]" /> {vi.admin.stats.classes}
          </p>
          <p className="mt-1.5 text-2xl font-bold text-[#0B1C30] tabular-nums">
            {data.stats.classes}
          </p>
        </div>
        <div className="stitch-card p-4">
          <p className="text-xs font-semibold text-slate-500 flex items-center gap-1">
            <FileText className="h-3.5 w-3.5 text-[#F97316]" /> {tr("Worksheets / Bài nộp", "Worksheets / Submissions")}
          </p>
          <p className="mt-1.5 text-2xl font-bold text-[#0B1C30] tabular-nums">
            {data.stats.worksheets} / {data.stats.submissions}
          </p>
        </div>
      </div>

      {/* Google Drive Shared Connection */}
      <Suspense fallback={null}>
        <DriveAdminCard />
      </Suspense>

      {/* Account provisioning (public registration is disabled) */}
      <section className="stitch-card p-6">
        <CreateAccountForm
          endpoint="/api/admin/users"
          roles={["TEACHER", "STUDENT", "PARENT", "ADMIN"]}
          students={data.users
            .filter((u) => u.role === "STUDENT")
            .map((u) => ({ id: u.id, name: u.name, email: u.email }))}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ["admin-overview"] })}
          description={tr(
            "Hệ thống không cho tự đăng ký: quản trị viên tạo tài khoản cho mọi vai trò. Bỏ trống mật khẩu để hệ thống tự sinh và hiện một lần.",
            "Self-registration is disabled: the administrator creates accounts for every role. Leave the password empty to generate one (shown once)."
          )}
        />
      </section>

      {/* Bulk Excel Account Import */}
      <BulkImportUsersCard
        onImported={() => queryClient.invalidateQueries({ queryKey: ["admin-overview"] })}
      />

      {/* User Management Table */}
      <section className="stitch-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-bold text-[#0B1C30]">
            {vi.admin.users.title} ({data.users.length})
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tr("Tìm tên hoặc email…", "Search name or email…")}
              className="h-9 w-56 text-xs"
            />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold outline-none"
            >
              <option value="">{tr("Tất cả vai trò", "All roles")}</option>
              <option value="ADMIN">{tr("Quản trị viên", "Administrator")}</option>
              <option value="TEACHER">{tr("Giáo viên", "Teacher")}</option>
              <option value="STUDENT">{tr("Học sinh", "Student")}</option>
              <option value="PARENT">{tr("Phụ huynh", "Parent")}</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#F8F9FF] text-xs font-bold uppercase text-[#464555]">
              <tr>
                <th className="px-6 py-3">{tr("Người dùng", "User")}</th>
                <th className="px-6 py-3">{tr("Vai trò", "Role")}</th>
                <th className="px-6 py-3">{tr("Trạng thái", "Status")}</th>
                <th className="px-6 py-3">{tr("Ngày tạo", "Created")}</th>
                <th className="px-6 py-3 text-right">{tr("Thao tác", "Actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/70">
                  <td className="px-6 py-3.5">
                    <p className="font-semibold text-[#0B1C30]">{u.name}</p>
                    <p className="text-xs text-slate-400">{u.email}</p>
                    {(u._count.classesTaught > 0 || u._count.worksheets > 0) && (
                      <p className="mt-0.5 text-[11px] text-[#464555] tabular-nums">
                        {u._count.classesTaught} {tr("lớp", "classes")} · {u._count.worksheets}{" "}
                        {tr("worksheet", "worksheets")}
                      </p>
                    )}
                  </td>
                  <td className="px-6 py-3.5">
                    <select
                      aria-label={tr(`Vai trò của ${u.name}`, `Role for ${u.name}`)}
                      value={u.role}
                      onChange={(e) => {
                        const nextRole = e.target.value as Role;
                        if (nextRole === u.role) return;
                        setRoleDialog({
                          user: { id: u.id, name: u.name, email: u.email, role: u.role },
                          nextRole,
                          error: null,
                          isRoleHasContent: false,
                          saving: false,
                        });
                      }}
                      className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold outline-none focus:border-[#4F46E5]"
                    >
                      <option value="STUDENT">{vi.roles.STUDENT}</option>
                      <option value="TEACHER">{vi.roles.TEACHER}</option>
                      <option value="PARENT">{vi.roles.PARENT}</option>
                      <option value="ADMIN">{vi.roles.ADMIN}</option>
                    </select>
                  </td>
                  <td className="px-6 py-3.5">
                    {u.isLocked ? (
                      <Badge variant="danger">{vi.admin.users.locked}</Badge>
                    ) : (
                      <Badge variant="mint">{vi.admin.users.active}</Badge>
                    )}
                  </td>
                  <td className="px-6 py-3.5 text-xs text-slate-500 tabular-nums">
                    {formatDateTime(u.createdAt)}
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                      {(u.role === "TEACHER" ||
                        u.role === "ADMIN" ||
                        u._count.classesTaught > 0 ||
                        u._count.worksheets > 0) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setTransferTarget({ id: u.id, name: u.name, email: u.email })
                          }
                        >
                          <ArrowRightLeft className="h-3.5 w-3.5 text-[#4F46E5]" />{" "}
                          {tr("Chuyển dữ liệu", "Transfer data")}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant={u.isLocked ? "secondary" : "outline"}
                        onClick={() => void handleUpdateUser(u.id, { isLocked: !u.isLocked })}
                      >
                        {u.isLocked ? (
                          <>
                            <Unlock className="h-3.5 w-3.5" /> {vi.admin.users.unlock}
                          </>
                        ) : (
                          <>
                            <Lock className="h-3.5 w-3.5 text-red-500" /> {vi.admin.users.lock}
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setResetTarget({
                            id: u.id,
                            name: u.name,
                            email: u.email,
                            roleLabel: vi.roles[u.role],
                          })
                        }
                      >
                        <KeyRound className="h-3.5 w-3.5" /> {tr("Đặt lại MK", "Reset password")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:bg-red-50"
                        onClick={() =>
                          setDeleteTarget({ id: u.id, name: u.name, email: u.email })
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" /> {vi.common.delete}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Trash: deleted accounts, restorable for 90 days */}
      {data.trash.length > 0 && (
        <section className="stitch-card overflow-hidden">
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="flex items-center gap-2 text-base font-bold text-[#0B1C30]">
              <Trash2 className="h-4 w-4 text-red-500" />
              {tr("Thùng rác", "Trash")} ({data.trash.length})
            </h2>
            <p className="mt-1 text-xs text-[#464555]">
              {tr(
                "Tài khoản đã xoá được giữ 90 ngày để khôi phục, sau đó bị xoá vĩnh viễn cùng toàn bộ dữ liệu.",
                "Deleted accounts are kept for 90 days so they can be restored, then removed forever with all their data."
              )}
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {data.trash.map((u) => {
              const daysLeft = Math.max(
                0,
                Math.ceil((new Date(u.purgeAt).getTime() - Date.now()) / 86_400_000)
              );
              return (
                <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5">
                  <div className="min-w-0">
                    <p className="font-semibold text-[#0B1C30]">
                      {u.name}{" "}
                      <span className="text-xs font-medium text-slate-400">· {vi.roles[u.role]}</span>
                    </p>
                    <p className="truncate text-xs text-slate-400">{u.email}</p>
                    <p className="mt-0.5 text-xs text-[#464555]">
                      {tr(
                        `${u._count.classesTaught} lớp · ${u._count.worksheets} bài tập · ${u._count.submissions} bài nộp — tự xoá sau ${daysLeft} ngày`,
                        `${u._count.classesTaught} classes · ${u._count.worksheets} worksheets · ${u._count.submissions} submissions — deleted in ${daysLeft} days`
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => void handleRestore(u.id)}>
                      <RotateCcw className="h-3.5 w-3.5" /> {tr("Khôi phục", "Restore")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 hover:bg-red-50"
                      onClick={() => setPurgeTarget({ id: u.id, name: u.name, email: u.email })}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> {tr("Xoá vĩnh viễn", "Delete forever")}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Manual Parent <-> Student Linking */}
      <section className="stitch-card p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-[#4F46E5]" />
          <h2 className="text-base font-bold text-[#0B1C30]">
            {vi.admin.parentLinks.title}
          </h2>
        </div>

        <form onSubmit={handleCreateLink} className="grid grid-cols-1 gap-3 sm:grid-cols-4 items-end">
          <div className="space-y-1">
            <Label className="text-xs">{tr("Phụ huynh", "Parent")}</Label>
            <select
              required
              value={selectedParentId}
              onChange={(e) => setSelectedParentId(e.target.value)}
              className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs outline-none"
            >
              <option value="">{tr("— Chọn phụ huynh —", "— Select parent —")}</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.email})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{tr("Học sinh", "Student")}</Label>
            <select
              required
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs outline-none"
            >
              <option value="">{tr("— Chọn học sinh —", "— Select student —")}</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.email})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{tr("Mối quan hệ", "Relationship")}</Label>
            <Input
              value={relation}
              onChange={(e) => setRelation(e.target.value)}
              placeholder={tr("Phụ huynh", "Parent")}
              className="h-9 text-xs"
            />
          </div>
          <Button type="submit" size="sm" className="h-9">
            {vi.admin.parentLinks.create}
          </Button>
        </form>

        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {data.parentLinks.map((l) => (
            <div key={l.id} className="flex items-center justify-between py-2.5 text-xs">
              <div>
                <strong>{l.parent.name}</strong> ({l.relation ?? tr("Phụ huynh", "Parent")}) ↔{" "}
                <strong className="text-[#3525CD]">{l.student.name}</strong> ({l.student.email})
              </div>
              <button
                type="button"
                onClick={() => void handleDeleteLink(l.id)}
                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </section>

      <ResetPasswordDialog
        target={resetTarget}
        onClose={() => setResetTarget(null)}
      />
      <DeleteAccountDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => queryClient.invalidateQueries({ queryKey: ["admin-overview"] })}
        onRequestTransfer={(t) => setTransferTarget(t)}
      />
      <DeleteAccountDialog
        mode="purge"
        target={purgeTarget}
        onClose={() => setPurgeTarget(null)}
        onDeleted={() => queryClient.invalidateQueries({ queryKey: ["admin-overview"] })}
      />
      <TransferOwnershipDialog
        target={transferTarget}
        onClose={() => setTransferTarget(null)}
        onTransferred={() => queryClient.invalidateQueries({ queryKey: ["admin-overview"] })}
      />

      <Dialog open={Boolean(roleDialog)} onOpenChange={(open) => !open && setRoleDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("Xác nhận đổi vai trò", "Confirm role change")}</DialogTitle>
            {roleDialog && (
              <DialogDescription>
                {roleDialog.user.name} ({roleDialog.user.email})
              </DialogDescription>
            )}
          </DialogHeader>
          {roleDialog && (
            <div className="space-y-4">
              <p className="text-sm text-[#464555]">
                {tr(
                  `Đổi vai trò từ "${vi.roles[roleDialog.user.role]}" sang "${vi.roles[roleDialog.nextRole]}"? Tài khoản này sẽ bị đăng xuất khỏi mọi thiết bị và phải đăng nhập lại.`,
                  `Change role from "${vi.roles[roleDialog.user.role]}" to "${vi.roles[roleDialog.nextRole]}"? This account will be signed out of all devices and must sign in again.`
                )}
              </p>

              {roleDialog.error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-800 space-y-2.5">
                  <p className="font-semibold">{roleDialog.error}</p>
                  {roleDialog.isRoleHasContent && (
                    <Button
                      type="button"
                      size="sm"
                      className="min-h-[40px]"
                      onClick={() => {
                        const target = {
                          id: roleDialog.user.id,
                          name: roleDialog.user.name,
                          email: roleDialog.user.email,
                        };
                        setRoleDialog(null);
                        setTransferTarget(target);
                      }}
                    >
                      <ArrowRightLeft className="h-4 w-4" />
                      {tr("Chuyển dữ liệu ngay", "Transfer data now")}
                    </Button>
                  )}
                </div>
              )}

              <DialogFooter className="gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-[40px]"
                  disabled={roleDialog.saving}
                  onClick={() => setRoleDialog(null)}
                >
                  {vi.common.cancel}
                </Button>
                <Button
                  type="button"
                  className="min-h-[40px]"
                  disabled={roleDialog.saving}
                  onClick={() => void handleConfirmRoleChange()}
                >
                  {roleDialog.saving ? vi.common.saving : vi.common.confirm}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

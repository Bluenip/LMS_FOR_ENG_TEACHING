"use client";

import { Suspense, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetchJson } from "@/lib/api-client";
import { DriveAdminCard } from "@/components/drive/DriveAdminCard";
import { toast } from "sonner";
import {
  BookOpen,
  FileText,
  GraduationCap,
  Link2,
  Lock,
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
    _count: { classesTaught: number; enrollments: number; submissions: number };
  }>;
  parentLinks: Array<{
    id: string;
    relation: string | null;
    verifiedAt: string | null;
    parent: { id: string; name: string; email: string };
    student: { id: string; name: string; email: string };
  }>;
}

export default function AdminPortalPage() {
  const { m: vi, tr } = useI18n();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [selectedParentId, setSelectedParentId] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [relation, setRelation] = useState(tr("Phụ huynh", "Parent"));

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
  ) => {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? tr("Cập nhật thất bại", "Update failed"));
      return;
    }
    toast.success(tr("Đã cập nhật tài khoản!", "Account updated!"));
    queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
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
        relation,
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
                  </td>
                  <td className="px-6 py-3.5">
                    <select
                      value={u.role}
                      onChange={(e) =>
                        void handleUpdateUser(u.id, { role: e.target.value as Role })
                      }
                      className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold outline-none focus:border-[#4F46E5]"
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

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
    </div>
  );
}

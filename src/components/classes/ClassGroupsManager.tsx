"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Crown, Loader2, Plus, Shuffle, Trash2, UsersRound } from "lucide-react";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface GroupDTO {
  id: string;
  name: string;
  members: Array<{ studentId: string; name: string; isLeader: boolean }>;
}

/** Teacher tool for group assignments: create / auto-split / delete groups of the class. */
export function ClassGroupsManager({
  classId,
  students,
  canEdit,
}: {
  classId: string;
  students: Array<{ id: string; name: string }>;
  canEdit: boolean;
}) {
  const { tr } = useI18n();
  const qc = useQueryClient();
  const key = ["class-groups", classId];
  const { data } = useQuery<{ groups: GroupDTO[] }>({ queryKey: key, queryFn: () => apiFetchJson(`/api/classes/${classId}/groups`) });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [size, setSize] = useState("4");
  const [busy, setBusy] = useState(false);

  const grouped = new Set((data?.groups ?? []).flatMap((g) => g.members.map((m) => m.studentId)));
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const call = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Thao tác thất bại", "Action failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stitch-card space-y-3 p-4" data-testid="class-groups-manager">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-[#0B1C30] dark:text-slate-100">
          <UsersRound className="h-4 w-4 text-[#4F46E5]" /> {tr("Nhóm học tập", "Study groups")} ({data?.groups.length ?? 0})
        </h3>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <Input type="number" min={2} max={10} value={size} onChange={(e) => setSize(e.target.value)} className="h-9 w-16" aria-label={tr("Số HS mỗi nhóm", "Students per group")} />
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void call(
                  () =>
                    apiFetchJson(`/api/classes/${classId}/groups/auto-assign`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ groupSize: Number(size) || 4 }),
                    }),
                  tr("Đã chia nhóm ngẫu nhiên", "Groups created at random")
                )
              }
              data-testid="groups-auto-assign"
            >
              <Shuffle className="h-4 w-4" /> {tr("Chia ngẫu nhiên", "Random split")}
            </Button>
            <Button size="sm" onClick={() => setOpen(true)} data-testid="groups-create-open">
              <Plus className="h-4 w-4" /> {tr("Tạo nhóm", "New group")}
            </Button>
          </div>
        )}
      </div>
      {data && data.groups.length === 0 ? (
        <p className="text-xs text-slate-500">{tr("Chưa có nhóm. Nhóm dùng cho bài tập nhóm (mỗi nhóm nộp chung 1 bài).", "No groups yet. Groups are used for group assignments (one shared submission each).")}</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data?.groups.map((g) => (
            <li key={g.id} className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700" data-testid={`group-${g.id}`}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <b>{g.name}</b>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() =>
                      void call(
                        () => apiFetchJson(`/api/classes/${classId}/groups?groupId=${encodeURIComponent(g.id)}`, { method: "DELETE" }),
                        tr("Đã xoá nhóm", "Group deleted")
                      )
                    }
                    className="rounded p-1 text-slate-400 hover:text-red-600"
                    aria-label={tr("Xoá nhóm", "Delete group")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <ul className="space-y-0.5 text-xs text-slate-600 dark:text-slate-300">
                {g.members.map((m) => (
                  <li key={m.studentId} className="flex items-center gap-1">
                    {m.isLeader && <Crown className="h-3 w-3 text-amber-500" />} {m.name}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tr("Tạo nhóm", "New group")}</DialogTitle>
            <DialogDescription>{tr("HS đã có nhóm sẽ được chuyển sang nhóm mới. Người đầu tiên được chọn là nhóm trưởng.", "Students already in a group are moved. The first picked student is the leader.")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="group-name">{tr("Tên nhóm", "Group name")}</Label>
            <Input id="group-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </div>
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {students.map((s) => (
              <li key={s.id}>
                <label className="flex min-h-10 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={picked.includes(s.id)}
                    onChange={(e) => setPicked((prev) => (e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id)))}
                  />
                  {s.name}
                  {grouped.has(s.id) && <span className="text-xs text-slate-400">({tr("đã có nhóm", "in a group")})</span>}
                </label>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {tr("Huỷ", "Cancel")}
            </Button>
            <Button
              disabled={busy || !name.trim() || picked.length === 0}
              onClick={() =>
                void call(async () => {
                  await apiFetchJson(`/api/classes/${classId}/groups`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name, studentIds: picked, leaderId: picked[0] }),
                  });
                  setOpen(false);
                  setName("");
                  setPicked([]);
                }, tr("Đã tạo nhóm", "Group created"))
              }
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {tr("Tạo", "Create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetchJson } from "@/lib/api-client";
import { BellRing, Loader2, Mail } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

interface NotificationPrefsDTO {
  emailEnabled: boolean;
  emailAssignmentNew: boolean;
  emailDueReminder: boolean;
  emailWeeklyReport: boolean;
  pushEnabled: boolean;
  pushSubscriptionCount: number;
  vapidConfigured: boolean;
  smtpConfigured: boolean;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export function NotificationPreferencesSection() {
  const { tr } = useI18n();
  const queryClient = useQueryClient();
  const [pushBusy, setPushBusy] = useState(false);

  const { data, isLoading } = useQuery<{ preferences: NotificationPrefsDTO }>({
    queryKey: ["notification-preferences"],
    queryFn: () =>
      apiFetchJson(
        "/api/notifications/preferences",
        undefined,
        tr("Không tải được cài đặt thông báo", "Could not load notification settings")
      ),
  });

  const prefs = data?.preferences;

  const updatePref = async (patch: Partial<NotificationPrefsDTO>) => {
    try {
      const res = await apiFetchJson<{ preferences: NotificationPrefsDTO }>(
        "/api/notifications/preferences",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }
      );
      queryClient.setQueryData(["notification-preferences"], res);
      toast.success(tr("Đã lưu tuỳ chọn thông báo.", "Notification settings saved."));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Lỗi lưu cài đặt", "Failed"));
    }
  };

  const handleEnablePush = async () => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      toast.error(tr("Trình duyệt không hỗ trợ Web Push.", "Browser does not support Web Push."));
      return;
    }
    setPushBusy(true);
    try {
      const vapid = await apiFetchJson<{ configured: boolean; publicKey: string | null }>(
        "/api/notifications/push"
      );
      if (!vapid.configured || !vapid.publicKey) {
        toast.info(
          tr(
            "Máy chủ chưa cấu hình khoá VAPID (VAPID_PUBLIC_KEY).",
            "Server VAPID keys are not configured yet."
          )
        );
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        toast.error(tr("Bạn đã từ chối quyền thông báo trình duyệt.", "Notification permission denied."));
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid.publicKey),
      });
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error(tr("Không lấy được khoá đăng ký Push.", "Invalid push subscription keys."));
      }
      await apiFetchJson("/api/notifications/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        }),
      });
      toast.success(tr("Đã bật thông báo đẩy trên thiết bị này!", "Web Push enabled!"));
      await queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Không bật được Web Push", "Failed"));
    } finally {
      setPushBusy(false);
    }
  };

  const handleDisablePush = async () => {
    setPushBusy(true);
    try {
      await apiFetchJson("/api/notifications/push", { method: "DELETE" });
      toast.success(tr("Đã tắt thông báo đẩy trên thiết bị.", "Web Push disabled."));
      await queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Lỗi tắt Web Push", "Failed"));
    } finally {
      setPushBusy(false);
    }
  };

  return (
    <section className="stitch-card p-5 space-y-4" data-testid="notification-preferences-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-[#0B1C30] dark:text-slate-100">
            <BellRing className="h-4 w-4 text-[#4F46E5]" />
            {tr("Cài đặt thông báo Email & Web Push", "Email & Web Push Notification Settings")}
          </h2>
          <p className="text-xs text-slate-500">
            {tr(
              "Tuỳ chỉnh loại thông báo gửi qua Email hoặc đẩy trực tiếp về trình duyệt / PWA.",
              "Choose which updates arrive via Email or browser Web Push."
            )}
          </p>
        </div>
        {prefs && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <Badge variant={prefs.smtpConfigured ? "mint" : "neutral"}>
              {prefs.smtpConfigured ? tr("SMTP sẵn sàng", "SMTP ready") : tr("SMTP chưa cấu hình", "SMTP off")}
            </Badge>
            <Badge variant={prefs.vapidConfigured ? "mint" : "neutral"}>
              {prefs.vapidConfigured ? tr("Web Push sẵn sàng", "Push ready") : tr("VAPID chưa bật", "Push off")}
            </Badge>
          </div>
        )}
      </div>

      {isLoading || !prefs ? (
        <div className="flex items-center gap-2 py-4 text-xs text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          {tr("Đang tải…", "Loading…")}
        </div>
      ) : (
        <div className="space-y-3">
          <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
            <div className="flex items-center gap-2.5">
              <Mail className="h-4 w-4 text-[#4F46E5]" />
              <div>
                <p className="text-sm font-semibold text-[#0B1C30] dark:text-slate-100">
                  {tr("Nhận thông báo qua Email", "Receive email notifications")}
                </p>
                <p className="text-xs text-slate-400">
                  {tr("Bật/tắt toàn bộ email tự động gửi tới địa chỉ của bạn.", "Master toggle for all automated emails.")}
                </p>
              </div>
            </div>
            <Switch
              data-testid="pref-email-enabled"
              checked={prefs.emailEnabled}
              onCheckedChange={(v) => void updatePref({ emailEnabled: v })}
            />
          </label>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-xs">
              <span>{tr("Bài tập mới", "New assignments")}</span>
              <Switch
                data-testid="pref-email-new"
                checked={prefs.emailAssignmentNew}
                disabled={!prefs.emailEnabled}
                onCheckedChange={(v) => void updatePref({ emailAssignmentNew: v })}
              />
            </label>
            <label className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-xs">
              <span>{tr("Nhắc sắp hết hạn", "Due reminders")}</span>
              <Switch
                data-testid="pref-email-due"
                checked={prefs.emailDueReminder}
                disabled={!prefs.emailEnabled}
                onCheckedChange={(v) => void updatePref({ emailDueReminder: v })}
              />
            </label>
            <label className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-xs">
              <span>{tr("Báo cáo Chủ nhật 19h", "Weekly report")}</span>
              <Switch
                data-testid="pref-email-weekly"
                checked={prefs.emailWeeklyReport}
                disabled={!prefs.emailEnabled}
                onCheckedChange={(v) => void updatePref({ emailWeeklyReport: v })}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#F8F9FF] dark:bg-slate-800/60 p-3">
            <div className="text-xs">
              <p className="font-semibold text-[#0B1C30] dark:text-slate-100">
                {tr("Thông báo đẩy trình duyệt (Web Push)", "Browser Push Notifications")}
              </p>
              <p className="text-slate-500">
                {tr(
                  `Thiết bị đã đăng ký: ${prefs.pushSubscriptionCount}`,
                  `Registered devices: ${prefs.pushSubscriptionCount}`
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {prefs.pushEnabled && prefs.pushSubscriptionCount > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-9"
                  disabled={pushBusy}
                  onClick={() => void handleDisablePush()}
                >
                  {tr("Tắt Web Push", "Disable Push")}
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="accent"
                  className="min-h-9"
                  disabled={pushBusy}
                  data-testid="enable-web-push-btn"
                  onClick={() => void handleEnablePush()}
                >
                  {pushBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {tr("Bật thông báo đẩy", "Enable Push")}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

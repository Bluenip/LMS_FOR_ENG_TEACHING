import type { Metadata } from "next";
import Link from "next/link";
import { getI18n } from "@/lib/i18n/server";
import { getAppName } from "@/lib/utils";

export const metadata: Metadata = { title: "Privacy policy" };

/** Public privacy policy (required by the Google OAuth consent screen for Google Drive access). */
export default async function PrivacyPage() {
  const { tr } = await getI18n();
  const app = getAppName();
  const sections: Array<{ h: string; p: string[] }> = [
    {
      h: tr("1. Dữ liệu chúng tôi lưu", "1. Data we store"),
      p: [
        tr(
          "Thông tin tài khoản do quản trị viên hoặc giáo viên tạo (họ tên, email, vai trò), dữ liệu lớp học, bài tập, câu trả lời, điểm số và nhận xét.",
          "Account details created by an administrator or teacher (name, email, role), class data, assignments, answers, scores and feedback."
        ),
        tr(
          "Khi bài thi bật giám sát, hệ thống ghi các sự kiện (rời tab, thoát toàn màn hình…) theo giờ máy chủ. Nếu bật Camera AI, việc phân tích chạy ngay trên trình duyệt; chỉ ảnh bằng chứng nhỏ được lưu và chỉ giáo viên của lớp xem được, tự xoá sau tối đa 30 ngày.",
          "For proctored exams the system logs events (leaving the tab, exiting fullscreen…) with server time. With Camera AI enabled, analysis runs in the browser; only small evidence snapshots are stored, visible to the class teacher only, and deleted after at most 30 days."
        ),
      ],
    },
    {
      h: tr("2. Google Drive", "2. Google Drive"),
      p: [
        tr(
          `Khi quản trị viên hoặc giáo viên kết nối Google Drive, ${app} chỉ dùng quyền drive.file: ứng dụng chỉ thấy và quản lý các file do chính ứng dụng tạo ra hoặc file bạn chủ động chọn. ${app} không đọc các file khác trong Drive của bạn.`,
          `When an administrator or teacher connects Google Drive, ${app} only uses the drive.file scope: it can only see and manage files it created or files you explicitly pick. ${app} does not read any other file in your Drive.`
        ),
        tr(
          "File được lưu ở chế độ riêng tư trong thư mục EngClass; refresh token được mã hoá (AES-256-GCM) và có thể thu hồi bất cứ lúc nào bằng nút Ngắt kết nối hoặc trong cài đặt tài khoản Google.",
          "Files are stored privately in the EngClass folder; the refresh token is encrypted (AES-256-GCM) and can be revoked at any time with Disconnect or from your Google Account settings."
        ),
        tr(
          "Việc sử dụng dữ liệu nhận từ Google API tuân thủ Google API Services User Data Policy, bao gồm các yêu cầu Limited Use.",
          "Use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements."
        ),
      ],
    },
    {
      h: tr("3. Chia sẻ dữ liệu", "3. Data sharing"),
      p: [
        tr(
          "Chúng tôi không bán hay chia sẻ dữ liệu cho bên thứ ba và không dùng dữ liệu để quảng cáo. Phụ huynh chỉ xem được dữ liệu của con mình.",
          "We do not sell or share data with third parties and do not use it for advertising. Parents can only see their own child's data."
        ),
      ],
    },
    {
      h: tr("4. Liên hệ & xoá dữ liệu", "4. Contact & deletion"),
      p: [
        tr(
          "Để xem, sửa hoặc xoá dữ liệu, vui lòng liên hệ giáo viên hoặc quản trị viên của trường.",
          "To access, correct or delete your data, contact your teacher or the school administrator."
        ),
      ],
    },
  ];

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-bold text-[#0B1C30]">
        {tr("Chính sách quyền riêng tư", "Privacy policy")} — {app}
      </h1>
      <p className="mt-1 text-xs text-[#464555]">{tr("Cập nhật: 24/11/2026", "Updated: 24 Nov 2026")}</p>
      <div className="mt-8 space-y-6">
        {sections.map((s) => (
          <section key={s.h} className="space-y-2">
            <h2 className="text-base font-bold text-[#0B1C30]">{s.h}</h2>
            {s.p.map((t, i) => (
              <p key={i} className="text-sm leading-relaxed text-[#464555]">
                {t}
              </p>
            ))}
          </section>
        ))}
      </div>
      <Link href="/login" className="mt-10 inline-block text-sm font-semibold text-[#4F46E5] hover:underline">
        ← {tr("Về trang đăng nhập", "Back to sign in")}
      </Link>
    </main>
  );
}

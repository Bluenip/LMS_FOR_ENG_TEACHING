"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Award,
  BookOpen,
  Camera,
  Check,
  CheckCircle2,
  Cloud,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Headphones,
  KeyRound,
  Layers,
  Lock,
  Radio,
  Shield,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
  Volume2,
  XCircle,
} from "lucide-react";
import { PivoraLogo } from "@/components/brand/PivoraLogo";
import { ThemeLangToggle } from "@/components/layout/ThemeLangToggle";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

type PreviewTab = "worksheet" | "dictation" | "proctor";

export function LandingPage({ appName }: { appName: string }) {
  const { tr } = useI18n();
  const [previewTab, setPreviewTab] = useState<PreviewTab>("worksheet");
  const [selectedChoice, setSelectedChoice] = useState<"A" | "B" | "C">("B");

  const features = [
    {
      icon: FileText,
      tone: "indigo" as const,
      title: tr("Worksheet PDF tương tác & Nhập từ Word", "Interactive PDF worksheets & Word import"),
      desc: tr(
        "Vẽ ô trả lời trực tiếp trên file PDF, tự động tách câu điền từ từ file Word (.docx) với cú pháp __đáp án__, hỗ trợ 9 dạng câu hỏi và chế độ học thuộc 1 câu/màn hình.",
        "Draw answer boxes directly over PDFs or auto-generate fill-in-the-blank exercises from Word (.docx) with __answer__ syntax. Supports 9 question types and 1-question focus mode."
      ),
    },
    {
      icon: Headphones,
      tone: "sky" as const,
      title: tr("Bài nghe giới hạn lượt & Chép chính tả", "Controlled listening & smart dictation"),
      desc: tr(
        "Giới hạn số lần nghe xác thực từ máy chủ, tuỳ chọn chặn dừng/tua cho bài kiểm tra và tự động chấm chép chính tả từng từ theo phần trăm chính xác.",
        "Server-enforced play limits with optional pause/seek lock for listening tests, plus automatic word-by-word dictation grading with clear diff highlights."
      ),
    },
    {
      icon: ShieldCheck,
      tone: "orange" as const,
      title: tr("Chống gian lận 2 lớp & Phòng thi Live", "Two-layer proctoring & Live exam room"),
      desc: tr(
        "Theo dõi rời tab, thoát toàn màn hình, chặn sao chép/kéo thả và giám sát phòng thi trực tiếp thời gian thực, kết hợp Camera AI chạy cục bộ trên trình duyệt.",
        "Detect tab switching and fullscreen exits, block copy/paste and drag-drop, monitor students in real time, and optionally enable on-device browser Camera AI."
      ),
    },
    {
      icon: Cloud,
      tone: "mint" as const,
      title: tr("Kho bài giảng dùng chung & Google Drive", "Shared library & Google Drive sync"),
      desc: tr(
        "Soạn bài giảng một lần, dùng cho nhiều lớp; lưu PDF, file nghe và tài liệu trực tiếp lên Google Drive kèm Thùng rác đồng bộ 2 chiều trong 30 ngày.",
        "Create lessons once and attach them to any class. Store PDFs, audio, and backups on Google Drive with two-way 30-day trash synchronization."
      ),
    },
    {
      icon: Award,
      tone: "purple" as const,
      title: tr("Chấm tự động, Thống kê & Bảng xếp hạng", "Auto-grading, analytics & leaderboards"),
      desc: tr(
        "Chấm tự động ngay khi nộp bài, chấm tay câu tự luận, xem tỉ lệ đúng từng câu, xuất bảng điểm Excel và tạo động lực bằng bảng xếp hạng lớp.",
        "Instant grading on objective questions, manual essay scoring, per-question accuracy insights, one-click Excel gradebook export, and class leaderboards."
      ),
    },
    {
      icon: FileSpreadsheet,
      tone: "indigo" as const,
      title: tr("Sao lưu 1 chạm & Chia sẻ giáo viên", "One-click backups & teacher sharing"),
      desc: tr(
        "Đóng gói đầy đủ câu hỏi, PDF và file nghe thành gói .engclass.zip, xuất đề Word bản có hoặc không đáp án, và chia sẻ trực tiếp giữa các giáo viên trong hệ thống.",
        "Export complete worksheets (questions, PDF, audio) as .engclass.zip bundles, generate printable Word sheets, and share reusable materials across teachers."
      ),
    },
  ];

  const roles = [
    {
      icon: BookOpen,
      tone: "indigo" as const,
      role: tr("Giáo viên", "Teachers"),
      summary: tr("Soạn bài nhanh, chấm nhẹ tay, kiểm soát trọn vẹn lớp học.", "Author faster, grade effortlessly, stay in full control."),
      points: [
        tr("Biến PDF và Word thành bài tập tương tác trong vài phút", "Turn PDFs and Word files into interactive tests in minutes"),
        tr("Giao bài cùng lúc nhiều lớp, tuỳ chỉnh hạn nộp và chống gian lận", "Assign across classes with custom timing and exam rules"),
        tr("Giám sát phòng thi Live và xuất bảng điểm Excel", "Watch Live exam rooms and export Excel gradebooks"),
      ],
    },
    {
      icon: GraduationCap,
      tone: "mint" as const,
      role: tr("Học sinh", "Students"),
      summary: tr("Làm bài tập trung, xem điểm và chữa lỗi rõ ràng trên mọi thiết bị.", "Focused test taking and instant feedback on any device."),
      points: [
        tr("Làm bài trực tiếp trên PDF, phiếu trả lời hoặc từng câu tập trung", "Complete worksheets over PDF, answer sheets, or focus cards"),
        tr("Tự động lưu đáp án theo thời gian thực, không lo mất bài", "Real-time autosave prevents lost work on unstable connections"),
        tr("Xem đáp án, đối chiếu từng từ chép chính tả và thứ hạng lớp", "Review answers, word-level dictation diffs, and class rankings"),
      ],
    },
    {
      icon: Users,
      tone: "orange" as const,
      role: tr("Phụ huynh", "Parents"),
      summary: tr("Đồng hành cùng tiến độ học tập của con một cách minh bạch.", "Stay informed on your child's progress privately."),
      points: [
        tr("Liên kết riêng tư với tài khoản học sinh bằng mã xác nhận", "Private link to your child's account via one-time code"),
        tr("Theo dõi bài tập sắp đến hạn, điểm số và nhận xét của giáo viên", "Track upcoming deadlines, grades, and teacher feedback"),
        tr("Chỉ hiển thị dữ liệu của con, tuyệt đối tách biệt học sinh khác", "Strictly scoped to your own child's records only"),
      ],
    },
    {
      icon: UserCheck,
      tone: "sky" as const,
      role: tr("Quản trị viên", "Administrators"),
      summary: tr("Quản lý người dùng, lưu trữ và vận hành hệ thống an toàn.", "Manage accounts, shared storage, and operations safely."),
      points: [
        tr("Cấp tài khoản theo vai trò, nhập danh sách hàng loạt và bật 2FA", "Provision accounts, bulk import rosters, and enforce 2FA"),
        tr("Kết nối Google Drive dùng chung của trường và theo dõi dung lượng", "Connect school-wide Google Drive storage and monitor quota"),
        tr("Theo dõi nhật ký thao tác và báo cáo lỗi tập trung", "Inspect audit trails and centralized error logs"),
      ],
    },
  ];

  const securityItems = [
    {
      icon: KeyRound,
      title: tr("Cấp tài khoản nội bộ & Bảo mật 2FA", "Managed accounts & 2FA"),
      desc: tr(
        "Hệ thống tắt tự đăng ký công khai; mọi tài khoản do giáo viên hoặc quản trị viên cấp, hỗ trợ xác thực 2 bước (TOTP) và tự đăng xuất thiết bị cũ khi đổi mật khẩu.",
        "Public self-registration is disabled. Accounts are issued by teachers or admins, with TOTP two-factor authentication and automatic session invalidation on password change."
      ),
    },
    {
      icon: Lock,
      title: tr("Google Drive tối giản quyền (drive.file)", "Minimal Google Drive scope (drive.file)"),
      desc: tr(
        "Ứng dụng chỉ nhìn thấy các file do chính mình tạo ra, không đọc file cá nhân khác. Refresh token được mã hoá AES-256-GCM và có thể thu hồi bất cứ lúc nào.",
        "Only accesses files created by the app—never your other Drive files. Refresh tokens are encrypted with AES-256-GCM and revocable at any time."
      ),
    },
    {
      icon: Camera,
      title: tr("Camera AI xử lý 100% trên trình duyệt", "100% on-device browser Camera AI"),
      desc: tr(
        "Phân tích hình ảnh chạy cục bộ bằng WebAssembly, không stream video về máy chủ. Học sinh cần đồng ý trước khi thi; ảnh bằng chứng nhỏ chỉ giáo viên lớp thấy và tự xoá sau 30 ngày.",
        "Vision models run locally via WebAssembly with zero video streaming. Requires explicit consent; small evidence snapshots are visible only to the class teacher and auto-purged after 30 days."
      ),
    },
  ];

  const toneBadgeClass = {
    indigo: "bg-[#EEF2FF] text-[#4F46E5]",
    sky: "bg-[#E0F2FE] text-[#0369A1]",
    orange: "bg-[#FFEDD5] text-[#EA580C]",
    mint: "bg-[#DCFCE7] text-[#15803D]",
    purple: "bg-[#EDE9FE] text-[#6D28D9]",
  } as const;

  const mcqOptions: Array<{ key: "A" | "B" | "C"; label: string; correct: boolean }> = [
    { key: "A", label: "apply", correct: false },
    { key: "B", label: "to apply", correct: true },
    { key: "C", label: "applying", correct: false },
  ];

  const isChoiceCorrect = selectedChoice === "B";

  return (
    <div className="min-h-screen overflow-x-clip bg-[#F8F9FF] text-[#0B1C30]">
      {/* Sticky Top Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-[#F8F9FF]/85 backdrop-blur-md dark:bg-[#0B1220]/85">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <PivoraLogo name={appName} markClassName="h-8 w-8" textClassName="text-lg" />
            <span className="hidden rounded-full bg-[#E2DFFF] px-2 py-0.5 text-[11px] font-bold text-[#3525CD] sm:inline-flex">
              LMS
            </span>
          </Link>

          <nav
            aria-label={tr("Điều hướng trang chủ", "Landing navigation")}
            className="hidden items-center gap-6 text-sm font-medium text-[#464555] md:flex"
          >
            <a href="#features" className="transition hover:text-[#0B1C30]">
              {tr("Tính năng", "Features")}
            </a>
            <a href="#roles" className="transition hover:text-[#0B1C30]">
              {tr("Dành cho ai", "Who it's for")}
            </a>
            <a href="#security" className="transition hover:text-[#0B1C30]">
              {tr("Bảo mật & Drive", "Security & Drive")}
            </a>
          </nav>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <ThemeLangToggle />
            <Button asChild size="sm" className="h-9 rounded-full px-4">
              <Link href="/login">
                {tr("Đăng nhập", "Sign in")}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="relative pb-16 pt-10 sm:pb-24 sm:pt-16">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_at_top,rgba(79,70,229,0.11),transparent_65%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.18),transparent_65%)]"
          />

          <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:gap-12">
            {/* Left Value Proposition */}
            <div className="lg:col-span-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200/80 bg-[#EEF2FF] px-3.5 py-1.5 text-xs font-semibold text-[#3525CD]">
                <Sparkles className="h-3.5 w-3.5" />
                <span>
                  {tr(
                    "Nền tảng số hóa bài tập & lớp học tương tác đa môn",
                    "Multi-subject interactive learning & worksheet LMS"
                  )}
                </span>
              </div>

              <h1 className="mt-5 text-3xl font-extrabold leading-[1.14] tracking-tight text-[#0B1C30] [text-wrap:balance] sm:text-5xl">
                {tr(
                  "Dạy và học hiệu quả với phiếu bài tập tương tác",
                  "Teach & learn better with interactive worksheets"
                )}
              </h1>

              <p className="mt-4 max-w-xl text-base leading-relaxed text-[#464555] sm:text-lg">
                {tr(
                  "Phù hợp cho mọi môn học từ Toán, Khoa học, Ngữ văn đến Ngoại ngữ: biến PDF và Word thành bài tập trực tuyến, chấm điểm tự động, chống gian lận 2 lớp và đồng bộ Google Drive.",
                  "Built for any subject—Math, Sciences, Literature, and Languages: turn PDFs and Word documents into interactive online exercises with automatic grading, two-layer proctoring, and Google Drive storage."
                )}
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Button asChild size="lg" className="h-12 rounded-xl px-6 text-base">
                  <Link href="/login">
                    {tr("Đăng nhập vào hệ thống", "Sign in to workspace")}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-12 rounded-xl px-5 text-base">
                  <a href="#features">{tr("Xem tính năng", "Explore features")}</a>
                </Button>
              </div>

              <div className="mt-8 flex flex-wrap gap-2">
                {[
                  tr("9 dạng câu hỏi", "9 question types"),
                  tr("Chép chính tả chấm từng từ", "Word-level dictation"),
                  tr("Camera AI cục bộ", "On-device Camera AI"),
                  tr("Đồng bộ Google Drive", "Google Drive sync"),
                ].map((chip) => (
                  <span
                    key={chip}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white px-3 py-1 text-xs font-medium text-[#464555]"
                  >
                    <Check className="h-3.5 w-3.5 text-[#10B981]" />
                    {chip}
                  </span>
                ))}
              </div>
            </div>

            {/* Right Interactive Product Preview */}
            <div className="lg:col-span-6">
              <div className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-xl shadow-indigo-950/5 sm:p-6">
                {/* Preview Switcher Tabs */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3.5">
                  <div
                    role="tablist"
                    aria-label={tr("Xem trước tính năng", "Interactive product preview")}
                    className="inline-flex rounded-xl bg-[#EFF4FF] p-1"
                  >
                    {(
                      [
                        { id: "worksheet", label: tr("Phiếu bài tập", "Worksheet") },
                        { id: "dictation", label: tr("Chép chính tả", "Dictation") },
                        { id: "proctor", label: tr("Phòng thi Live", "Live exam") },
                      ] as const
                    ).map((tab) => {
                      const active = previewTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => setPreviewTab(tab.id)}
                          className={cn(
                            "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                            active
                              ? "bg-white text-[#3525CD] shadow-sm"
                              : "text-[#464555] hover:text-[#0B1C30]"
                          )}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#DCFCE7] px-2.5 py-0.5 text-[11px] font-semibold text-[#15803D]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                    {tr("Dùng thử nhanh", "Interactive")}
                  </span>
                </div>

                {/* Tab 1: Worksheet Interactive Preview */}
                {previewTab === "worksheet" && (
                  <div className="mt-4 space-y-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-[#0B1C30]">
                          Unit 7: The World of Work — Worksheet #01
                        </p>
                        <p className="text-xs text-[#464555]">
                          {tr("Tự động chấm điểm · Có file nghe kèm theo", "Auto-graded · Includes listening audio")}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-[#EEF2FF] px-2.5 py-1 text-xs font-bold text-[#4F46E5] tabular-nums">
                        {isChoiceCorrect ? "2.0 / 2.0" : "1.0 / 2.0"}
                      </span>
                    </div>

                    {/* Mini listening strip */}
                    <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-[#F8F9FF] px-3.5 py-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#4F46E5] text-white">
                        <Volume2 className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-[#0B1C30]">
                          <span className="truncate">Track 01 — Job Interview.mp3</span>
                          <span className="shrink-0 text-[#4F46E5] tabular-nums">
                            {tr("1/2 lượt", "1/2 plays")}
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                          <div className="h-full w-3/5 rounded-full bg-[#4F46E5]" />
                        </div>
                      </div>
                    </div>

                    {/* Question 1 */}
                    <div className="rounded-xl border border-slate-100 bg-[#F8F9FF] p-3.5">
                      <div className="flex items-center justify-between text-xs font-semibold text-[#4F46E5]">
                        <span>Question 1 · {tr("Điền từ", "Fill-in-the-blank")}</span>
                        <span className="text-slate-400">{tr("1.0 điểm", "1.0 pt")}</span>
                      </div>
                      <p className="mt-2 text-sm leading-loose text-[#0B1C30]">
                        She{" "}
                        <span className="inline-flex items-center gap-1 rounded-lg border-2 border-[#4F46E5] bg-white px-2.5 py-0.5 font-semibold text-[#3525CD]">
                          has lived
                          <CheckCircle2 className="h-3.5 w-3.5 text-[#10B981]" />
                        </span>{" "}
                        in Hanoi since 2018.
                      </p>
                    </div>

                    {/* Question 2 (Clickable!) */}
                    <div className="rounded-xl border border-slate-100 bg-[#F8F9FF] p-3.5">
                      <div className="flex items-center justify-between text-xs font-semibold text-[#4F46E5]">
                        <span>Question 2 · {tr("Thử chọn đáp án", "Try clicking an option")}</span>
                        <span className="text-slate-400">{tr("1.0 điểm", "1.0 pt")}</span>
                      </div>
                      <p className="mt-1.5 text-sm text-[#0B1C30]">
                        He decided ______ for the internship after graduation.
                      </p>
                      <div className="mt-2.5 grid grid-cols-3 gap-2 text-xs">
                        {mcqOptions.map((opt) => {
                          const picked = selectedChoice === opt.key;
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              aria-pressed={picked}
                              onClick={() => setSelectedChoice(opt.key)}
                              className={cn(
                                "flex items-center justify-between rounded-lg border px-2.5 py-2 text-left font-medium transition",
                                picked && opt.correct
                                  ? "border-2 border-[#10B981] bg-[#DCFCE7] font-semibold text-[#15803D]"
                                  : picked && !opt.correct
                                    ? "border-2 border-red-400 bg-[#FEF2F2] font-semibold text-[#BA1A1A]"
                                    : "border-slate-200 bg-white text-[#464555] hover:border-indigo-200"
                              )}
                            >
                              <span className="truncate">
                                {opt.key}. {opt.label}
                              </span>
                              {picked &&
                                (opt.correct ? (
                                  <CheckCircle2 className="ml-1 h-3.5 w-3.5 shrink-0 text-[#10B981]" />
                                ) : (
                                  <XCircle className="ml-1 h-3.5 w-3.5 shrink-0 text-[#BA1A1A]" />
                                ))}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 2: Dictation Word-Level Grading */}
                {previewTab === "dictation" && (
                  <div className="mt-4 space-y-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-[#0B1C30]">
                          {tr("Chấm chép chính tả từng từ", "Word-by-word dictation grading")}
                        </p>
                        <p className="text-xs text-[#464555]">
                          {tr(
                            "So khớp Levenshtein theo % từ đúng, chặn dán & kiểm tra chính tả",
                            "Levenshtein word matching by accuracy %, paste & spellcheck blocked"
                          )}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-[#DCFCE7] px-2.5 py-1 text-xs font-bold text-[#15803D] tabular-nums">
                        1.6 / 2.0
                      </span>
                    </div>

                    <div className="rounded-xl border border-slate-100 bg-[#F8F9FF] p-4">
                      <p className="text-xs font-semibold text-[#4F46E5]">
                        {tr("Đối chiếu kết quả bài làm", "Answer diff comparison")}
                      </p>
                      <p className="mt-2.5 flex flex-wrap items-center gap-1.5 text-sm leading-relaxed">
                        {["Many", "young", "people", "prefer"].map((w) => (
                          <span
                            key={w}
                            className="rounded-md bg-[#DCFCE7] px-2 py-0.5 font-medium text-[#15803D]"
                          >
                            {w}
                          </span>
                        ))}
                        <span className="rounded-md bg-[#FEF2F2] px-2 py-0.5 font-medium text-[#BA1A1A] line-through">
                          apply
                        </span>
                        <span className="rounded-md bg-[#EEF2FF] px-2 py-0.5 font-semibold text-[#3525CD]">
                          applying
                        </span>
                        <span className="rounded-md border border-dashed border-amber-300 bg-amber-50 px-2 py-0.5 font-medium text-amber-800">
                          [for]
                        </span>
                        {["remote", "jobs."].map((w) => (
                          <span
                            key={w}
                            className="rounded-md bg-[#DCFCE7] px-2 py-0.5 font-medium text-[#15803D]"
                          >
                            {w}
                          </span>
                        ))}
                      </p>

                      <div className="mt-4 flex flex-wrap gap-3 border-t border-slate-200/80 pt-3 text-[11px] font-medium text-[#464555]">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-sm bg-[#10B981]" />
                          {tr("Từ đúng (6/8)", "Correct (6/8)")}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-sm bg-[#BA1A1A]" />
                          {tr("Từ sai / thừa", "Wrong / extra")}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
                          {tr("[Từ thiếu]", "[Missing]")}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-[#F8F9FF] px-3.5 py-2.5 text-xs text-[#464555]">
                      <span className="inline-flex items-center gap-1.5 font-medium text-[#0B1C30]">
                        <Shield className="h-4 w-4 text-[#4F46E5]" />
                        {tr("Transcript luôn ẩn cho đến khi được mở đáp án", "Transcript stays hidden until review is allowed")}
                      </span>
                    </div>
                  </div>
                )}

                {/* Tab 3: Live Exam Proctoring */}
                {previewTab === "proctor" && (
                  <div className="mt-4 space-y-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-bold text-[#0B1C30]">
                          {tr("Phòng giám sát trực tiếp (SSE)", "Live proctoring room (SSE)")}
                        </p>
                        <p className="text-xs text-[#464555]">
                          {tr("Cập nhật theo thời gian thực · Nhắc nhở, khoá hoặc thu bài", "Real-time telemetry · Warn, lock, or force-submit")}
                        </p>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#FFEDD5] px-2.5 py-1 text-[11px] font-bold text-[#EA580C]">
                        <Radio className="h-3 w-3" />
                        LIVE
                      </span>
                    </div>

                    <div className="space-y-2">
                      {[
                        {
                          name: "Nguyễn Văn Minh",
                          detail: tr("14/20 câu · Toàn màn hình", "14/20 answered · Fullscreen"),
                          badge: tr("Bình thường", "Normal"),
                          badgeCls: "bg-[#DCFCE7] text-[#15803D]",
                        },
                        {
                          name: "Trần Thảo Nhi",
                          detail: tr("Đã nộp bài · 9.5/10 điểm", "Submitted · 9.5/10 pts"),
                          badge: tr("Hoàn thành", "Done"),
                          badgeCls: "bg-[#EEF2FF] text-[#3525CD]",
                        },
                        {
                          name: "Lê Quốc Bảo",
                          detail: tr("11/20 câu · Rời tab 1 lần", "11/20 answered · 1 tab switch"),
                          badge: tr("Cần chú ý", "Warning"),
                          badgeCls: "bg-amber-50 text-amber-800",
                        },
                      ].map((row) => (
                        <div
                          key={row.name}
                          className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-[#F8F9FF] px-3.5 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#0B1C30]">{row.name}</p>
                            <p className="truncate text-xs text-[#464555]">{row.detail}</p>
                          </div>
                          <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold", row.badgeCls)}>
                            {row.badge}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 rounded-xl border border-indigo-100 bg-[#EEF2FF]/70 px-3.5 py-2.5 text-xs text-[#3525CD]">
                      <Camera className="h-4 w-4 shrink-0" />
                      <span>
                        {tr(
                          "Camera AI chạy trực tiếp trên trình duyệt học sinh, không truyền video về server.",
                          "Camera AI runs on-device in the student's browser—never streams video to the server."
                        )}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Core Features Grid */}
        <section id="features" className="scroll-mt-20 border-t border-slate-200/80 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-wider text-[#4F46E5]">
                {tr("Tính năng cốt lõi", "Core capabilities")}
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-[#0B1C30] [text-wrap:balance] sm:text-3xl">
                {tr(
                  "Mọi công cụ cần thiết cho một lớp học hiện đại",
                  "Everything you need to run a modern classroom"
                )}
              </h2>
              <p className="mt-2.5 text-sm leading-relaxed text-[#464555] sm:text-base">
                {tr(
                  "Từ soạn đề PDF/Word, kiểm tra chống gian lận, bài nghe & chép chính tả cho môn ngoại ngữ đến lưu trữ Google Drive — tất cả gọn gàng trên một nền tảng duy nhất.",
                  "From PDF/Word authoring and proctored exams to listening & dictation for language classes and Google Drive storage—built together in one cohesive workspace."
                )}
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="stitch-card-hover flex flex-col p-6">
                    <span
                      className={cn(
                        "flex h-11 w-11 items-center justify-center rounded-2xl",
                        toneBadgeClass[item.tone]
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 text-base font-bold text-[#0B1C30]">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#464555]">{item.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* 4 Roles Section */}
        <section id="roles" className="scroll-mt-20 border-t border-slate-200/80 bg-[#EFF4FF]/60 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-wider text-[#4F46E5]">
                {tr("Thiết kế theo vai trò", "Built for every role")}
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-[#0B1C30] [text-wrap:balance] sm:text-3xl">
                {tr(
                  "Bốn không gian làm việc riêng biệt, dữ liệu luôn đồng bộ",
                  "Four dedicated workspaces, always in sync"
                )}
              </h2>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {roles.map((r) => {
                const Icon = r.icon;
                return (
                  <div key={r.role} className="stitch-card flex flex-col p-5">
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                          toneBadgeClass[r.tone]
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <h3 className="text-base font-bold text-[#0B1C30]">{r.role}</h3>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-[#464555]">{r.summary}</p>
                    <ul className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-xs text-[#0B1C30]">
                      {r.points.map((pt) => (
                        <li key={pt} className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#10B981]" />
                          <span className="leading-relaxed">{pt}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Security & Privacy Section */}
        <section id="security" className="scroll-mt-20 border-t border-slate-200/80 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-wider text-[#4F46E5]">
                {tr("Bảo mật & Quyền riêng tư", "Security & Privacy")}
              </p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-[#0B1C30] [text-wrap:balance] sm:text-3xl">
                {tr(
                  "Riêng tư theo thiết kế cho nhà trường và học sinh",
                  "Private by design for schools and students"
                )}
              </h2>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
              {securityItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="stitch-card p-6">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#4F46E5]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-4 text-base font-bold text-[#0B1C30]">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#464555]">{item.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="pb-16 pt-4 sm:pb-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="relative overflow-hidden rounded-3xl border border-indigo-200/80 bg-white p-8 shadow-sm sm:p-10">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(79,70,229,0.16),transparent_70%)] dark:bg-[radial-gradient(circle,rgba(99,102,241,0.24),transparent_70%)]"
              />
              <div className="relative flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
                <div className="max-w-xl">
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#4F46E5]">
                    <Layers className="h-4 w-4" />
                    <span>{appName} LMS</span>
                  </div>
                  <h2 className="mt-2 text-2xl font-bold tracking-tight text-[#0B1C30] [text-wrap:balance] sm:text-3xl">
                    {tr(
                      "Sẵn sàng vào lớp học của bạn?",
                      "Ready to enter your classroom?"
                    )}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-[#464555]">
                    {tr(
                      "Đăng nhập bằng tài khoản do giáo viên hoặc quản trị viên cấp để bắt đầu giảng dạy, làm bài hoặc theo dõi kết quả học tập.",
                      "Sign in with the account issued by your teacher or school administrator to start teaching, completing assignments, or checking progress."
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-3">
                  <Button asChild size="lg" className="h-12 rounded-xl px-6 text-base">
                    <Link href="/login">
                      {tr("Đăng nhập ngay", "Sign in now")}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Compact Footer */}
      <footer className="border-t border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-6 text-xs text-[#464555] sm:flex-row sm:px-6">
          <div className="flex items-center gap-2.5">
            <PivoraLogo name={appName} markClassName="h-6 w-6" textClassName="text-sm" />
            <span className="text-slate-300">·</span>
            <span>
              {tr(
                "Hệ thống học tập & phiếu bài tập tương tác đa môn",
                "Multi-subject interactive learning & worksheet platform"
              )}
            </span>
          </div>
          <div className="flex items-center gap-5 font-medium">
            <Link href="/login" className="transition hover:text-[#4F46E5]">
              {tr("Đăng nhập", "Sign in")}
            </Link>
            <Link href="/privacy" className="transition hover:text-[#4F46E5]">
              {tr("Quyền riêng tư", "Privacy policy")}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

import { NextResponse } from "next/server";
import { AppError, handleApiError, requireTeacherOfClass } from "@/lib/permissions";
import { createAccountSchema } from "@/lib/validators";
import { createAccount } from "@/server/accountService";

/** Teacher (or admin) creates a STUDENT enrolled in this class, or a PARENT linked to a student of this class. */
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { user, cls } = await requireTeacherOfClass(id);
    const data = createAccountSchema.parse(await req.json());
    if (data.role !== "STUDENT" && data.role !== "PARENT") {
      throw new AppError("Chỉ tạo được tài khoản Học sinh hoặc Phụ huynh tại đây.", 400, "INVALID_ROLE");
    }
    // Admins acting inside a class follow the same class-scoped rules as the class teacher
    const actor = user.role === "ADMIN" ? { id: cls.teacherId, role: "TEACHER" as const } : user;
    const result = await createAccount(actor, { ...data, classId: cls.id });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

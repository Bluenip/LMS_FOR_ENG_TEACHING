import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";

export interface RegisterInput {
  name: string;
  email: string;
  phone?: string;
  password: string;
  role: Extract<Role, "TEACHER" | "STUDENT" | "PARENT">;
}

export async function registerUser(input: RegisterInput) {
  const existingEmail = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existingEmail) {
    throw new AppError("Email này đã được đăng ký.", 409, "EMAIL_EXISTS");
  }

  if (input.phone) {
    const existingPhone = await prisma.user.findUnique({
      where: { phone: input.phone },
      select: { id: true },
    });
    if (existingPhone) {
      throw new AppError("Số điện thoại này đã được đăng ký.", 409, "PHONE_EXISTS");
    }
  }

  const passwordHash = await bcrypt.hash(input.password, 10);

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      passwordHash,
      role: input.role,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
    },
  });

  return user;
}

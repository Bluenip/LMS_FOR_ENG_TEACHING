import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { getHomeForRole } from "@/lib/utils";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl } = req;
  const pathname = nextUrl.pathname;
  const session = req.auth;
  const userRole = session?.user?.role;

  const isAuthRoute = pathname === "/login" || pathname === "/register";
  const isTeacherRoute = pathname === "/teacher" || pathname.startsWith("/teacher/");
  const isStudentRoute = pathname === "/student" || pathname.startsWith("/student/");
  const isParentRoute = pathname === "/parent" || pathname.startsWith("/parent/");
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const isProtected = isTeacherRoute || isStudentRoute || isParentRoute || isAdminRoute;

  const allowStaleLogin = pathname === "/login" && nextUrl.searchParams.has("reason");

  if (isAuthRoute && userRole && !allowStaleLogin) {
    return NextResponse.redirect(new URL(getHomeForRole(userRole), nextUrl));
  }

  if (isProtected && !userRole) {
    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("callbackUrl", pathname + nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  if (userRole) {
    if (isAdminRoute && userRole !== "ADMIN") {
      return NextResponse.redirect(new URL(getHomeForRole(userRole), nextUrl));
    }
    if (isTeacherRoute && userRole !== "TEACHER" && userRole !== "ADMIN") {
      return NextResponse.redirect(new URL(getHomeForRole(userRole), nextUrl));
    }
    if (isStudentRoute && userRole !== "STUDENT") {
      return NextResponse.redirect(new URL(getHomeForRole(userRole), nextUrl));
    }
    if (isParentRoute && userRole !== "PARENT") {
      return NextResponse.redirect(new URL(getHomeForRole(userRole), nextUrl));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/login",
    "/register",
    "/teacher/:path*",
    "/student/:path*",
    "/parent/:path*",
    "/admin/:path*",
  ],
};

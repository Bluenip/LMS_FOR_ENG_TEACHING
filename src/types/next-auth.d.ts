import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      issuedAt?: number;
    } & DefaultSession["user"];
  }

  interface User {
    role?: Role;
  }
}

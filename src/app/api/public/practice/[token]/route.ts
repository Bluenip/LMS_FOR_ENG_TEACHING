import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/permissions";
import { submitPublicPracticeSchema } from "@/lib/validators";
import {
  getPublicPracticeByToken,
  submitPublicPracticeAttempt,
} from "@/server/publicPracticeService";

export async function GET(
  _req: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const data = await getPublicPracticeByToken(token);
    return NextResponse.json({ practice: data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const data = submitPublicPracticeSchema.parse(await req.json());
    const result = await submitPublicPracticeAttempt(token, data);
    return NextResponse.json({ result }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

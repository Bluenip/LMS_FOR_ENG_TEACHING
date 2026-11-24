import { handleApiError, requireAuth } from "@/lib/permissions";
import { streamDriveFileForUser } from "@/server/driveService";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await context.params;
    return await streamDriveFileForUser(user, id, req.headers.get("range"), true);
  } catch (error) {
    return handleApiError(error);
  }
}

import type { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/db";
import { getStorageProvider } from "../src/lib/storage";

async function main() {
  const daysRaw = Number(process.env.PROCTOR_SNAPSHOT_RETENTION_DAYS || "30");
  const retentionDays = Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : 30;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  console.log(
    `Purging camera proctor snapshots older than ${retentionDays} days (before ${cutoff.toISOString()})...`
  );

  const events = await prisma.proctorEvent.findMany({
    where: {
      at: { lt: cutoff },
      type: {
        in: [
          "CAMERA_NO_FACE",
          "CAMERA_MULTI_FACE",
          "CAMERA_LOOK_AWAY",
          "CAMERA_PHONE",
          "CAMERA_OFF",
        ],
      },
    },
    select: { id: true, meta: true },
  });

  const storage = getStorageProvider();
  let purged = 0;

  for (const ev of events) {
    const meta = (ev.meta && typeof ev.meta === "object" ? ev.meta : null) as Record<
      string,
      unknown
    > | null;
    const key = meta && typeof meta.snapshotKey === "string" ? meta.snapshotKey : null;
    if (!key) continue;

    await storage.delete(key).catch(() => undefined);

    const nextMeta: Record<string, unknown> = { ...meta };
    delete nextMeta.snapshotKey;
    nextMeta.snapshotPurgedAt = new Date().toISOString();

    await prisma.proctorEvent.update({
      where: { id: ev.id },
      data: { meta: nextMeta as Prisma.InputJsonValue },
    });
    purged++;
  }

  console.log(`Purged ${purged} expired proctor snapshot(s).`);
}

main()
  .catch((err) => {
    console.error("Failed to purge proctor snapshots:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

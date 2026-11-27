import { requireLayoutUser } from "@/lib/permissions";
import { ScheduleCalendarView } from "@/components/schedule/ScheduleCalendarView";
import { CalendarSyncCard } from "@/components/schedule/CalendarSyncCard";

export default async function TeacherSchedulePage() {
  await requireLayoutUser(["TEACHER", "ADMIN"]);
  return (
    <div className="space-y-4">
      <ScheduleCalendarView mode="TEACHER" />
      <CalendarSyncCard />
    </div>
  );
}

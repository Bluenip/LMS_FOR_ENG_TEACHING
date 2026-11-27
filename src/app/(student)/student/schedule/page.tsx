import { requireLayoutUser } from "@/lib/permissions";
import { ScheduleCalendarView } from "@/components/schedule/ScheduleCalendarView";
import { CalendarSyncCard } from "@/components/schedule/CalendarSyncCard";

export default async function StudentSchedulePage() {
  await requireLayoutUser(["STUDENT"]);
  return (
    <div className="space-y-4">
      <ScheduleCalendarView mode="STUDENT" />
      <CalendarSyncCard />
    </div>
  );
}

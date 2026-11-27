import { requireLayoutUser } from "@/lib/permissions";
import { ScheduleCalendarView } from "@/components/schedule/ScheduleCalendarView";

export default async function TeacherSchedulePage() {
  await requireLayoutUser(["TEACHER", "ADMIN"]);
  return <ScheduleCalendarView mode="TEACHER" />;
}

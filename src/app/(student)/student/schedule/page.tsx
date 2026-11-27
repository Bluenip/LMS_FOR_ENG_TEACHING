import { requireLayoutUser } from "@/lib/permissions";
import { ScheduleCalendarView } from "@/components/schedule/ScheduleCalendarView";

export default async function StudentSchedulePage() {
  await requireLayoutUser(["STUDENT"]);
  return <ScheduleCalendarView mode="STUDENT" />;
}

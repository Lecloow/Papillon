import { Account, Document, Session, setHomeworkState, studentHomeworks } from "pawdirecte";

import { warn } from "@/utils/logger/logger";

import { Attachment, AttachmentType } from "../shared/attachment";
import { Homework } from "../shared/homework";
import { fetchEDTimetable } from "./timetable";
import type { CourseDay } from "../shared/timetable";
import { getDateRangeOfWeek } from "@/database/useHomework";
import { format } from "date-fns";

const LOG_PREFIX = "HW-TIME";

/**
* yyyy-MM-dd key
*/
export const formatDate = (date: Date): string => format(date, "yyyy-MM-dd");

const norm = (s?: string) =>
(s ?? "")
.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export async function fetchEDHomeworks(
  session: Session,
  account: Account,
  accountId: string,
  weekNumber: number
): Promise<Homework[]> {
  // Utiliser le même calcul de semaine que l’EDT
  const { start, end } = getDateRangeOfWeek(weekNumber);
  const weekdays: Date[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    weekdays.push(new Date(d));
  }

  // EDT par jour
  let timetableByDay = new Map<string, CourseDay>();
  try {
    const timetable = await fetchEDTimetable(session, account, accountId, weekNumber);
    timetableByDay = new Map(timetable.map((day) => [formatDate(day.date), day]));
    warn(`${LOG_PREFIX} timetable days: ${[...timetableByDay.keys()].join(", ")}`);
  } catch (e) {
    warn(`${LOG_PREFIX} Failed to fetch timetable: ${String(e)}`);
  }

  const response: Homework[] = [];

  for (const date of weekdays) {
    const dayKey = formatDate(date);

    let homeworks;
    try {
      ({ homeworks } = await studentHomeworks(session, account, dayKey));
    } catch (e) {
      warn(`${LOG_PREFIX} studentHomeworks failed for ${dayKey}: ${String(e)}`);
      continue;
    }

    const dayEntry = timetableByDay.get(dayKey);
    if (!dayEntry) {
      warn(`${LOG_PREFIX} no timetable entry for ${dayKey}, all HWs that day will default to 00:00`);
    } else if (!dayEntry.courses?.length) {
      warn(`${LOG_PREFIX} timetable entry has 0 courses for ${dayKey}`);
    }

    for (const hw of homeworks) {
      const dueDate = new Date(date); // par défaut minuit local
      const nHw = norm(hw.subject);

      let chosen: Date | undefined;
      let cause = "default-midnight";

      if (dayEntry?.courses?.length) {
        // 1) égalité stricte normalisée
        let match = dayEntry.courses.find((c) => norm(c.subject) === nHw);
        // 2) sinon includes (souple)
        if (!match) {
          match = dayEntry.courses.find((c) => {
            const nC = norm(c.subject);
            return nC.includes(nHw) || nHw.includes(nC);
          });
          if (match) cause = "subject-includes";
        } else {
          cause = "subject-exact";
        }
        // 3) sinon 1er cours du jour
        if (!match) {
          match = dayEntry.courses[0];
          cause = "first-course-of-day";
        }

        if (match?.from instanceof Date && !isNaN(match.from.getTime())) {
          chosen = match.from;
          dueDate.setHours(chosen.getHours(), chosen.getMinutes(), 0, 0);
        }
      }

      if (chosen) {
        warn(
          `${LOG_PREFIX} ${dayKey} | subject="${hw.subject}" -> ${cause} | chosen=${chosen.toTimeString().slice(0,5)} | final=${dueDate.toTimeString().slice(0,5)}`
        );
      } else {
        warn(`${LOG_PREFIX} ${dayKey} | subject="${hw.subject}" -> no course, keep 00:00`);
      }

      response.push({
        attachments: hw.attachments.map((att) => ({
          url: `${att.name}\\${att.id}\\${att.kind}`,
          type: AttachmentType.FILE,
          name: att.name,
          createdByAccount: accountId,
        })),
        content: hw.content,
        isDone: hw.done,
        dueDate,
        id: hw.id.toString(),
        subject: hw.subject,
        evaluation: hw.exam,
        custom: false,
        createdByAccount: accountId,
      });
    }
  }

  return response;
}

function mapEDAttachments(data: Document[], accountId: string): Attachment[] {
  return data.map((att) => ({
    type: AttachmentType.FILE,
    name: att.name,
    url: att.name,
    createdByAccount: accountId,
  }));
}

export async function setEDHomeworkAsDone(
  session: Session,
  account: Account,
  homework: Homework,
  state?: boolean
): Promise<Homework> {
  await setHomeworkState(session, account, Number(homework.id), state ?? !homework.isDone);
  return {
    ...homework,
    isDone: state ?? !homework.isDone,
  };
}
import { Model, Q } from "@nozbe/watermelondb";
import { useEffect, useState } from "react";

import { Attachment } from "@/services/shared/attachment";
import { Homework as SharedHomework } from "@/services/shared/homework";
import { generateId } from "@/utils/generateId";
import { warn } from "@/utils/logger/logger";

import { getDatabaseInstance, useDatabase } from "./DatabaseProvider";
import Homework from "./models/Homework";
import { safeWrite } from "./utils/safeTransaction";

function mapHomeworkToShared(homework: Homework): SharedHomework {
  return {
    id: homework.homeworkId,
    subject: homework.subject,
    content: homework.content,
    dueDate: new Date(homework.dueDate),
    isDone: homework.isDone,
    returnFormat: homework.returnFormat,
    attachments: parseJsonArray(homework.attachments) as Attachment[],
    evaluation: homework.evaluation,
    custom: homework.custom,
    createdByAccount: homework.createdByAccount,
    kidName: homework.kidName,
    fromCache: true,
  };
}

export function useHomeworkForWeek(weekNumber: number, refresh = 0) {
  const database = useDatabase();
  const [homeworks, setHomeworks] = useState<SharedHomework[]>([]);

  useEffect(() => {
    const fetchHomeworks = async () => {
      const homeworksFetched = await getHomeworksFromCache(weekNumber);
      setHomeworks(homeworksFetched);
    };
    fetchHomeworks();
  }, [weekNumber, refresh, database]);

  return homeworks;
}

export async function getHomeworksFromCache(
  weekNumber: number
): Promise<SharedHomework[]> {
  try {
    const database = getDatabaseInstance();
    const { start, end } = getDateRangeOfWeek(weekNumber);
    const homeworks = await database
      .get<Homework>("homework")
      .query(Q.where("dueDate", Q.between(start.getTime(), end.getTime())))
      .fetch();

    return homeworks
      .map(mapHomeworkToShared)
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  } catch (e) {
    warn(String(e));
    return [];
  }
}

export async function addHomeworkToDatabase(homeworks: SharedHomework[]) {
  const db = getDatabaseInstance();

  // Utilise le numéro de semaine ISO pour être cohérent avec les jours utilisés par l’EDT
  const weekNumber = getISOWeekNumber(homeworks[0].dueDate);
  const { start, end } = getDateRangeOfWeek(weekNumber);

  // On récupère uniquement les devoirs de la semaine pour faire le diff
  const dbHomeworks = await db
    .get<Homework>("homework")
    .query(Q.where("dueDate", Q.between(start.getTime(), end.getTime())))
    .fetch();

  const homeworkIds: string[] = [];
  for (const hw of homeworks) {
    // ancien ID (sans date dans la clé) + nouveau ID (avec date, mais sans l’heure)
    const oldId = generateId(hw.subject + hw.content + hw.createdByAccount);
    const id = generateId(
      hw.subject + hw.content + hw.createdByAccount + hw.dueDate.toDateString()
    );
    homeworkIds.push(oldId, id);
  }

  // Supprime de la semaine ce qui n'est plus renvoyé par la source
  const homeworksToDelete = dbHomeworks.filter(
    (dbHw) => !homeworkIds.includes(dbHw.homeworkId)
  );
  for (const homework of homeworksToDelete) {
    await homework.markAsDeleted();
  }

  for (const hw of homeworks) {
    const oldId = generateId(hw.subject + hw.content + hw.createdByAccount);
    const id = generateId(
      hw.subject + hw.content + hw.createdByAccount + hw.dueDate.toDateString()
    );

    const existing = await db
      .get("homework")
      .query(Q.where("homeworkId", id))
      .fetch();

    const oldExisting = await db
      .get("homework")
      .query(Q.where("homeworkId", oldId))
      .fetch();

    // Nettoyage des anciens IDs
    for (const oldRecord of oldExisting) {
      await oldRecord.markAsDeleted();
    }

    if (existing.length === 0) {
      // Création
      await safeWrite(
        db,
        async () => {
          await db.get("homework").create((record: Model) => {
            const homework = record as Homework;
            Object.assign(homework, {
              homeworkId: id,
              subject: hw.subject,
              content: hw.content,
              dueDate: hw.dueDate.getTime(), // stocké en ms
              isDone: hw.isDone,
              returnFormat: hw.returnFormat,
              attachments: JSON.stringify(hw.attachments),
              evaluation: hw.evaluation,
              custom: hw.custom,
              createdByAccount: hw.createdByAccount,
              kidName: hw.kidName,
              fromCache: true,
            });
          });
        },
        10000,
        "addHomeworkToDatabase"
      );
    } else {
      // Mise à jour: si l’heure a été inférée par l’EDT, elle sera reflétée ici
      const recordToUpdate = existing[0];
      await safeWrite(
        db,
        async () => {
          await recordToUpdate.update((record: Model) => {
            const homework = record as Homework;
            Object.assign(homework, {
              subject: hw.subject,
              content: hw.content,
              dueDate: hw.dueDate.getTime(), // met bien à jour l'heure si elle change
              isDone: hw.isDone,
              returnFormat: hw.returnFormat,
              attachments: JSON.stringify(hw.attachments),
              evaluation: hw.evaluation,
              custom: hw.custom,
              createdByAccount: hw.createdByAccount,
              kidName: hw.kidName,
              fromCache: true,
            });
          });
        },
        10000,
        "updateHomeworkToDatabase"
      );
    }
  }
}

export async function updateHomeworkIsDone(
  homeworkId: string,
  isDone: boolean
) {
  const db = getDatabaseInstance();

  const existing = await db
    .get("homework")
    .query(Q.where("homeworkId", homeworkId))
    .fetch();

  if (existing.length === 0) {
    warn(`Homework with ID ${homeworkId} not found`);
    return;
  }

  const recordToUpdate = existing[0];

  await safeWrite(
    db,
    async () => {
      await recordToUpdate.update((record: Model) => {
        const homework = record as Homework;
        homework.isDone = isDone;
      });
    },
    10000,
    "updateHomeworkIsDone"
  );
}

// Plage [lundi 00:00, dimanche 23:59:59.999] pour un numéro de semaine ISO donné
export function getDateRangeOfWeek(
  weekNumber: number,
  year = new Date().getFullYear()
) {
  // Trouver le jeudi de la semaine 1 (ISO) = 4 janvier, puis reculer/avancer pour obtenir le lundi de la semaine 1
  const jan4 = new Date(year, 0, 4);
  const jan4Day = (jan4.getDay() + 6) % 7; // 0 = lundi ... 6 = dimanche
  const week1Monday = new Date(jan4);
  week1Monday.setDate(jan4.getDate() - jan4Day);

  const weekStart = new Date(week1Monday);
  weekStart.setDate(week1Monday.getDate() + (weekNumber - 1) * 7);
  const start = new Date(weekStart);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

export function parseJsonArray(s: string): unknown[] {
  try {
    const result = JSON.parse(s);
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
}

// Numéro de semaine ISO (lundi comme premier jour)
export function getISOWeekNumber(date: Date): number {
  const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Ajuster au jeudi de la semaine (ISO)
  const day = (tmp.getUTCDay() + 6) % 7; // 0 = lundi
  tmp.setUTCDate(tmp.getUTCDate() + 3 - day);
  // Semaine 1: celle qui contient le 4 janvier
  const week1 = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 4));
  const week1Day = (week1.getUTCDay() + 6) % 7;
  week1.setUTCDate(week1.getUTCDate() - week1Day);
  const diffDays = Math.round((+tmp - +week1) / 86400000);
  return 1 + Math.floor(diffDays / 7);
}

// Compat: alias si d’autres modules appellent encore getWeekNumberFromDate
export const getWeekNumberFromDate = getISOWeekNumber;
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const EXCEL_FILE = path.join(__dirname, "data", "расписание.xlsx");
const OUTPUT_JSON = path.join(__dirname, "data", "schedule.json");

function parseSchedule() {
  try {
    const workbook = XLSX.readFile(EXCEL_FILE);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    const schedule = {};
    let currentClass = null;
    let dayColumns = {};
    let parsingLessons = false;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;

      // 1. Найти начало нового класса
      if (typeof row[0] === "string" && row[0].startsWith("Класс - ")) {
        currentClass = row[0].replace("Класс - ", "").trim();
        schedule[currentClass] = {
          Понедельник: [],
          Вторник: [],
          Среда: [],
          Четверг: [],
          Пятница: [],
          Суббота: [],
        };
        dayColumns = {};
        parsingLessons = false;
        continue;
      }

      if (!currentClass) continue;

      // 2. Найти строку с днями недели
      if (!parsingLessons) {
        const hasDay = row.some((cell) =>
          ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"].includes(
            (cell || "").toString().trim()
          )
        );
        if (hasDay) {
          for (let j = 0; j < row.length; j++) {
            const cell = (row[j] || "").toString().trim();
            if (
              ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"].includes(cell)
            ) {
              dayColumns[cell] = { subjectCol: j, roomCol: j + 1 };
            }
          }
          parsingLessons = true;
          continue;
        }
      }

      // 3. Обработка строк
      if (parsingLessons && row.length >= 2) {
        const lessonNum = (row[0] || "").toString().trim();
        const time = (row[1] || "").toString().trim();

        // Пропускаем полностью пустые строки
        let hasContent = false;
        for (const day in dayColumns) {
          const cols = dayColumns[day];
          if (
            (row[cols.subjectCol] || "").toString().trim() ||
            (row[cols.roomCol] || "").toString().trim()
          ) {
            hasContent = true;
            break;
          }
        }

        if (!hasContent && !lessonNum && !time) {
          continue;
        }

        if (lessonNum && time) {
          // Новый урок — создаем его
          for (const [dayName, lessons] of Object.entries(schedule[currentClass])) {
            const cols = dayColumns[dayName];
            if (!cols) continue;

            const subjectCell = (row[cols.subjectCol] || "").toString().trim();
            const roomCell = (row[cols.roomCol] || "").toString().trim();

            if (!subjectCell) continue;

            // Создаем первую группу
            const groups = [{
              subject: subjectCell,
              room: roomCell,
              teacher: ""
            }];

            lessons.push({
              lessonNum,
              time,
              groups
            });
          }
        } else {
          // Это продолжение предыдущего урока — обрабатываем как группу или учителя
          for (const [dayName, lessons] of Object.entries(schedule[currentClass])) {
            const cols = dayColumns[dayName];
            if (!cols) continue;

            const subjectCell = (row[cols.subjectCol] || "").toString().trim();
            const roomCell = (row[cols.roomCol] || "").toString().trim();

            if (!subjectCell && !roomCell) continue;

            const lastLesson = lessons[lessons.length - 1];
            if (!lastLesson) continue;

            // Проверяем, начинается ли строка с "N." — это новая группа
            const match = subjectCell.match(/^(\d+)\.\s*(.*)/);
            if (match) {
              // Новая группа
              lastLesson.groups.push({
                subject: match[2].trim(),
                room: roomCell,
                teacher: ""
              });
            } else {
              // Это учитель — добавляем к последней группе
              if (lastLesson.groups.length > 0) {
                const lastGroup = lastLesson.groups[lastLesson.groups.length - 1];
                lastGroup.teacher = subjectCell;
                // Если у группы нет кабинета, но он есть в этой строке — используем его
                if (!lastGroup.room && roomCell) {
                  lastGroup.room = roomCell;
                }
              }
            }
          }
        }
      }
    }

    // Удаляем уроки с пустыми groups
    for (const classKey in schedule) {
      for (const day in schedule[classKey]) {
        schedule[classKey][day] = schedule[classKey][day].filter(lesson => lesson.groups.length > 0);
      }
    }

    return schedule;
  } catch (err) {
    console.error("❌ Ошибка парсинга:", err);
    return null;
  }
}

// Запуск
const result = parseSchedule();
if (result) {
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(result, null, 2));
  console.log(`✅ Расписание сохранено в: ${OUTPUT_JSON}`);
  console.log(`📊 Пример для 5А, Вторник:`);
  console.log(JSON.stringify(result["5А"]?.["Вторник"], null, 2));
} else {
  console.log("❌ Не удалось создать расписание.");
}
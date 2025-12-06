const express = require('express');
const { Telegraf, session, Markup } = require('telegraf');

// Загружаем расписание
const scheduleData = require('./data/schedule.json');

// Извлекаем уникальные номера классов
const classNumbers = [...new Set(
  Object.keys(scheduleData)
    .map(cls => cls.match(/^\d+/)?.[0])
    .filter(Boolean)
    .sort((a, b) => parseInt(a) - parseInt(b))
)];

// Используем токен из переменной окружения
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  throw new Error('❌ Переменная окружения BOT_TOKEN не задана!');
}

const bot = new Telegraf(BOT_TOKEN);
bot.use(session());

const startButton = Markup.keyboard([['Начать']]).oneTime().resize();

bot.start((ctx) => {
  ctx.session = {};
  ctx.reply('Привет! Нажмите кнопку, чтобы посмотреть расписание.', startButton);
});

bot.hears('Начать', (ctx) => {
  const numberButtons = classNumbers.map(num => [num]);
  ctx.reply('Выберите номер класса:', Markup.keyboard(numberButtons).oneTime().resize());
});

bot.hears(classNumbers, (ctx) => {
  const chosenNumber = ctx.message.text;
  ctx.session.chosenNumber = chosenNumber;

  const availableLetters = Object.keys(scheduleData)
    .filter(cls => cls.startsWith(chosenNumber))
    .map(cls => cls.slice(chosenNumber.length));

  if (availableLetters.length === 0) {
    return ctx.reply('Нет классов с таким номером.', startButton);
  }

  const letterButtons = availableLetters.map(letter => [letter]);
  ctx.reply(`Выбран номер: ${chosenNumber}. Выберите букву класса:`, 
    Markup.keyboard(letterButtons).oneTime().resize());
});

bot.hears(/^[А-ЯЁ]$/, (ctx) => {
  const chosenNumber = ctx.session?.chosenNumber;
  const chosenLetter = ctx.message.text;

  if (!chosenNumber) {
    return ctx.reply('Сначала выберите номер класса.', startButton);
  }

  const fullClass = chosenNumber + chosenLetter;
  if (!scheduleData[fullClass]) {
    return ctx.reply('Класс не найден.', startButton);
  }

  ctx.session.chosenClass = fullClass;
  const days = Object.keys(scheduleData[fullClass]);
  const dayButtons = days.map(day => [day]);
  ctx.reply(`Выбран класс: ${fullClass}. Выберите день недели:`, 
    Markup.keyboard(dayButtons).oneTime().resize());
});

const allDays = [...new Set(
  Object.values(scheduleData).flatMap(cls => Object.keys(cls))
)];

bot.hears(allDays, (ctx) => {
  const chosenClass = ctx.session?.chosenClass;
  const chosenDay = ctx.message.text;

  if (!chosenClass || !scheduleData[chosenClass]?.[chosenDay]) {
    return ctx.reply('Ошибка. Начните заново.', startButton);
  }

  const lessons = scheduleData[chosenClass][chosenDay];
  let message = `📅 <b>${chosenDay}, ${chosenClass}</b>\n\n`;

  const validLessons = lessons.filter(lesson =>
    !(lesson.lessonNum === '-' && lesson.groups?.[0]?.subject === 'Предмет')
  );

  if (validLessons.length === 0) {
    message += 'Нет уроков.';
  } else {
    for (const lesson of validLessons) {
      const timeStr = lesson.time ? ` (${lesson.time})` : '';

      if (lesson.groups.length === 1) {
        const g = lesson.groups[0];
        const room = g.room && g.room !== '-' ? g.room : '—';
        const teacher = g.teacher ? ` — ${g.teacher}` : '';
        message += `🕗 ${lesson.lessonNum}. ${g.subject} (${room})${teacher}${timeStr}\n`;
      } else {
        // Несколько подгрупп
        message += `🕗 ${lesson.lessonNum}. ${lesson.groups[0].subject}${timeStr}\n`;
        for (const g of lesson.groups) {
          const room = g.room && g.room !== '-' ? g.room : '—';
          message += `   → ${g.teacher} (${room})\n`;
        }
      }
    }
  }

  ctx.replyWithHTML(message.trim(), Markup.keyboard([['Начать сначала']]).oneTime().resize());
});

bot.hears('Начать сначала', (ctx) => {
  ctx.session = {};
  const numberButtons = classNumbers.map(num => [num]);
  ctx.reply('Выберите номер класса:', Markup.keyboard(numberButtons).oneTime().resize());
});

bot.use((ctx) => {
  ctx.reply('Пожалуйста, используйте кнопки.', startButton);
});

// === EXPRESS + WEBHOOK ДЛЯ RENDER ===
const app = express();
const PORT = process.env.PORT || 3000;

// Подключаем вебхук Telegraf к Express
app.use(bot.webhookCallback(`/bot/${BOT_TOKEN}`));

// Health-check эндпоинт
app.get('/', (req, res) => {
  res.send('✅ School Schedule Bot is running on Render!');
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  
  // Регистрация вебхука в Telegram
  const WEBHOOK_URL = `${process.env.RENDER_EXTERNAL_URL}/bot/${BOT_TOKEN}`;
  bot.telegram.setWebhook(WEBHOOK_URL)
    .then(() => console.log(`✅ Вебхук установлен: ${WEBHOOK_URL}`))
    .catch(err => console.error('❌ Ошибка установки вебхука:', err));
});
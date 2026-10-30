// Daily attendance reminder: at 12:45 PM IST, push a reminder to every user
// who has the "attendance-reminder" notification permission (Add User page)
// and hasn't marked attendance yet today. Attendance closes at 1:00 PM.
const fs = require('fs').promises;
const path = require('path');
const { sendNotificationToUsers } = require('../routes/push');

const REMINDER_HOUR = 12;
const REMINDER_MINUTE = 45;
// If the server was down at 12:45, still send as long as it's before this time
const REMINDER_DEADLINE_MINUTES = 13 * 60;

const USERS_PATH = path.join(__dirname, '..', 'db', 'users.json');
const RECORDS_PATH = path.join(__dirname, '..', 'db', 'attendance', 'records.json');
const STATE_PATH = path.join(__dirname, '..', 'db', 'attendance', 'reminder_state.json');

// { date: 'YYYY-MM-DD', minutes: minutes since midnight } in IST
const nowIST = () => {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return {
    date: ist.toISOString().split('T')[0],
    minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes(),
  };
};

const readJson = async (file, fallback) => {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
};

const sendAttendanceReminders = async (date) => {
  const users = await readJson(USERS_PATH, []);
  const records = await readJson(RECORDS_PATH, []);

  const markedIds = new Set(
    records.filter(r => r.date === date).map(r => Number(r.userId))
  );

  const pending = users.filter(u =>
    Array.isArray(u.notificationAccess) &&
    u.notificationAccess.includes('attendance-reminder') &&
    !markedIds.has(Number(u.id))
  );

  let devices = 0;
  for (const u of pending) {
    const name = String(u.name || '').trim();
    const message = [
      `Hi ${name}, Attendance Not Marked… please mark it before 1:00 PM.`,
      'Mark 6 days present in the week so that your 7th day is taken as a paid weekly off, otherwise it will not be paid.',
      '',
      `नमस्ते ${name}, आपकी उपस्थिति दर्ज नहीं हुई है… कृपया दोपहर 1:00 बजे से पहले उपस्थिति दर्ज करें।`,
      'सप्ताह में 6 दिन उपस्थिति दर्ज करें, तभी 7वाँ दिन सवेतन साप्ताहिक अवकाश (पेड वीकली ऑफ) माना जाएगा, अन्यथा नहीं।',
    ].join('\n');

    devices += await sendNotificationToUsers([u.id], {
      title: 'Attendance Not Marked / उपस्थिति दर्ज नहीं हुई',
      message,
      data: { url: '/attendance', endpoint: 'attendance-reminder' },
    }, 'attendance-reminder');
  }

  console.log(`[AttendanceReminder] ${date}: ${pending.length} user(s) pending, sent to ${devices} device(s).`);
};

let running = false;

const tick = async () => {
  if (running) return;
  running = true;
  try {
    const { date, minutes } = nowIST();
    const start = REMINDER_HOUR * 60 + REMINDER_MINUTE;
    if (minutes < start || minutes >= REMINDER_DEADLINE_MINUTES) return;

    const state = await readJson(STATE_PATH, {});
    if (state.lastSentDate === date) return;

    // Record first so a crash mid-send can't cause a second round of pushes
    await fs.mkdir(path.dirname(STATE_PATH), { recursive: true });
    await fs.writeFile(STATE_PATH, JSON.stringify({ lastSentDate: date }, null, 2));

    await sendAttendanceReminders(date);
  } catch (err) {
    console.error('[AttendanceReminder] Failed:', err);
  } finally {
    running = false;
  }
};

const startAttendanceReminder = () => {
  setInterval(tick, 30 * 1000);
  tick();
  console.log(`[AttendanceReminder] Scheduled daily at ${REMINDER_HOUR}:${String(REMINDER_MINUTE).padStart(2, '0')} IST`);
};

module.exports = { startAttendanceReminder, sendAttendanceReminders };

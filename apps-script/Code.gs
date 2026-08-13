/** Attention Lab Google Apps Script Web App. */
const SHEETS = {
  rounds: 'Rounds',
  sessions: 'Sessions',
  daily: 'Daily',
  tests: 'Attention Tests',
};
const DATA_START_ROW = 5;

function doGet() {
  return jsonResponse_({ ok: true, service: 'Attention Lab API', version: 1 });
}

function doPost(event) {
  try {
    const request = JSON.parse(event.postData.contents || '{}');
    validateToken_(request.token);
    const action = String(request.action || '');
    const payload = request.payload || {};
    if (action === 'round') appendRound_(payload);
    else if (action === 'session') saveSession_(payload);
    else if (action === 'attention-test') appendAttentionTest_(payload);
    else if (action === 'dashboard') return jsonResponse_({ ok: true, data: getDashboard_() });
    else throw new Error('Unknown action: ' + action);
    return jsonResponse_({ ok: true });
  } catch (error) {
    return jsonResponse_({ ok: false, error: error.message });
  }
}

function validateToken_(token) {
  const expected = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (!expected || !token || token !== expected) throw new Error('Unauthorized');
}

function spreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('Missing SPREADSHEET_ID script property');
  return SpreadsheetApp.openById(id);
}

function appendRound_(record) {
  const values = ['timestamp','session_id','round','target_duration','actual_duration','result','lapse_level','next_duration','session_elapsed'].map((key) => record[key]);
  spreadsheet_().getSheetByName(SHEETS.rounds).appendRow(values);
}

function saveSession_(record) {
  const sheet = spreadsheet_().getSheetByName(SHEETS.sessions);
  const values = ['session_id','date','duration','rounds','success_rate','threshold','max_interval','avg_interval'].map((key) => record[key]);
  const rowCount = Math.max(0, sheet.getLastRow() - DATA_START_ROW + 1);
  const sessionIds = rowCount ? sheet.getRange(DATA_START_ROW, 1, rowCount, 1).getDisplayValues().flat() : [];
  const index = sessionIds.indexOf(String(record.session_id));
  if (index >= 0) sheet.getRange(index + DATA_START_ROW, 1, 1, values.length).setValues([values]);
  else sheet.appendRow(values);
  upsertDaily_(normalizeDate_(record.date));
}

function appendAttentionTest_(record) {
  const values = ['date','test','avg_rt','rt_sd','omission','commission','lapse_count'].map((key) => record[key]);
  spreadsheet_().getSheetByName(SHEETS.tests).appendRow(values);
}

function upsertDaily_(date) {
  const book = spreadsheet_();
  const sessionSheet = book.getSheetByName(SHEETS.sessions);
  const sessionRowCount = Math.max(0, sessionSheet.getLastRow() - DATA_START_ROW + 1);
  const sessionRange = sessionRowCount ? sessionSheet.getRange(DATA_START_ROW, 1, sessionRowCount, 8) : null;
  const sessionValues = sessionRange ? sessionRange.getValues() : [];
  const sessionDates = sessionRange ? sessionRange.getDisplayValues().map((row) => normalizeDate_(row[1])) : [];
  const sessions = sessionValues.filter((row, index) => sessionDates[index] === date);
  if (!sessions.length) return;
  const duration = sessions.reduce((sum, row) => sum + Number(row[2] || 0), 0);
  const totalRounds = sessions.reduce((sum, row) => sum + Number(row[3] || 0), 0);
  const successes = sessions.reduce((sum, row) => sum + Number(row[3] || 0) * Number(row[4] || 0), 0);
  const thresholds = sessions.map((row) => Number(row[5] || 0));
  const maxes = sessions.map((row) => Number(row[6] || 0));
  const row = [date, duration, thresholds[thresholds.length - 1], totalRounds ? successes / totalRounds : 0, Math.max.apply(null, maxes)];
  const daily = book.getSheetByName(SHEETS.daily);
  const dailyRowCount = Math.max(0, daily.getLastRow() - DATA_START_ROW + 1);
  const dates = dailyRowCount ? daily.getRange(DATA_START_ROW, 1, dailyRowCount, 1).getDisplayValues().flat() : [];
  const index = dates.indexOf(date);
  if (index >= 0) daily.getRange(index + DATA_START_ROW, 1, 1, row.length).setValues([row]);
  else daily.appendRow(row);
}

function getDashboard_() {
  const sheet = spreadsheet_().getSheetByName(SHEETS.daily);
  const rowCount = Math.max(0, sheet.getLastRow() - DATA_START_ROW + 1);
  if (!rowCount) return [];
  const count = Math.min(30, rowCount);
  const startRow = sheet.getLastRow() - count + 1;
  return sheet.getRange(startRow, 1, count, 5).getValues().map((row) => ({
    date: normalizeDate_(row[0]),
    training_minutes: Number(row[1] || 0),
    threshold: Number(row[2] || 0),
    success_rate: Number(row[3] || 0),
    max_interval: Number(row[4] || 0),
  }));
}

function normalizeDate_(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') {
    const serialDate = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return Utilities.formatDate(serialDate, 'Asia/Taipei', 'yyyy-MM-dd');
  }
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isNaN(parsed.getTime())) return Utilities.formatDate(parsed, 'Asia/Taipei', 'yyyy-MM-dd');
  return String(value || '').slice(0, 10);
}

function jsonResponse_(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}

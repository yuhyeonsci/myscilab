// Apps Script 흉내 환경에서 Code.gs API 흐름 시험
const vm = require('vm'), fs = require('fs'), crypto = require('crypto');
const FAKE_TODAY = process.env.TODAY || '2026-11-25';
const REAL_NOW = process.env.REALNOW === '1';

function makeSheet(name) {
  const data = []; // 2D array
  let maxRows = 1000, maxCols = 26;
  const sh = {
    name,
    _data: data,
    getLastColumn() { let m = 0; data.forEach(r => { for (let j = r.length - 1; j >= 0; j--) if (r[j] !== '' && r[j] != null) { m = Math.max(m, j + 1); break; } }); return m; },
    getLastRow() { for (let i = data.length - 1; i >= 0; i--) if (data[i] && data[i].some(v => v !== '' && v != null)) return i + 1; return 0; },
    getMaxRows() { return maxRows; }, getMaxColumns() { return maxCols; },
    insertColumnsAfter(a, n) { maxCols += n; }, insertRowsAfter(a, n) { maxRows += n; },
    setFrozenRows() {},
    deleteRow(r) { data.splice(r - 1, 1); },
    getDataRange() {
      const lr = sh.getLastRow(), lc = sh.getLastColumn();
      return { getValues() { const out = []; for (let i = 0; i < lr; i++) { const row = []; for (let j = 0; j < lc; j++) row.push(data[i] && data[i][j] != null ? data[i][j] : ''); out.push(row); } return out; } };
    },
    getRange(r, c, nr, nc) {
      nr = nr || 1; nc = nc || 1;
      const rng = {
        setNumberFormat() { return rng; },
        getValues() { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) row.push((data[r - 1 + i] || [])[c - 1 + j] ?? ''); out.push(row); } return out; },
        setValues(v) { for (let i = 0; i < nr; i++) { data[r - 1 + i] = data[r - 1 + i] || []; for (let j = 0; j < nc; j++) data[r - 1 + i][c - 1 + j] = v[i][j]; } return rng; },
        setValue(v) { data[r - 1] = data[r - 1] || []; data[r - 1][c - 1] = v; return rng; }
      };
      return rng;
    }
  };
  return sh;
}
const sheets = {};
const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = makeSheet(n)) };
const props = {}, cache = {};
const driveFiles = { F1: { name: 'a.pdf', mime: 'application/pdf', bytes: [1, 2, 3] }, F2: { name: 'b.pdf', mime: 'application/pdf', bytes: [4, 5] } };
function toSigned(buf) { return Array.from(buf).map(b => b > 127 ? b - 256 : b); }
function fmt(date, tz, pat) {
  const parts = {};
  new Intl.DateTimeFormat('en-US', { timeZone: tz === 'UTC' ? 'UTC' : 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' })
    .formatToParts(date).forEach(p => parts[p.type] = p.value);
  const u = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[parts.weekday];
  return pat.replace('yyyy', parts.year).replace('yy', parts.year.slice(2)).replace('MM', parts.month).replace('dd', parts.day)
    .replace('HH', parts.hour).replace('mm', parts.minute).replace(/^u$/, String(u));
}
const ctx = {
  console,
  SpreadsheetApp: { getActiveSpreadsheet: () => ss },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; }, setProperties: o => Object.assign(props, o) }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] ?? null, put: (k, v) => { cache[k] = String(v); }, remove: k => { delete cache[k]; }, getAll: ks => { const o = {}; ks.forEach(k => { if (k in cache) o[k] = cache[k]; }); return o; }, putAll: o => { Object.assign(cache, o); } }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (alg, s) => toSigned(crypto.createHash('sha256').update(String(s), 'utf8').digest()),
    computeHmacSha256Signature: (v, k) => toSigned(crypto.createHmac('sha256', k).update(v, 'utf8').digest()),
    base64EncodeWebSafe: (v) => (typeof v === 'string' ? Buffer.from(v, 'utf8') : Buffer.from(v.map(b => b & 255))).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
    base64DecodeWebSafe: (s) => toSigned(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
    base64Encode: (b) => Buffer.from(b.map(x => x & 255)).toString('base64'),
    newBlob: (bytes) => ({ getDataAsString: () => Buffer.from(bytes.map(b => b & 255)).toString('utf8') }),
    getUuid: () => crypto.randomUUID(),
    formatDate: fmt
  },
  DriveApp: {
    getFileById: id => { const f = driveFiles[id]; if (!f) throw new Error('nf'); return { getName: () => f.name, getMimeType: () => f.mime, getSize: () => f.bytes.length, getBlob: () => ({ getContentType: () => f.mime, getBytes: () => f.bytes }) }; },
    createFolder: () => ({ getId: () => 'FOLDER' }), getFolderById: () => ({})
  },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ s, setMimeType() { return this; } }) },
  HtmlService: { createHtmlOutput: h => ({ h, setTitle() { return this; }, addMetaTag() { return this; }, setXFrameOptionsMode() { return this; } }), createHtmlOutputFromFile: () => ({ old: true, setTitle() { return this; }, addMetaTag() { return this; }, setXFrameOptionsMode() { return this; } }), XFrameOptionsMode: { ALLOWALL: 1 } },
  Logger: { log: (...a) => console.log('[Logger]', ...a) }
};
vm.createContext(ctx);
let src = fs.readFileSync(require('path').join(__dirname, '..', 'Code.gs'), 'utf8');
src = src.replace("var ADMIN_PASSWORD = 'change-me-1234';", "var ADMIN_PASSWORD = 'teacherpw1';");
vm.runInContext(src, ctx);
if (!REAL_NOW) vm.runInContext(`todayKst_=function(){return '${FAKE_TODAY}';}; nowKst_=function(){return '${FAKE_TODAY} 10:00';};`, ctx);

// ---- 기존 데이터 (예전 버전 시트) ----
function seed(name, headers, rows) {
  const sh = sheets[name] = makeSheet(name);
  sh._data.push(headers.slice());
  rows.forEach(r => sh._data.push(headers.map(h => r[h] ?? '')));
}
const OLD = {
  Classes: ['id', 'academy', 'name', 'createdAt'],
  Students: ['key', 'school', 'grade', 'name', 'pin', 'createdAt', 'className', 'classId', 'joinedAt', 'pinSet'],
  Lectures: ['id', 'school', 'grade', 'date', 'startTime', 'title', 'memo', 'questionsJson', 'updatedAt', 'targetsJson'],
  Submissions: ['lectureId', 'studentKey', 'firstAnswersJson', 'confusedJson', 'firstResultJson', 'retryAnswersJson', 'phase', 'essayScoresJson', 'score', 'max', 'late', 'submittedAt', 'retryAt'],
  Tests: ['id', 'school', 'grade', 'date', 'title', 'questionsJson', 'resultsJson', 'updatedAt', 'className', 'classId', 'targetsJson'],
  Videos: ['id', 'title', 'memo', 'url', 'targetsJson', 'updatedAt'],
  Notices: ['id', 'title', 'body', 'image', 'linkUrl', 'linkLabel', 'pinned', 'targetsJson', 'updatedAt'],
  Materials: ['id', 'title', 'memo', 'fileId', 'fileName', 'mime', 'size', 'stamp', 'targetsJson', 'updatedAt'],
  Downloads: ['materialId', 'studentKey', 'at']
};
props.CLASS_MIGRATED = '1';
seed('Classes', OLD.Classes, [{ id: 'c1', academy: '센티움', name: 'SPARK 토요반' }, { id: 'c2', academy: '한양학원', name: 'COMPASS' }]);
seed('Students', OLD.Students, [
  { key: '청담고|1|김철수', school: '청담고', grade: '1', name: '김철수', pin: '4821', classId: 'c1', joinedAt: '', pinSet: '1' },
  { key: '청담고|1|박중도', school: '청담고', grade: '1', name: '박중도', pin: '1111', classId: 'c1', joinedAt: '2026-11-20', pinSet: '' },
  { key: '세화여고|1|이영희', school: '세화여고', grade: '1', name: '이영희', pin: '1111', classId: 'c2', joinedAt: '', pinSet: '' }
]);
const Q = [{ no: 1, type: 'mcq', answer: '45', area: '유전', points: 1, expText: '해설1', expImage: 'IMG1' }, { no: 2, type: 'short', answer: '미토콘드리아', area: '세포', points: 1 }, { no: 3, type: 'mcq', answer: '3', area: '세포', points: 1 }];
seed('Lectures', OLD.Lectures, [
  { id: 'L1', title: '1차시 숙제', questionsJson: JSON.stringify(Q), targetsJson: JSON.stringify([{ classId: 'c1', date: '2026-11-14', startTime: '14:00' }, { classId: 'c2', date: '2026-11-14' }]) },
  { id: 'L2', title: '2차시 숙제', questionsJson: JSON.stringify(Q), targetsJson: JSON.stringify([{ classId: 'c1', date: '2026-11-21', startTime: '14:00' }]) },
  { id: 'L3', title: '3차시 숙제', questionsJson: JSON.stringify(Q), targetsJson: JSON.stringify([{ classId: 'c1', date: '2026-11-28', startTime: '14:00' }]) }
]);
seed('Submissions', OLD.Submissions, []);
seed('Tests', OLD.Tests, [{ id: 'T1', title: '1차 테스트', date: '2026-11-21', classId: 'c1', questionsJson: JSON.stringify([{ no: 1, type: 'mcq', answer: '2', area: '유전' }, { no: 2, type: 'manual', area: '세포' }]),
  resultsJson: JSON.stringify({ '청담고|1|김철수': { absent: false, marks: { 1: 0, 2: 1 }, answers: { 1: '3' } } }), targetsJson: JSON.stringify([{ classId: 'c1', date: '2026-11-21' }]) }]);
seed('Videos', OLD.Videos, [
  { id: 'V1', title: '1강', memo: '열역학', url: 'https://youtu.be/abcdefghijk', targetsJson: JSON.stringify([{ classId: 'c1', from: '2026-11-14', to: '' }]) },
  { id: 'V2', title: '1강', memo: '', url: 'https://youtu.be/bbcdefghijk', targetsJson: JSON.stringify([{ classId: 'c1', from: '2026-11-14', to: '' }]) },
  { id: 'V3', title: '2강', memo: '', url: 'https://youtu.be/cbcdefghijk', targetsJson: JSON.stringify([{ classId: 'c1', from: '2026-11-21', to: '', students: { '청담고|1|박중도': true } }]) }
]);
seed('Notices', OLD.Notices, [{ id: 'N1', title: '11/28 13:30 시작', body: '', pinned: 'true', targetsJson: JSON.stringify([{ classId: 'c1', from: '2026-11-01', to: '' }]) }]);
seed('Materials', OLD.Materials, [
  { id: 'M1', title: '1강', memo: '', fileId: 'F1', fileName: 'a.pdf', mime: 'application/pdf', size: '3', stamp: 'true', targetsJson: JSON.stringify([{ classId: 'c1', from: '2026-11-14', to: '' }]) }
]);
seed('Downloads', OLD.Downloads, [{ materialId: 'M1', studentKey: '청담고|1|김철수', at: '2026-11-15 10:00' }]);


module.exports = { ctx, sheets, props, cache, driveFiles };

// Apps Script 흉내 환경에서 Code.gs API 흐름 시험
const vm = require('vm'), fs = require('fs'), crypto = require('crypto');
const FAKE_TODAY = process.env.TODAY || '2026-11-25';

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
vm.runInContext(`todayKst_=function(){return '${FAKE_TODAY}';}; nowKst_=function(){return '${FAKE_TODAY} 10:00';};`, ctx);

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

function call(action, token, data) {
  const out = ctx.doPost({ postData: { contents: JSON.stringify({ action, token, data }) } });
  return JSON.parse(out.s);
}
let fails = 0;
function check(label, cond, extra) { if (!cond) fails++; console.log((cond ? 'OK  ' : 'FAIL') + ' ' + label + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); }

// 1. 비밀번호 해시 전환
ctx.setupApi();
const stu = sheets.Students._data;
const H = stu[0];
const kimRow = stu.find(r => r[H.indexOf('name')] === '김철수');
check('학생이 정한 비번은 pin 칸 비워짐', kimRow[H.indexOf('pin')] === '' && kimRow[H.indexOf('pinHash')].length === 64);
const parkRow = stu.find(r => r[H.indexOf('name')] === '박중도');
check('임시 비번은 그대로', parkRow[H.indexOf('pin')] === '1111');

// 2. 예전 화면 로그인 그대로 동작
check('예전 화면 로그인(해시)', ctx.studentLogin({ school: '청담고등학교', name: '김철수', pin: '4821' }).ok === true);
check('예전 화면 홈', ctx.studentHome({ school: '청담고', grade: '1', name: '김철수', pin: '4821' }).lectures.length === 2);

// 3. 새 사이트 학생 로그인
let r = call('student.login', '', { school: '청담고', name: '김철수', pin: '0000' });
check('틀린 비번 메시지', r.ok === false && /맞지 않는/.test(r.error), r.error);
r = call('student.login', '', { school: '청담고', name: '김철수', pin: '4821' });
check('로그인 성공 + 토큰', r.ok && /^v1\./.test(r.data.token) && r.data.mustChange === false, r.data && r.data.student);
const kimTok = r.data.token;
r = call('student.home', kimTok, {});
check('홈', r.ok && r.data.lectures.length === 2 && r.data.notices.length === 1, r.ok ? { week: r.data.week, newUnits: r.data.newUnits, wrong: r.data.wrongCount } : r);

// 4. 숙제: 공개 전 정답 없음
r = call('student.lecture', kimTok, { id: 'L2' });
check('문항에 정답 없음', r.ok && r.data.questions.every(q => !('answer' in q)) && r.data.questions[0].pick === 2, r.data && r.data.questions[0]);
r = call('student.lecture', kimTok, { id: 'L3' });
check('날짜 안 된 숙제 막힘', !r.ok && r.error === 'NOT_FOUND', r);
r = call('student.explanationImage', kimTok, { id: 'L2', no: 1 });
check('제출 전 해설 이미지 막힘', !r.ok && r.error === 'NOT_OPEN', r);
r = call('student.submitFirst', kimTok, { id: 'L2', answers: { 1: '4', 2: '미토콘드리아', 3: '3' }, confused: [2] });
check('1차 제출: 1번 틀림 → retry, 정답 미포함', r.ok && r.data.phase === 'retry' && !r.data.items && JSON.stringify(r.data.wrongNos) === '[1]', r.data);
r = call('student.wrongNotes', kimTok, {});
check('오답모음: 공개 전엔 정답 없음', r.ok && r.data.some(x => x.src === 'hw' && !x.revealed && !('answer' in x)) && r.data.some(x => x.src === 'test'), r.data);
r = call('student.submitRetry', kimTok, { id: 'L2', answers: { 1: '5+4' } });
check('재풀이 → 공개', r.ok && r.data.phase === 'revealed' && r.data.items[0].answer === '45');
r = call('student.wrongNotes', kimTok, {});
const hwItem = r.data.find(x => x.src === 'hw');
check('오답모음: 공개 후 정답+고침 표시', hwItem.revealed && hwItem.answer === '45' && hwItem.fixed === true, hwItem);

// 5. 비밀번호 변경 (6자리)
r = call('student.changePin', kimTok, { pin: '4821', newPin: '1234' });
check('4자리 거부', !r.ok && /6자리/.test(r.error), r.error);
r = call('student.changePin', kimTok, { pin: '4821', newPin: '123456' });
check('쉬운 번호 거부', !r.ok && /쉬운/.test(r.error), r.error);
r = call('student.changePin', kimTok, { pin: '4821', newPin: '384920' });
check('6자리 변경 + 새 토큰', r.ok && r.data.token);
const kimTok2 = r.data.token;
r = call('student.home', kimTok, {});
check('예전 토큰은 끊김', !r.ok && r.error === 'AUTH', r.error);
check('새 토큰 동작', call('student.me', kimTok2, {}).ok);

// 6. 로그인 잠금
for (let i = 0; i < 5; i++) call('student.login', '', { school: '청담고', name: '박중도', pin: '9999' });
r = call('student.login', '', { school: '청담고', name: '박중도', pin: '1111' });
check('5번 틀리면 잠금', !r.ok && r.error === 'LOCKED', r);
Object.keys(cache).forEach(k => delete cache[k]);
r = call('student.login', '', { school: '청담고', name: '박중도', pin: '1111' });
check('임시 비번 로그인 → mustChange', r.ok && r.data.mustChange === true);
const parkTok = r.data.token;

// 7. 차시: 자동 복사 + 중도 입반 + 학생별 예외
r = call('student.units', kimTok2, {});
check('차시 자동 복사(1강 영상2+자료1 묶임, 2강)', r.ok && r.data.list.length === 2 && r.data.list.find(u => u.title === '1강').videos.length === 2 && r.data.list.find(u => u.title === '1강').files.length === 1, r.data.list.map(u => [u.title, u.videos.length, u.files.length]));
const u1 = r.data.list.find(u => u.title === '1강');
check('받은 기록 이어짐', u1.files[0].got === '2026-11-15 10:00', u1.files[0]);
r = call('student.units', parkTok, {});
check('중도 입반: 1강 안 보임, 2강(예외로 허용)은 보임', r.ok && r.data.list.map(u => u.title).join() === '2강', r.data.list.map(u => u.title));
r = call('student.download', parkTok, { unitId: u1.id, fileId: u1.files[0].id });
check('중도 입반 1강 파일 막힘', !r.ok && /받을 수 없는/.test(r.error), r.error);
r = call('student.download', kimTok2, { unitId: u1.id, fileId: u1.files[0].id });
check('다운로드 + 워터마크 문구', r.ok && /^김철수 · 청담고 · \d{6}$/.test(r.data.stamp), r.data && r.data.stamp);
check('예전 화면 영상 저장 잠김', (() => { try { ctx.adminSaveVideo('teacherpw1', { title: 'x', url: 'https://youtu.be/abcdefghijk', targets: [{ classId: 'c1', from: '2026-11-01' }] }); return false; } catch (e) { return /새 사이트/.test(e.message); } })());
check('예전 화면 자료 목록도 차시에서', ctx.studentMaterials({ school: '청담고', grade: '1', name: '김철수', pin: '384920' }).list.length === 1);

// 8. 강사
r = call('admin.login', '', { password: 'wrong' });
check('강사 비번 틀림', !r.ok && /맞지 않/.test(r.error), r.error);
r = call('admin.login', '', { password: 'teacherpw1' });
check('강사 로그인', r.ok && r.data.token);
const at = r.data.token;
r = call('admin.classes', kimTok2, {});
check('학생 토큰으로 강사 API 막힘', !r.ok && r.error === 'AUTH', r.error);
r = call('admin.dashboard', at, {});
check('대시보드 학원별', r.ok && r.data.academies.length === 2, r.ok && r.data.academies.map(a => [a.name, a.classes.map(c => [c.name, c.missing, c.missingNames])]));
r = call('admin.students', at, {});
check('강사 화면: 학생이 정한 비번 안 보임', r.ok && r.data.find(s => s.name === '김철수').pin === '' && r.data.find(s => s.name === '박중도').pin === '1111');
r = call('admin.units', at, { classId: 'c1' });
check('강사 차시 목록', r.ok && r.data.length === 2, r.data);
const unit2 = r.data.find(u => u.title === '2강');
r = call('admin.getUnit', at, { id: unit2.id });
const g = r.data;
g.videos.push({ label: '2교시', url: 'https://youtu.be/dbcdefghijk' });
g.files = [{ fileId: 'F2', stamp: true }];
r = call('admin.saveUnit', at, g);
check('차시 저장(영상2 + 새 파일)', r.ok, r);
r = call('admin.getUnit', at, { id: unit2.id });
check('저장 결과', r.data.videos.length === 2 && r.data.files[0].fileName === 'b.pdf' && r.data.targets[0].students['청담고|1|박중도'] === true, r.data);
r = call('admin.saveLecture', at, { id: 'L2', title: '2차시 숙제', targets: [{ classId: 'c1', date: '2026-11-21', startTime: '14:00' }], questions: Q.map((q, i) => Object.assign({}, q, { qImage: i === 0 ? 'QIMG1' : '' })) });
check('문제 사진 저장', r.ok);
check('예전 화면 저장 시 문제 사진 유지', (() => { ctx.adminSaveLecture('teacherpw1', { id: 'L2', title: '2차시 숙제', targets: [{ classId: 'c1', date: '2026-11-21', startTime: '14:00' }], questions: Q }); return JSON.parse(sheets.Lectures._data.find(x => x[0] === 'L2')[sheets.Lectures._data[0].indexOf('questionsJson')])[0].qImage === 'QIMG1'; })());
r = call('student.lecture', kimTok2, { id: 'L2' });
check('학생 화면 hasQ', r.ok && r.data.questions[0].hasQ === true);
r = call('admin.resetPin', at, { key: '청담고|1|김철수' });
check('1111로 되돌리기 → 학생 토큰 끊김', r.ok && call('student.home', kimTok2, {}).error === 'AUTH');
r = call('student.login', '', { school: '청담고', name: '김철수', pin: '1111' });
check('되돌린 뒤 1111 로그인 + mustChange', r.ok && r.data.mustChange);
const kimTok3 = r.data.token;

// 9. 학부모 코드
r = call('student.me', kimTok3, {});
check('학생 내 정보에 학부모 코드', r.ok && /^[A-HJ-NP-Z2-9]{8}$/.test(r.data.parentCode), r.data.parentCode);
const code = r.data.parentCode;
r = call('parent.login', '', { code: code.slice(0, 4) + '-' + code.slice(4).toLowerCase() });
check('학부모 로그인(하이픈·소문자 허용)', r.ok && r.data.student.name === '김철수');
const pt = r.data.token;
r = call('parent.report', pt, { month: '2026-11' });
check('학부모 리포트', r.ok && r.data.summary.month.due >= 1, r.ok && { s: r.data.summary, prog: r.data.progress, hw: r.data.homework.map(h => [h.title, h.status, h.pct]), tests: r.data.testsInMonth, areas: r.data.areas });
r = call('student.home', pt, {});
check('학부모 토큰으로 학생 API 막힘', !r.ok && r.error === 'AUTH');
r = call('admin.saveComment', at, { key: '청담고|1|김철수', month: '2026-11', text: '집중력이 좋아졌어요' });
check('코멘트 저장 → 리포트 반영', r.ok && call('parent.report', pt, { month: '2026-11' }).data.comment === '집중력이 좋아졌어요');
r = call('admin.parentCode', at, { key: '청담고|1|김철수', reissue: true });
check('코드 재발급 → 예전 학부모 토큰 끊김', r.ok && r.data.code !== code && call('parent.report', pt, {}).error === 'AUTH');

// 10. D-day
r = call('student.saveExam', kimTok3, { title: '기말고사', date: '2026-12-10' });
check('D-day 저장', r.ok && r.data.length === 1);
r = call('student.home', kimTok3, {});
check('홈에 D-day', r.ok && r.data.exams[0].title === '기말고사');

// 11. 리포트·설정·전환
r = call('admin.studentReport', at, { key: '청담고|1|김철수' });
check('학생 리포트', r.ok && r.data.admin.parentCode, r.ok && r.data.admin);
r = call('admin.classReport', at, { classId: 'c1' });
check('반 리포트', r.ok && r.data.rows.length === 2, r.ok && r.data);
r = call('admin.changePassword', at, { current: 'teacherpw1', next: 'newpass123' });
check('강사 비번 변경', r.ok);
const at2 = r.data.token;
check('예전 강사 토큰 끊김', call('admin.classes', at, {}).error === 'AUTH');
check('예전 화면도 새 비번', (() => { try { ctx.adminClasses('teacherpw1'); return false; } catch (e) { return e.message === 'ADMIN'; } })() && ctx.adminLogin('newpass123').ok);
check('전환 전 doGet = 예전 화면', ctx.doGet({ parameter: {} }).old === true);
r = call('admin.siteSettings', at2, { save: true, siteUrl: 'https://myscilab.co.kr', switched: true });
check('전환 스위치', r.ok && r.data.switched);
check('전환 후 doGet = 안내 화면', /myscilab\.co\.kr/.test(ctx.doGet({ parameter: {} }).h || ''));
check('ping', JSON.parse(ctx.doGet({ parameter: { action: 'ping' } }).s).ok);
r = call('nope', '', {});
check('알 수 없는 요청', !r.ok);
r = call('student.home', 'v1.abc.def', {});
check('위조 토큰', !r.ok && r.error === 'AUTH');
console.log(fails ? `\n${fails} FAIL` : '\nALL OK');

/**
 * 유현T 과학 과제 제출 — API 버전 (Google Apps Script)
 *
 * 화면은 GitHub Pages(myscilab.co.kr)에 있고, 이 스크립트는 화면 없이 JSON만 주고받는 서버예요.
 *   POST  { action, token, data }  (Content-Type: text/plain)
 *   →     { ok: true, data } 또는 { ok: false, error: 'AUTH' | 'EXPIRED' | 'LOCKED' | 'NOT_OPEN' | 'NOT_FOUND' | '한글 메시지' }
 *
 * 전환 스위치를 켜기 전까지는 예전 화면(index.html)도 그대로 동작해요.
 * 스위치를 켜면 예전 주소로 들어온 사람에게 새 사이트로 가는 안내 화면을 보여 줘요.
 *
 * 보안
 *  - 로그인하면 서명된 토큰(기한 있음)을 줌. 이후 요청은 토큰으로만 확인.
 *  - 학생이 직접 정한 비밀번호는 해시로만 저장(강사도 모름). 임시 비밀번호(1111 등)만 보임.
 *  - 로그인 5번 틀리면 잠시 잠금. 정답·해설은 재풀이를 마치기 전에는 응답에 넣지 않음.
 *  - 강사 비밀번호는 처음엔 아래 ADMIN_PASSWORD, 강사 화면에서 바꾸면 스크립트 속성(해시)에 저장.
 *
 * 처음 설치할 때 setupSheets()를 한 번 실행하세요.
 * (예전 버전에서 바꾼 경우 새 칸·새 시트는 자동으로 만들어지니 다시 실행하지 않아도 됩니다.
 *  업데이트 직후 setupApi()를 한 번 실행하면 비밀번호 해시 전환 결과를 실행 로그로 볼 수 있어요.)
 */

// ===================== 설정 =====================
var ADMIN_PASSWORD = 'change-me-1234'; // 강사 관리 화면 비밀번호. 배포 전에 꼭 바꾸세요.
var APP_TITLE = '유현T 과학 과제 제출';
var TZ = 'Asia/Seoul';
var DEFAULT_PIN = '1111'; // 새로 등록하는 학생의 임시 비밀번호. 학생이 처음 로그인할 때 자기 번호로 바꿔요.
var SITE_URL_DEFAULT = 'https://myscilab.co.kr'; // 새 사이트 주소 (강사 화면에서 바꿀 수 있음)
var TOKEN_DAYS = { s: 14, p: 30 };   // 로그인 유지: 학생 14일, 학부모 30일
var ADMIN_TOKEN_HOURS = 12;          // 강사 12시간
var NEW_PIN_LENGTH = 6;              // 새 사이트에서 학생이 정하는 비밀번호 자릿수

var HEADERS = {
  Classes: ['id', 'academy', 'name', 'createdAt', 'archived'], // archived: 종강한 날(yyyy-MM-dd), 비면 진행 중
  Students: ['key', 'school', 'grade', 'name', 'pin', 'createdAt', 'className', 'classId', 'joinedAt', 'pinSet',
    'pinHash', 'pinSalt', 'pinVersion', 'parentCode', 'receive'], // receive: 늘 받는 것 (v 영상, f 자료)
  Lectures: ['id', 'school', 'grade', 'date', 'startTime', 'title', 'memo', 'questionsJson', 'updatedAt', 'targetsJson'],
  Submissions: ['lectureId', 'studentKey', 'firstAnswersJson', 'confusedJson', 'firstResultJson',
    'retryAnswersJson', 'phase', 'essayScoresJson', 'score', 'max', 'late', 'submittedAt', 'retryAt'],
  Tests: ['id', 'school', 'grade', 'date', 'title', 'questionsJson', 'resultsJson', 'updatedAt', 'className', 'classId', 'targetsJson'],
  Videos: ['id', 'title', 'memo', 'url', 'targetsJson', 'updatedAt'],
  Notices: ['id', 'title', 'body', 'image', 'linkUrl', 'linkLabel', 'pinned', 'targetsJson', 'updatedAt'],
  Materials: ['id', 'title', 'memo', 'fileId', 'fileName', 'mime', 'size', 'stamp', 'targetsJson', 'updatedAt'],
  Downloads: ['materialId', 'studentKey', 'at', 'unitId'], // materialId = 파일 ID (예전 자료 ID 그대로 이어짐)
  // 차시: 영상 여러 개(1교시·2교시…) + 파일 여러 개를 한 번에 공개
  Units: ['id', 'title', 'memo', 'videosJson', 'filesJson', 'targetsJson', 'updatedAt', 'legacyIds', 'audience'], // audience: all 반 전체 · pick 고른 학생만
  Comments: ['studentKey', 'month', 'text', 'updatedAt'],  // 학부모 리포트용 월별 강사 코멘트
  Exams: ['id', 'studentKey', 'title', 'date', 'updatedAt', 'rangeJson'], // 학생이 직접 넣는 시험 D-day (+범위 숙제)
  Attendance: ['date', 'classId', 'studentKey', 'status', 'note', 'by', 'at'], // status: O 출석 · L 지각 · A 결석 · E 조퇴 · V 영상 수강
  Journal: ['date', 'classId', 'text', 'updatedAt'],                           // 수업 일지
  Notes: ['id', 'studentKey', 'date', 'tag', 'text', 'pinned', 'remindAt', 'done', 'updatedAt'], // 강사만 보는 메모
  Questions: ['id', 'studentKey', 'src', 'refId', 'no', 'text', 'answer', 'status', 'askedAt', 'answeredAt', 'seen'],
  Reviews: ['studentKey', 'src', 'refId', 'no', 'stage', 'nextAt', 'lastAt', 'lastResult'], // 오답 다시 풀기
  Views: ['unitId', 'videoId', 'studentKey', 'at'],                             // 영상 열어 본 기록
  Watch: ['unitId', 'videoId', 'studentKey', 'dur', 'bits', 'pct', 'pos', 'sec', 'updatedAt', 'doneAt'] // 영상 시청 진도 (5초 칸)
};
var AUTO_SHEETS = ['Classes', 'Videos', 'Notices', 'Materials', 'Downloads', 'Units', 'Comments', 'Exams',
  'Attendance', 'Journal', 'Notes', 'Questions', 'Reviews', 'Views', 'Watch'];

// ===================== 최초 1회 설정 =====================
function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(HEADERS).forEach(function (name) { makeSheet_(ss, name); });
  getImageFolder_();
  migrate_();
}
function makeSheet_(ss, name) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  ensureHeaders_(sh, name);
  sh.setFrozenRows(1);
  // 날짜·비밀번호(0으로 시작하는 숫자)가 자동 변환되지 않도록 전부 텍스트 형식으로
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).setNumberFormat('@');
  return sh;
}

// ===================== 웹앱 진입점 =====================
// 옛 주소(긴 script.google.com 주소·기존 QR)로 들어오면: 전환 전에는 예전 화면, 전환 후에는 새 사이트 안내.
// ?action=ping 은 새 사이트가 서버 연결을 확인할 때 씀.
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === 'ping') return json_({ ok: true, data: { app: APP_TITLE, version: API_VERSION } });
  if (siteSwitched_()) return redirectPage_();
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle(APP_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ===================== 시트 유틸 =====================
function sheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    if (AUTO_SHEETS.indexOf(name) !== -1) return makeSheet_(ss, name);
    throw new Error('"' + name + '" 시트가 없어요. Apps Script에서 setupSheets를 먼저 실행하세요.');
  }
  return sh;
}
// 시트 첫 줄에 빠진 칸 이름이 있으면 오른쪽 끝에 추가 (예전 버전 시트 자동 업그레이드)
function ensureHeaders_(sh, name) {
  var want = HEADERS[name];
  var lastCol = sh.getLastColumn();
  var have = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
  var missing = want.filter(function (h) { return have.indexOf(h) === -1; });
  if (!missing.length) return have;
  var start = have.filter(function (h) { return h !== ''; }).length + 1;
  if (start + missing.length - 1 > sh.getMaxColumns()) sh.insertColumnsAfter(sh.getMaxColumns(), missing.length);
  sh.getRange(1, start, 1, missing.length).setValues([missing]);
  sh.getRange(1, start, sh.getMaxRows(), missing.length).setNumberFormat('@');
  invalidate_(name);
  return have.slice(0, start - 1).concat(missing);
}
function cellStr_(v, header) {
  if (v instanceof Date) {
    if (header === 'startTime') return Utilities.formatDate(v, TZ, 'HH:mm');
    return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  }
  return v == null ? '' : String(v);
}
// 한 번의 요청 안에서 같은 시트를 여러 번 읽지 않게 기억해 둠 (쓰면 지움)
var READ_CACHE_ = {};
// 속도: 시트 내용을 구글 임시 저장소(CacheService)에도 담아 두고, 저장할 때만 새로 읽음.
// 시트를 직접 고치면 onEdit가 바로 지워 주고, 혹시 놓쳐도 30분 뒤엔 새로 읽음.
var SHEET_CACHE_TTL = 1800, SHEET_CHUNK = 30000;
function sheetVer_(name, bump) {
  var c = CacheService.getScriptCache(), k = 'v:' + name;
  var v = bump ? null : c.get(k);
  if (!v) { v = randomHex_(10); c.put(k, v, 21600); }
  return v;
}
function cacheGetValues_(name, ver) {
  try {
    var c = CacheService.getScriptCache(), base = 's:' + name + ':' + ver;
    var head = c.get(base);
    if (!head) return null;
    var n = Number(head), keys = [];
    for (var i = 0; i < n; i++) keys.push(base + ':' + i);
    var got = c.getAll(keys), str = '';
    for (var j = 0; j < n; j++) { if (got[keys[j]] == null) return null; str += got[keys[j]]; }
    return JSON.parse(str);
  } catch (e) { return null; }
}
function cachePutValues_(name, ver, values) {
  try {
    var str = JSON.stringify(values), n = Math.ceil(str.length / SHEET_CHUNK);
    if (n > 100) return;
    var c = CacheService.getScriptCache(), base = 's:' + name + ':' + ver, obj = {};
    for (var i = 0; i < n; i++) obj[base + ':' + i] = str.substr(i * SHEET_CHUNK, SHEET_CHUNK);
    c.putAll(obj, SHEET_CACHE_TTL);
    c.put(base, String(n), SHEET_CACHE_TTL);
  } catch (e) { }
}
function invalidate_(name) {
  delete READ_CACHE_[name];
  try { sheetVer_(name, true); } catch (e) { }
}
// 시트를 직접 손으로 고쳤을 때 (단순 트리거라 따로 설정할 것 없음)
function onEdit(e) {
  try { invalidate_(e.range.getSheet().getName()); } catch (x) { }
}
function readAll_(name) {
  if (READ_CACHE_[name]) return READ_CACHE_[name].slice();
  var ver = '';
  try { ver = sheetVer_(name); } catch (e) { }
  var values = ver ? cacheGetValues_(name, ver) : null;
  if (!values) {
    var raw = sheet_(name).getDataRange().getValues();
    var hdr = raw.length ? raw[0].map(String) : [];
    values = raw.map(function (row, i) { return i === 0 ? hdr : row.map(function (v, j) { return cellStr_(v, hdr[j]); }); });
    if (ver) cachePutValues_(name, ver, values);
  }
  var out = [];
  if (values.length >= 2) {
    var h = values[0];
    for (var i = 1; i < values.length; i++) {
      var o = { __row: i + 1 };
      for (var j = 0; j < h.length; j++) if (h[j] !== '') o[h[j]] = values[i][j] == null ? '' : values[i][j];
      HEADERS[name].forEach(function (k) { if (o[k] === undefined) o[k] = ''; });
      out.push(o);
    }
  }
  READ_CACHE_[name] = out;
  return out.slice();
}
function writeRow_(name, rowNum, obj) {
  invalidate_(name);
  var sh = sheet_(name);
  var headers = ensureHeaders_(sh, name);
  if (rowNum < 0) {
    rowNum = Math.max(sh.getLastRow(), 1) + 1;
    if (rowNum > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 50);
  }
  var vals = headers.map(function (k) { var x = obj[k]; return x == null ? '' : String(x); });
  sh.getRange(rowNum, 1, 1, headers.length).setNumberFormat('@').setValues([vals]);
  invalidate_(name);
}
function upsert_(name, matchFn, obj) {
  var rows = readAll_(name);
  var rowNum = -1;
  for (var i = 0; i < rows.length; i++) if (matchFn(rows[i])) { rowNum = rows[i].__row; break; }
  writeRow_(name, rowNum, obj);
}
function setCell_(name, rowNum, header, value) {
  invalidate_(name);
  var sh = sheet_(name);
  var headers = ensureHeaders_(sh, name);
  sh.getRange(rowNum, headers.indexOf(header) + 1).setNumberFormat('@').setValue(value == null ? '' : String(value));
}
function deleteWhere_(name, matchFn) {
  var sh = sheet_(name);
  var rows = readAll_(name);
  for (var i = rows.length - 1; i >= 0; i--) if (matchFn(rows[i])) sh.deleteRow(rows[i].__row);
  invalidate_(name);
}
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  READ_CACHE_ = {}; // 잠금을 잡은 뒤에는 시트를 새로 읽음
  try { return fn(); } finally { lock.releaseLock(); }
}
function parseJson_(s, fallback) {
  if (!s) return fallback;
  try { return JSON.parse(s); } catch (e) { return fallback; }
}

// ===================== 공통 유틸 =====================
function todayKst_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function nowKst_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'); }
function norm_(s) { return String(s == null ? '' : s).trim().replace(/\s+/g, ' '); }
function normPin_(p) {
  var d = String(p == null ? '' : p).replace(/\D/g, '');
  while (d.length < 4) d = '0' + d;
  return d;
}
function randomPin_() {
  var d = String(Math.floor(Math.random() * 10000));
  while (d.length < 4) d = '0' + d;
  return d;
}
function studentKey_(school, grade, name) { return norm_(school) + '|' + norm_(grade) + '|' + norm_(name); }
function newId_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 12); }
// 강사 확인: 새 사이트는 강사 토큰, 예전 화면은 비밀번호를 매번 보냄. 둘 다 여기서 확인.
function checkAdmin_(pw) {
  pw = String(pw == null ? '' : pw);
  if (isToken_(pw)) { verifyAdminToken_(pw); return; }
  checkAdminPassword_(pw);
}

// ===================== 예전 버전 데이터 → 반 목록으로 자동 이전 (한 번만) =====================
// 예전에는 반이 "학교+학년+반 이름"이었음. 그 조합마다 반을 하나씩 만들고 학생·숙제·테스트를 연결.
function migrate_() {
  migratePins_(); // 학생이 정한 비밀번호 → 해시 (한 번만)
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('CLASS_MIGRATED') === '1') return;
  withLock_(function () {
    if (props.getProperty('CLASS_MIGRATED') === '1') return;
    var byLabel = {};
    readAll_('Classes').forEach(function (c) { byLabel[c.name] = c.id; });
    function idFor(school, grade, className) {
      if (!norm_(school) || !norm_(grade)) return '';
      var label = norm_(school) + ' ' + norm_(grade) + (norm_(className) ? ' ' + norm_(className) : '');
      if (!byLabel[label]) {
        var id = newId_();
        writeRow_('Classes', -1, { id: id, academy: '', name: label, createdAt: nowKst_() });
        byLabel[label] = id;
      }
      return byLabel[label];
    }
    readAll_('Students').forEach(function (r) {
      if (!r.classId) { var id = idFor(r.school, r.grade, r.className); if (id) setCell_('Students', r.__row, 'classId', id); }
    });
    readAll_('Lectures').forEach(function (r) {
      var targets = parseJson_(r.targetsJson, null);
      if (!targets || !targets.length) targets = [{ school: r.school, grade: r.grade, className: '', date: r.date, startTime: r.startTime }];
      var changed = false;
      targets.forEach(function (t) {
        if (!t.classId) { t.classId = idFor(t.school, t.grade, t.className); changed = true; }
      });
      if (changed) setCell_('Lectures', r.__row, 'targetsJson', JSON.stringify(targets.map(function (t) {
        return { classId: t.classId, date: t.date || '', startTime: t.startTime || '' };
      })));
    });
    readAll_('Tests').forEach(function (r) {
      if (!r.classId) { var id = idFor(r.school, r.grade, r.className); if (id) setCell_('Tests', r.__row, 'classId', id); }
    });
    props.setProperty('CLASS_MIGRATED', '1');
  });
}

// ===================== 채점 로직 (순수 함수) =====================
function normShort_(s) { return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ''); }
// 객관식 답을 1~5 숫자만 골라 중복 없이 정렬한 문자열로 (예: '4+5' → '45', '3' → '3')
// 정답이 두 개 이상이면 학생도 그 개수만큼 전부 골라야 정답.
function mcqKey_(s) {
  var seen = {};
  String(s == null ? '' : s).replace(/[1-5]/g, function (d) { seen[d] = 1; return d; });
  return Object.keys(seen).sort().join('');
}

// 1차 채점: 문항 번호 → 'O' | 'X' | 'P'(서술형 채점 대기)
function gradeFirst_(questions, answers) {
  var result = {};
  questions.forEach(function (q) {
    if (q.type === 'essay') { result[q.no] = 'P'; return; }
    result[q.no] = isCorrect_(q, answers[q.no]) ? 'O' : 'X';
  });
  return result;
}
function isCorrect_(q, a) {
  if (a == null || String(a).trim() === '') return false;
  if (q.type === 'mcq') { var want = mcqKey_(q.answer); return !!want && mcqKey_(a) === want; }
  if (q.type === 'short') {
    // 인정 답이 여러 개면 / 또는 , 로 구분 (예: 마이토콘드리아/미토콘드리아)
    var accepted = String(q.answer || '').split(/[\/,]/).map(normShort_).filter(function (x) { return x; });
    return accepted.indexOf(normShort_(a)) !== -1;
  }
  return false;
}
// 서술형은 강사가 매긴 점수가 있으면 반영, 만점이면 맞은 것으로 봄
function effectiveResult_(q, firstResult, essayScores) {
  if (q.type !== 'essay') return firstResult[q.no] || 'X';
  var s = essayScores[q.no];
  if (s === undefined || s === null || s === '') return 'P';
  return Number(s) >= (Number(q.points) || 1) ? 'O' : 'X';
}
function computeScore_(questions, firstResult, essayScores) {
  var score = 0, max = 0, pending = 0;
  questions.forEach(function (q) {
    var pts = Number(q.points) || 1;
    max += pts;
    if (q.type === 'essay') {
      var s = essayScores[q.no];
      if (s === undefined || s === null || s === '') pending++;
      else score += Math.min(Number(s) || 0, pts);
    } else if (firstResult[q.no] === 'O') {
      score += pts;
    }
  });
  return { score: score, max: max, pending: pending };
}
function areaStats_(questions, firstResult, essayScores, confused) {
  var map = {}, order = [];
  questions.forEach(function (q) {
    var area = norm_(q.area) || '기타';
    if (!map[area]) { map[area] = { area: area, total: 0, correct: 0, wrong: 0, confused: 0, pending: 0, wrongNos: [] }; order.push(area); }
    var st = map[area];
    st.total++;
    var r = effectiveResult_(q, firstResult, essayScores);
    if (r === 'O') st.correct++;
    else if (r === 'X') { st.wrong++; st.wrongNos.push(q.no); }
    else st.pending++;
    if (confused && confused.indexOf(q.no) !== -1) st.confused++;
  });
  return order.map(function (k) { return map[k]; }).sort(function (a, b) { return b.wrong - a.wrong; });
}

// ===================== 반 =====================
function allClasses_() {
  return readAll_('Classes').map(function (r) { return { id: r.id, academy: norm_(r.academy), name: norm_(r.name), archived: r.archived || '' }; });
}
function classLabel_(c) { return c ? (c.academy ? c.academy + ' · ' + c.name : c.name) : '(반 없음)'; }
function classMap_() { var m = {}; allClasses_().forEach(function (c) { m[c.id] = c; }); return m; }

// ===================== 강의 =====================
// 강의 한 개가 여러 반에 걸릴 수 있음. targets = [{classId, date, startTime}]
function parseLecture_(r) {
  var targets = parseJson_(r.targetsJson, []) || [];
  targets = targets.filter(function (t) { return t && t.classId; })
    .map(function (t) { return { classId: t.classId, date: t.date || '', startTime: t.startTime || '' }; });
  return { id: r.id, title: r.title, memo: r.memo, questions: parseJson_(r.questionsJson, []), targets: targets };
}
function allLectures_() { return readAll_('Lectures').map(parseLecture_); }
function targetFor_(lec, classId) {
  if (!classId) return null;
  for (var i = 0; i < lec.targets.length; i++) if (lec.targets[i].classId === classId) return lec.targets[i];
  return null;
}
// 반 하나의 강의 일정: [{lec, t}] 날짜·시각 순
function classEvents_(all, classId) {
  var ev = [];
  all.forEach(function (l) { var t = targetFor_(l, classId); if (t) ev.push({ lec: l, t: t }); });
  ev.sort(function (a, b) {
    var x = a.t.date + ' ' + (a.t.startTime || ''), y = b.t.date + ' ' + (b.t.startTime || '');
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return ev;
}
// 마감 = 같은 반의 다음 강의 날짜·시작 시각. 다음 강의가 아직 없으면 마감 없음('').
function deadlineFor_(t, events) {
  for (var i = 0; i < events.length; i++) {
    var n = events[i].t;
    if (n.date > t.date) return n.date + ' ' + (n.startTime ? addMinutes_(n.startTime, -timing_().dueBefore) : '00:00');
  }
  return '';
}
// 시간 규칙: 숙제 마감 = 다음 수업 시작 N분 전, QR 지각 = 수업 시작 M분 뒤부터
var TIMING_CACHE_ = null;
function timing_() {
  if (TIMING_CACHE_) return TIMING_CACHE_;
  var p = PropertiesService.getScriptProperties();
  function num(k, def) { var v = p.getProperty(k); var n = Number(v); return (v === null || v === '' || isNaN(n)) ? def : n; }
  TIMING_CACHE_ = { dueBefore: num('DUE_BEFORE', 30), lateAfter: num('LATE_AFTER', 10) };
  return TIMING_CACHE_;
}
function adminTiming_(tok, d) {
  checkAdmin_(tok);
  if (d && d.save) {
    var b = Math.round(Number(d.dueBefore)), l = Math.round(Number(d.lateAfter));
    if (isNaN(b) || b < 0 || b > 180) throw new Error('숙제 마감은 0~180분 사이로 넣어 주세요.');
    if (isNaN(l) || l < 0 || l > 60) throw new Error('지각 기준은 0~60분 사이로 넣어 주세요.');
    var p = PropertiesService.getScriptProperties();
    p.setProperty('DUE_BEFORE', String(b)); p.setProperty('LATE_AFTER', String(l));
    TIMING_CACHE_ = null;
  }
  return timing_();
}

// ===================== 제출 =====================
function parseSub_(r) {
  return {
    lectureId: r.lectureId, studentKey: r.studentKey,
    firstAnswers: parseJson_(r.firstAnswersJson, {}),
    confused: parseJson_(r.confusedJson, []),
    firstResult: parseJson_(r.firstResultJson, {}),
    retryAnswers: parseJson_(r.retryAnswersJson, {}),
    phase: r.phase,
    essayScores: parseJson_(r.essayScoresJson, {}),
    late: r.late === 'true',
    submittedAt: r.submittedAt, retryAt: r.retryAt
  };
}
function subToRow_(s, lec) {
  var sc = computeScore_(lec.questions, s.firstResult, s.essayScores);
  return {
    lectureId: s.lectureId, studentKey: s.studentKey,
    firstAnswersJson: JSON.stringify(s.firstAnswers), confusedJson: JSON.stringify(s.confused),
    firstResultJson: JSON.stringify(s.firstResult), retryAnswersJson: JSON.stringify(s.retryAnswers || {}),
    phase: s.phase, essayScoresJson: JSON.stringify(s.essayScores || {}),
    score: sc.score, max: sc.max, late: s.late ? 'true' : 'false',
    submittedAt: s.submittedAt, retryAt: s.retryAt || ''
  };
}
function findSub_(lectureId, studentKey) {
  var rows = readAll_('Submissions');
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].lectureId === lectureId && rows[i].studentKey === studentKey) return parseSub_(rows[i]);
  }
  return null;
}

// ===================== 학생 인증 =====================
// 예전 로그인 화면용. 이제 학교 목록을 공개하지 않으므로 빈 목록을 돌려줌.
function getLoginOptions() { return []; }
// 학교 이름 표기 차이 맞추기: 공백 무시, 고등학교→고, 중학교→중, 여자고→여고, 끝의 '고' 생략 허용
function normSchool_(s) {
  var x = String(s == null ? '' : s).replace(/\s+/g, '');
  x = x.replace(/고등학교$/, '고').replace(/중학교$/, '중').replace(/여자고$/, '여고').replace(/여자중$/, '여중');
  return x;
}
function sameSchool_(input, stored) {
  var a = normSchool_(input), b = normSchool_(stored);
  if (!a || !b) return false;
  return a === b || a + '고' === b || a === b + '고';
}
function normName_(s) { return String(s == null ? '' : s).replace(/\s+/g, ''); }
function studentFromRow_(r) {
  return { key: r.key, school: r.school, grade: r.grade, name: r.name, classId: r.classId, joinedAt: r.joinedAt || '',
    pinSet: r.pinSet === '1', receive: r.receive || '', row: r.__row };
}
// 학생 확인: 새 사이트는 { token }, 예전 화면은 { school, grade, name, pin }을 매번 보냄.
function auth_(a) {
  migrate_();
  if (!a) throw new Error('AUTH');
  if (a.token) {
    var p = verifyToken_(a.token, 's');
    var r = studentRowByKey_(p.k);
    if (!r || String(Number(r.pinVersion) || 0) !== String(p.v)) throw new Error('AUTH');
    return studentFromRow_(r);
  }
  var key = studentKey_(a.school, a.grade, a.name);
  var rows = readAll_('Students');
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].key === key) {
      if (pinMatches_(rows[i], a.pin)) return studentFromRow_(rows[i]);
      break;
    }
  }
  throw new Error('AUTH');
}
function studentRowByKey_(key) {
  var rows = readAll_('Students');
  for (var i = 0; i < rows.length; i++) if (rows[i].key === key) return rows[i];
  return null;
}
// 학교(직접 입력)·이름·비밀번호로 학생 찾기. 5번 틀리면 10분 잠금.
// 같은 학교·이름·비밀번호인 학생이 둘 이상이면 로그인을 막고 선생님께 문의하게 함.
function findLoginStudent_(school, name, pin) {
  var nm = normName_(name);
  var lockKey = 'stu:' + normSchool_(school) + '|' + nm;
  checkLock_(lockKey);
  var digits = String(pin == null ? '' : pin).trim();
  if (!nm || !/^\d{4}(\d{2})?$/.test(digits)) { addFail_(lockKey, 5, 600); return { ok: false }; }
  var hits = readAll_('Students').filter(function (r) {
    return normName_(r.name) === nm && sameSchool_(school, r.school) && pinMatches_(r, digits);
  });
  if (hits.length !== 1) {
    if (!hits.length) addFail_(lockKey, 5, 600);
    return { ok: false, dup: hits.length > 1 };
  }
  clearFail_(lockKey);
  return { ok: true, row: hits[0] };
}
// 예전 화면 로그인
function studentLogin(a) {
  migrate_();
  if (!a) return { ok: false };
  var f;
  try { f = findLoginStudent_(a.school, a.name, a.pin); } catch (e) { return { ok: false, locked: true }; }
  if (!f.ok) return f;
  var r = f.row;
  return { ok: true, student: { school: r.school, grade: r.grade, name: r.name }, mustChange: r.pinSet !== '1' };
}
// 비밀번호가 쉬운지 확인 (같은 숫자 반복, 123456 같은 연속)
function weakPin_(p) {
  if (/^(\d)\1+$/.test(p)) return true;
  var up = '0123456789012', down = '9876543210987';
  return up.indexOf(p) !== -1 || down.indexOf(p) !== -1;
}
// 학생이 직접 비밀번호 바꾸기 (공통). 새 비밀번호는 해시로만 저장하고 pinVersion을 올려 예전 토큰을 끊음.
function changePinCore_(st, currentPin, newPin, lengths) {
  newPin = String(newPin == null ? '' : newPin).trim();
  var okLen = lengths.some(function (n) { return new RegExp('^\\d{' + n + '}$').test(newPin); });
  if (!okLen) throw new Error('새 비밀번호는 숫자 ' + lengths.join(' 또는 ') + '자리로 정해 주세요.');
  if (weakPin_(newPin)) throw new Error('너무 쉬운 번호예요. 다른 번호로 정해 주세요.');
  return withLock_(function () {
    var row = studentRowByKey_(st.key);
    if (!row || !pinMatches_(row, currentPin)) throw new Error('지금 비밀번호가 맞지 않아요.');
    if (pinMatches_(row, newPin)) throw new Error('지금 비밀번호와 다른 번호로 정해 주세요.');
    var same = readAll_('Students').some(function (r) {
      return r.key !== st.key && normName_(r.name) === normName_(st.name) && sameSchool_(st.school, r.school) && pinMatches_(r, newPin);
    });
    if (same) throw new Error('이 번호는 쓸 수 없어요. 다른 번호로 정해 주세요.');
    var salt = randomHex_(16);
    var ver = (Number(row.pinVersion) || 0) + 1;
    setCell_('Students', row.__row, 'pinSalt', salt);
    setCell_('Students', row.__row, 'pinHash', pinHash_(salt, newPin));
    setCell_('Students', row.__row, 'pin', '');
    setCell_('Students', row.__row, 'pinSet', '1');
    setCell_('Students', row.__row, 'pinVersion', ver);
    return { ok: true, pinVersion: ver };
  });
}
// 예전 화면에서 바꾸기 (예전 화면은 4자리만 입력 가능해서 4자리도 받음)
function studentChangePin(a, newPin) {
  var st = auth_(a);
  changePinCore_(st, a.pin, newPin, [4, NEW_PIN_LENGTH]);
  return { ok: true };
}

// ===================== 학생 화면 데이터 =====================
function studentHome(a) {
  var st = auth_(a);
  var today = todayKst_(), now = nowKst_();
  var events = classEvents_(allLectures_(), st.classId);
  var subBy = {};
  readAll_('Submissions').forEach(function (r) { if (r.studentKey === st.key) subBy[r.lectureId] = parseSub_(r); });

  var list = events.filter(function (e) { return e.t.date <= today; }).map(function (e) {
    var l = e.lec, sub = subBy[l.id];
    var deadline = deadlineFor_(e.t, events);
    var status = !sub ? ((deadline && now > deadline) ? 'overdue' : 'todo') : (sub.phase === 'retry' ? 'retry' : 'done');
    var item = { id: l.id, date: e.t.date, title: l.title, memo: l.memo, deadline: deadline,
      count: l.questions.length, status: status, late: sub ? sub.late : false };
    if (sub) {
      var sc = computeScore_(l.questions, sub.firstResult, sub.essayScores);
      item.score = sc.score; item.max = sc.max; item.pending = sc.pending;
    }
    return item;
  });
  list.sort(function (x, y) { return x.date < y.date ? 1 : -1; });
  var upcoming = events.filter(function (e) { return e.t.date > today; }).length;
  return { student: { school: st.school, grade: st.grade, name: st.name }, lectures: list, upcoming: upcoming, mustChange: !st.pinSet };
}

function buildStudentView_(lec, t, sub, deadline) {
  var view = {
    id: lec.id, date: t.date, title: lec.title, memo: lec.memo, deadline: deadline,
    questions: lec.questions.map(function (q) {
      var v = { no: q.no, type: q.type, points: Number(q.points) || 1, hasQ: !!q.qImage };
      if (q.type === 'mcq') v.pick = mcqKey_(q.answer).length || 1; // 골라야 할 답 개수
      return v;
    }),
    phase: sub ? sub.phase : 'new'
  };
  if (!sub) return view;

  var sc = computeScore_(lec.questions, sub.firstResult, sub.essayScores);
  view.score = sc.score; view.max = sc.max; view.pending = sc.pending;
  view.late = sub.late;
  view.wrongNos = lec.questions.filter(function (q) { return q.type !== 'essay' && sub.firstResult[q.no] === 'X'; })
    .map(function (q) { return q.no; });

  if (sub.phase === 'revealed') {
    view.items = lec.questions.map(function (q) {
      var retry = sub.retryAnswers[q.no];
      return {
        no: q.no, type: q.type, points: Number(q.points) || 1, area: norm_(q.area) || '기타',
        answer: q.answer, expText: q.expText || '', hasImage: !!q.expImage, hasQ: !!q.qImage,
        first: sub.firstAnswers[q.no] == null ? '' : sub.firstAnswers[q.no],
        retry: retry == null ? '' : retry,
        retryCorrect: retry == null ? null : isCorrect_(q, retry),
        result: effectiveResult_(q, sub.firstResult, sub.essayScores),
        essayScore: q.type === 'essay' ? (sub.essayScores[q.no] == null ? null : sub.essayScores[q.no]) : null,
        confused: sub.confused.indexOf(q.no) !== -1
      };
    });
    view.areas = areaStats_(lec.questions, sub.firstResult, sub.essayScores, sub.confused);
  }
  return view;
}

// 학생이 볼 수 있는 강의인지 확인하고 반 일정 정보와 함께 돌려줌
// (이미 제출한 숙제는 반이 바뀌어도 다시 볼 수 있음)
function studentLectureCtx_(st, id, requireOpen) {
  var all = allLectures_();
  var lec = null;
  for (var i = 0; i < all.length; i++) if (all[i].id === id) { lec = all[i]; break; }
  if (!lec) throw new Error('NOT_FOUND');
  var t = targetFor_(lec, st.classId);
  var events = classEvents_(all, st.classId);
  if (!t) {
    if (requireOpen || !findSub_(id, st.key) || !lec.targets.length) throw new Error('NOT_FOUND');
    t = lec.targets[0];
    events = [];
  }
  if (t.date > todayKst_()) throw new Error('NOT_FOUND');
  return { lec: lec, t: t, deadline: deadlineFor_(t, events) };
}

function studentLecture(a, id) {
  var st = auth_(a);
  var c = studentLectureCtx_(st, id, false);
  return buildStudentView_(c.lec, c.t, findSub_(id, st.key), c.deadline);
}

function studentSubmitFirst(a, id, answers, confused) {
  var st = auth_(a);
  return withLock_(function () {
    var c = studentLectureCtx_(st, id, true);
    var lec = c.lec;
    var existing = findSub_(id, st.key);
    if (existing) return buildStudentView_(lec, c.t, existing, c.deadline); // 첫 시도만 기록

    var clean = {};
    lec.questions.forEach(function (q) { if (answers && answers[q.no] != null) clean[q.no] = String(answers[q.no]).slice(0, 2000); });
    var confusedNos = (confused || []).map(Number).filter(function (n) {
      return lec.questions.some(function (q) { return q.no === n; });
    });
    var firstResult = gradeFirst_(lec.questions, clean);
    var hasWrong = lec.questions.some(function (q) { return q.type !== 'essay' && firstResult[q.no] === 'X'; });
    var now = nowKst_();
    var sub = {
      lectureId: id, studentKey: st.key, firstAnswers: clean, confused: confusedNos, firstResult: firstResult,
      retryAnswers: {}, phase: hasWrong ? 'retry' : 'revealed', essayScores: {},
      late: !!(c.deadline && now > c.deadline), submittedAt: now, retryAt: ''
    };
    upsert_('Submissions', function (r) { return r.lectureId === id && r.studentKey === st.key; }, subToRow_(sub, lec));
    return buildStudentView_(lec, c.t, sub, c.deadline);
  });
}

function studentSubmitRetry(a, id, retryAnswers) {
  var st = auth_(a);
  return withLock_(function () {
    var c = studentLectureCtx_(st, id, false);
    var lec = c.lec;
    var sub = findSub_(id, st.key);
    if (!sub) throw new Error('NOT_FOUND');
    if (sub.phase !== 'retry') return buildStudentView_(lec, c.t, sub, c.deadline);
    var clean = {};
    lec.questions.forEach(function (q) {
      if (q.type !== 'essay' && sub.firstResult[q.no] === 'X' && retryAnswers && retryAnswers[q.no] != null) {
        clean[q.no] = String(retryAnswers[q.no]).slice(0, 2000);
      }
    });
    sub.retryAnswers = clean;
    sub.phase = 'revealed';
    sub.retryAt = nowKst_();
    upsert_('Submissions', function (r) { return r.lectureId === id && r.studentKey === st.key; }, subToRow_(sub, lec));
    return buildStudentView_(lec, c.t, sub, c.deadline);
  });
}

function studentExplanationImage(a, id, no) {
  var st = auth_(a);
  var c = studentLectureCtx_(st, id, false);
  var sub = findSub_(id, st.key);
  if (!sub || sub.phase !== 'revealed') throw new Error('LOCKED');
  var q = c.lec.questions.filter(function (x) { return x.no === Number(no); })[0];
  if (!q || !q.expImage) return null;
  return imageDataUrl_(q.expImage);
}

function studentRecords(a) { return studentRecordsCore_(auth_(a)); }
function studentRecordsCore_(st, from, to) {
  function inRange(d) { return (!from || d >= from) && (!to || d <= to); }
  var all = allLectures_();
  var lecBy = {};
  all.forEach(function (l) { lecBy[l.id] = l; });
  var areaTotals = {};
  function addArea(area, ok, wrong) {
    area = norm_(area) || '기타';
    if (!areaTotals[area]) areaTotals[area] = { area: area, total: 0, correct: 0, wrong: 0 };
    areaTotals[area].total++;
    if (ok) areaTotals[area].correct++;
    if (wrong) areaTotals[area].wrong++;
  }

  var homework = readAll_('Submissions').filter(function (r) { return r.studentKey === st.key && lecBy[r.lectureId]; })
    .map(function (r) {
      var s = parseSub_(r), l = lecBy[r.lectureId];
      var t = targetFor_(l, st.classId) || l.targets[0] || { date: '' };
      if (!inRange(t.date)) return null;
      var sc = computeScore_(l.questions, s.firstResult, s.essayScores);
      var wrongNos = [];
      l.questions.forEach(function (q) {
        var res = effectiveResult_(q, s.firstResult, s.essayScores);
        if (res === 'P') return;
        addArea(q.area, res === 'O', res === 'X');
        if (res === 'X') wrongNos.push(q.no);
      });
      return { id: l.id, date: t.date, title: l.title, score: sc.score, max: sc.max, pending: sc.pending, late: s.late, wrongNos: wrongNos };
    }).filter(function (x) { return x; });
  homework.sort(function (x, y) { return x.date < y.date ? 1 : -1; });

  var tests = readAll_('Tests').map(function (r) {
    var res = parseJson_(r.resultsJson, {})[st.key];
    if (!res) return null;
    var tt = testTargetFor_(r, st.classId);
    var tdate = tt ? tt.date : r.date;
    if (!inRange(tdate)) return null;
    if (res.absent) return { id: r.id, date: tdate, title: r.title, absent: true };
    var qs = parseJson_(r.questionsJson, []);
    var score = 0, max = 0, wrongNos = [], graded = 0;
    qs.forEach(function (q) {
      var pts = Number(q.points) || 1;
      var m = res.marks ? res.marks[q.no] : null;
      max += pts;
      if (m === 1) { score += pts; graded++; addArea(q.area, true, false); }
      else if (m === 0) { wrongNos.push(q.no); graded++; addArea(q.area, false, true); }
    });
    if (!graded) return null;
    return { id: r.id, date: tdate, title: r.title, score: score, max: max, wrongNos: wrongNos };
  }).filter(function (x) { return x; });
  tests.sort(function (x, y) { return x.date < y.date ? 1 : -1; });

  var areas = Object.keys(areaTotals).map(function (k) { return areaTotals[k]; })
    .sort(function (x, y) { return (x.correct / x.total) - (y.correct / y.total); });
  return { homework: homework, tests: tests, areas: areas };
}

// ===================== 해설 이미지 (드라이브) =====================
function getImageFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('IMG_FOLDER');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { } }
  var folder = DriveApp.createFolder(APP_TITLE + ' - 해설 이미지');
  props.setProperty('IMG_FOLDER', folder.getId());
  return folder;
}
function imageDataUrl_(fileId) {
  try {
    var blob = DriveApp.getFileById(fileId).getBlob();
    return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
  } catch (e) { return null; }
}

// ===================== 강사용 API (모두 비밀번호 확인) =====================
function admin_(pw) { checkAdmin_(pw); migrate_(); }
function adminLogin(pw) {
  try { admin_(pw); return { ok: true }; } catch (e) { return { ok: false }; }
}

// --- 반 ---
function adminClasses(pw) {
  admin_(pw);
  var stats = {};
  allClasses_().forEach(function (c) { stats[c.id] = { id: c.id, academy: c.academy, name: c.name, label: classLabel_(c), archived: c.archived, students: 0, lectures: 0, tests: 0 }; });
  readAll_('Students').forEach(function (r) { if (stats[r.classId]) stats[r.classId].students++; });
  allLectures_().forEach(function (l) { l.targets.forEach(function (t) { if (stats[t.classId]) stats[t.classId].lectures++; }); });
  readAll_('Tests').forEach(function (r) { testTargets_(r).forEach(function (t) { if (stats[t.classId]) stats[t.classId].tests++; }); });
  return Object.keys(stats).map(function (k) { return stats[k]; }).sort(function (a, b) {
    return (a.academy || '￿').localeCompare(b.academy || '￿') || a.name.localeCompare(b.name);
  });
}
function adminSaveClass(pw, p) {
  admin_(pw);
  var academy = norm_(p.academy), name = norm_(p.name);
  if (!name) throw new Error('반 이름을 입력하세요.');
  return withLock_(function () {
    var dup = allClasses_().filter(function (c) { return c.academy === academy && c.name === name && c.id !== p.id; })[0];
    if (dup) throw new Error('같은 학원에 같은 이름의 반이 이미 있어요.');
    var id = p.id || newId_();
    var old = readAll_('Classes').filter(function (r) { return r.id === id; })[0];
    upsert_('Classes', function (r) { return r.id === id; }, { id: id, academy: academy, name: name, createdAt: old ? old.createdAt : nowKst_(), archived: old ? old.archived : '' });
    return { ok: true, id: id };
  });
}
function adminDeleteClass(pw, id) {
  admin_(pw);
  return withLock_(function () {
    var students = readAll_('Students').filter(function (r) { return r.classId === id; }).length;
    if (students) throw new Error('이 반에 학생이 ' + students + '명 있어요. 학생을 다른 반으로 옮기거나 삭제한 뒤 지워주세요.');
    var tests = readAll_('Tests').filter(function (r) { var t = testTargets_(r); return t.length === 1 && t[0].classId === id; }).length;
    if (tests) throw new Error('이 반만 보는 테스트가 ' + tests + '개 있어요. 테스트를 먼저 삭제해 주세요.');
    // 다른 반과 같이 보는 테스트에서는 이 반만 빼기
    readAll_('Tests').forEach(function (r) {
      var t = testTargets_(r);
      var next = t.filter(function (x) { return x.classId !== id; });
      if (next.length !== t.length && next.length) {
        setCell_('Tests', r.__row, 'targetsJson', JSON.stringify(next));
        setCell_('Tests', r.__row, 'classId', next[0].classId);
        setCell_('Tests', r.__row, 'date', next[0].date);
      }
    });
    // 숙제에서 이 반만 빼기
    readAll_('Lectures').forEach(function (r) {
      var targets = parseJson_(r.targetsJson, []) || [];
      var next = targets.filter(function (t) { return t.classId !== id; });
      if (next.length !== targets.length) setCell_('Lectures', r.__row, 'targetsJson', JSON.stringify(next));
    });
    deleteWhere_('Classes', function (r) { return r.id === id; });
    return { ok: true };
  });
}

// --- 학생 ---
function adminStudents(pw) {
  admin_(pw);
  var cm = classMap_();
  return readAll_('Students').map(function (r) {
    var own = r.pinSet === '1';
    return { key: r.key, school: r.school, grade: r.grade, name: r.name, pin: own ? '' : normPin_(r.pin), pinSet: own, joinedAt: r.joinedAt || '', receive: r.receive || '',
      classId: cm[r.classId] ? r.classId : '', classLabel: cm[r.classId] ? classLabel_(cm[r.classId]) : '(반 없음)' };
  }).sort(function (a, b) { return a.classLabel.localeCompare(b.classLabel) || a.name.localeCompare(b.name); });
}
// 반 명단으로 등록. rows: [{name, pin?}] — 이미 있는 학생(같은 학교·학년·이름)은 반만 옮기고 비밀번호는 유지
function adminAddRoster(pw, classId, school, grade, rows) {
  admin_(pw);
  school = norm_(school); grade = norm_(grade);
  if (!school || !grade) throw new Error('학교와 학년을 입력하세요.');
  if (classId && !classMap_()[classId]) throw new Error('반을 찾을 수 없어요. 새로고침 후 다시 골라주세요.');
  return withLock_(function () {
    var existing = {};
    readAll_('Students').forEach(function (r) { existing[r.key] = r; });
    var out = [];
    (rows || []).forEach(function (r) {
      var name = norm_(r.name);
      if (!name) return;
      var key = studentKey_(school, grade, name);
      var old = existing[key];
      var given = r.pin && /^\d{4}(\d{2})?$/.test(String(r.pin)) ? String(r.pin) : '';
      var pin = given || (old ? (old.pinHash ? '' : normPin_(old.pin)) : DEFAULT_PIN);
      var pinSet = given ? '' : (old ? (old.pinSet || '') : '');
      var sameClass = old && old.classId === (classId || '');
      upsert_('Students', function (x) { return x.key === key; }, {
        key: key, school: school, grade: grade, name: name, pin: pin,
        createdAt: old ? old.createdAt : nowKst_(), className: '', classId: classId || '',
        joinedAt: sameClass ? (old.joinedAt || '') : (classId ? todayKst_() : ''), // 입반일: 이 반에 들어온 날
        pinSet: pinSet,
        // 비밀번호를 새로 주면 학생이 정한 비밀번호(해시)는 지우고 예전 로그인은 끊음
        pinHash: given || !old ? '' : (old.pinHash || ''), pinSalt: given || !old ? '' : (old.pinSalt || ''),
        pinVersion: old ? (Number(old.pinVersion) || 0) + (given ? 1 : 0) : 0, receive: old ? (old.receive || '') : '',
        parentCode: old ? (old.parentCode || '') : ''
      });
      out.push({ name: name, pin: pinSet === '1' ? '(학생이 정함)' : pin, status: old ? (old.classId !== (classId || '') ? 'moved' : 'updated') : 'added' });
    });
    return { ok: true, rows: out };
  });
}
// 학생 정보 수정: 반·학교·학년·이름·비밀번호. 학교·학년·이름이 바뀌면 제출 기록·테스트 결과도 함께 옮김
function adminUpdateStudent(pw, oldKey, p) {
  admin_(pw);
  var school = norm_(p.school), grade = norm_(p.grade), name = norm_(p.name), classId = p.classId || '';
  if (!school || !grade || !name) throw new Error('학교·학년·이름은 비울 수 없어요.');
  if (p.pin && !/^\d{4}(\d{2})?$/.test(String(p.pin))) throw new Error('임시 비밀번호는 숫자 4자리나 6자리로 넣어 주세요.');
  if (classId && !classMap_()[classId]) throw new Error('반을 찾을 수 없어요. 새로고침 후 다시 골라주세요.');
  if (p.joinedAt && !/^\d{4}-\d{2}-\d{2}$/.test(String(p.joinedAt))) throw new Error('입반일 날짜 형식이 올바르지 않아요.');
  return withLock_(function () {
    var rows = readAll_('Students');
    var old = rows.filter(function (r) { return r.key === oldKey; })[0];
    if (!old) throw new Error('학생을 찾을 수 없어요. 새로고침 후 다시 시도하세요.');
    var newKey = studentKey_(school, grade, name);
    if (newKey !== oldKey && rows.some(function (r) { return r.key === newKey; })) {
      throw new Error('같은 학교·학년에 같은 이름(' + name + ')이 이미 있어요. 이름 뒤에 구분 글자를 붙이거나, 중복된 학생을 먼저 삭제하세요.');
    }
    var pin = p.pin ? String(p.pin) : (old.pinHash ? '' : normPin_(old.pin));
    var pinSet = p.pin ? '' : (old.pinSet || '');
    // 입반일: 화면에서 고친 값. 반을 옮기면서 날짜를 그대로 두면 오늘로.
    var joinedAt = p.joinedAt === undefined ? (old.joinedAt || '') : String(p.joinedAt || '');
    if (classId !== old.classId && joinedAt === (old.joinedAt || '')) joinedAt = classId ? todayKst_() : '';
    writeRow_('Students', old.__row, { key: newKey, school: school, grade: grade, name: name, pin: pin,
      createdAt: old.createdAt, className: '', classId: classId, joinedAt: joinedAt, pinSet: pinSet,
      pinHash: p.pin ? '' : (old.pinHash || ''), pinSalt: p.pin ? '' : (old.pinSalt || ''),
      pinVersion: (Number(old.pinVersion) || 0) + (p.pin ? 1 : 0), parentCode: old.parentCode || '', receive: old.receive || '' });
    if (newKey !== oldKey) {
      moveStudentKey_(oldKey, newKey);
      readAll_('Submissions').forEach(function (r) {
        if (r.studentKey === oldKey) setCell_('Submissions', r.__row, 'studentKey', newKey);
      });
      readAll_('Tests').forEach(function (r) {
        var res = parseJson_(r.resultsJson, {});
        if (res[oldKey]) {
          res[newKey] = res[oldKey];
          delete res[oldKey];
          setCell_('Tests', r.__row, 'resultsJson', JSON.stringify(res));
        }
      });
      // 영상의 학생별 예외 설정도 새 이름으로 옮김
      readAll_('Videos').forEach(function (r) {
        var ts = parseJson_(r.targetsJson, []) || [], moved = false;
        ts.forEach(function (t) {
          if (t && t.students && t.students[oldKey] !== undefined) { t.students[newKey] = t.students[oldKey]; delete t.students[oldKey]; moved = true; }
        });
        if (moved) setCell_('Videos', r.__row, 'targetsJson', JSON.stringify(ts));
      });
    }
    return { ok: true, key: newKey, pin: pinSet === '1' ? '' : pin, joinedAt: joinedAt };
  });
}
// 반에 학생 넣기·빼기 (classId가 ''이면 반에서 빼기). 기록·비밀번호는 그대로.
function adminSetStudentClass(pw, key, classId) {
  admin_(pw);
  if (classId && !classMap_()[classId]) throw new Error('반을 찾을 수 없어요. 새로고침 후 다시 골라주세요.');
  return withLock_(function () {
    var r = readAll_('Students').filter(function (x) { return x.key === key; })[0];
    if (!r) throw new Error('학생을 찾을 수 없어요. 새로고침 후 다시 시도하세요.');
    if (r.classId !== (classId || '')) {
      setCell_('Students', r.__row, 'classId', classId || '');
      setCell_('Students', r.__row, 'joinedAt', classId ? todayKst_() : ''); // 입반일 = 반에 넣은 날
    }
    return { ok: true };
  });
}
function adminDeleteStudent(pw, key) {
  admin_(pw);
  withLock_(function () { deleteWhere_('Students', function (r) { return r.key === key; }); });
  return { ok: true };
}
function classStudents_(classId) {
  return readAll_('Students').filter(function (r) { return classId && r.classId === classId; })
    .sort(function (a, b) { return a.name.localeCompare(b.name); });
}

// --- 강의(숙제) ---
function adminLectures(pw, classId) {
  admin_(pw);
  var cm = classMap_();
  var events = classEvents_(allLectures_(), classId);
  var studentKeys = {};
  classStudents_(classId).forEach(function (s) { studentKeys[s.key] = 1; });
  var subs = readAll_('Submissions');
  return {
    studentCount: Object.keys(studentKeys).length,
    list: events.map(function (e) {
      var l = e.lec;
      var mySubs = subs.filter(function (s) { return s.lectureId === l.id && studentKeys[s.studentKey]; });
      var pendingEssay = 0;
      mySubs.forEach(function (r) {
        var s = parseSub_(r);
        pendingEssay += computeScore_(l.questions, s.firstResult, s.essayScores).pending;
      });
      var others = l.targets.filter(function (t) { return t.classId !== classId && cm[t.classId]; })
        .map(function (t) { return classLabel_(cm[t.classId]); });
      return {
        id: l.id, date: e.t.date, startTime: e.t.startTime, title: l.title, memo: l.memo,
        count: l.questions.length, deadline: deadlineFor_(e.t, events),
        submitted: mySubs.length, pendingEssay: pendingEssay, sharedWith: others
      };
    })
  };
}
function adminGetLecture(pw, id) {
  admin_(pw);
  var all = allLectures_();
  for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
  return null;
}
function adminSaveLecture(pw, p) {
  admin_(pw);
  var cm = classMap_();
  var targets = (p.targets || []).map(function (t) {
    return { classId: t.classId, date: t.date, startTime: t.startTime || '' };
  }).filter(function (t) { return cm[t.classId] && t.date; });
  if (!targets.length) throw new Error('대상 반을 하나 이상 고르고 날짜를 넣어주세요.');
  return withLock_(function () {
    var id = p.id || newId_();
    var questions = (p.questions || []).map(function (q, i) {
      var type = ['mcq', 'short', 'essay'].indexOf(q.type) !== -1 ? q.type : 'mcq';
      return {
        no: i + 1, type: type,
        answer: type === 'mcq' ? mcqKey_(q.answer) : norm_(q.answer), area: norm_(q.area), points: Number(q.points) || 1,
        expText: String(q.expText || ''), expImage: q.expImage || '',
        qImage: q.qImage || '' // 문제 사진 (문제지 PDF에서 잘라 올린 것)
      };
    });
    // 예전 화면은 문제 사진을 모르므로, 예전 화면에서 저장해도 이미 있던 문제 사진이 지워지지 않게 이어 붙임
    var prev = allLectures_().filter(function (l) { return l.id === id; })[0];
    if (prev) questions.forEach(function (q, i) {
      var src = p.questions[i] || {};
      if (!('qImage' in src) && prev.questions[i] && prev.questions[i].qImage) q.qImage = prev.questions[i].qImage;
    });
    upsert_('Lectures', function (r) { return r.id === id; }, {
      id: id, school: '', grade: '', date: targets[0].date, startTime: targets[0].startTime,
      title: norm_(p.title), memo: String(p.memo || ''), questionsJson: JSON.stringify(questions),
      updatedAt: nowKst_(), targetsJson: JSON.stringify(targets)
    });
    return { ok: true, id: id };
  });
}
function adminDeleteLecture(pw, id) {
  admin_(pw);
  withLock_(function () {
    deleteWhere_('Lectures', function (r) { return r.id === id; });
    deleteWhere_('Submissions', function (r) { return r.lectureId === id; });
  });
  return { ok: true };
}
function adminUploadImage(pw, dataUrl, filename) {
  admin_(pw);
  var m = String(dataUrl).match(/^data:([^;]+);base64,(.*)$/);
  if (!m) throw new Error('이미지 형식이 올바르지 않아요.');
  var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], filename || 'explanation.jpg');
  var file = getImageFolder_().createFile(blob);
  return { ok: true, fileId: file.getId() };
}
function adminGetImage(pw, fileId) {
  admin_(pw);
  return imageDataUrl_(fileId);
}

// 강의별·반별 제출 현황 + 문항별 통계 + 서술형 답안
function adminLectureStatus(pw, id, classId) {
  admin_(pw);
  var all = allLectures_();
  var lec = all.filter(function (l) { return l.id === id; })[0];
  if (!lec) return null;
  var cm = classMap_();
  var t = targetFor_(lec, classId) || lec.targets[0] || { date: '' };
  var events = classEvents_(all, classId);
  var students = classStudents_(classId);
  var subBy = {};
  readAll_('Submissions').filter(function (r) { return r.lectureId === id; }).forEach(function (r) { subBy[r.studentKey] = parseSub_(r); });

  var qStats = lec.questions.map(function (q) {
    return { no: q.no, type: q.type, area: norm_(q.area) || '기타', answered: 0, wrong: 0, confused: 0, pending: 0 };
  });
  var essays = lec.questions.filter(function (q) { return q.type === 'essay'; })
    .map(function (q) { return { no: q.no, points: Number(q.points) || 1, answer: q.answer, entries: [] }; });

  var rows = students.map(function (s) {
    var sub = subBy[s.key];
    if (!sub) return { key: s.key, name: s.name, submitted: false };
    var sc = computeScore_(lec.questions, sub.firstResult, sub.essayScores);
    var wrongNos = [];
    lec.questions.forEach(function (q, i) {
      var res = effectiveResult_(q, sub.firstResult, sub.essayScores);
      qStats[i].answered++;
      if (res === 'X') { qStats[i].wrong++; wrongNos.push(q.no); }
      if (res === 'P') qStats[i].pending++;
      if (sub.confused.indexOf(q.no) !== -1) qStats[i].confused++;
    });
    essays.forEach(function (e) {
      e.entries.push({ key: s.key, name: s.name, text: sub.firstAnswers[e.no] || '', score: sub.essayScores[e.no] == null ? '' : sub.essayScores[e.no] });
    });
    return {
      key: s.key, name: s.name, submitted: true, late: sub.late, phase: sub.phase,
      score: sc.score, max: sc.max, pending: sc.pending, wrongNos: wrongNos, confused: sub.confused, submittedAt: sub.submittedAt
    };
  });
  return {
    lecture: { id: lec.id, date: t.date, title: lec.title, classLabel: classLabel_(cm[classId]), deadline: deadlineFor_(t, events) },
    rows: rows, qStats: qStats, essays: essays
  };
}
// 정답·유형을 고친 뒤 이미 제출된 답안을 지금 정답 기준으로 다시 채점 (모든 반, 첫 시도 답 기준)
// 서술형 점수·헷갈림·재풀이 답은 그대로 둠. 재풀이 전이던 학생이 이제 다 맞으면 정답 공개 상태로.
function adminRegradeLecture(pw, id) {
  admin_(pw);
  return withLock_(function () {
    var lec = allLectures_().filter(function (l) { return l.id === id; })[0];
    if (!lec) throw new Error('NOT_FOUND');
    var total = 0, changed = 0;
    readAll_('Submissions').forEach(function (r) {
      if (r.lectureId !== id) return;
      total++;
      var sub = parseSub_(r);
      var before = JSON.stringify(sub.firstResult) + '|' + sub.phase;
      sub.firstResult = gradeFirst_(lec.questions, sub.firstAnswers);
      var hasWrong = lec.questions.some(function (q) { return q.type !== 'essay' && sub.firstResult[q.no] === 'X'; });
      if (sub.phase === 'retry' && !hasWrong) sub.phase = 'revealed';
      var row = subToRow_(sub, lec);
      if (JSON.stringify(sub.firstResult) + '|' + sub.phase !== before || String(row.score) !== String(r.score) || String(row.max) !== String(r.max)) {
        writeRow_('Submissions', r.__row, row);
        changed++;
      }
    });
    return { ok: true, total: total, changed: changed };
  });
}
function adminGradeEssay(pw, lectureId, studentKey, no, score) {
  admin_(pw);
  return withLock_(function () {
    var lec = allLectures_().filter(function (l) { return l.id === lectureId; })[0];
    if (!lec) throw new Error('NOT_FOUND');
    var sub = findSub_(lectureId, studentKey);
    if (!sub) throw new Error('NOT_FOUND');
    if (score === '' || score === null) delete sub.essayScores[no];
    else sub.essayScores[no] = Number(score);
    upsert_('Submissions', function (r) { return r.lectureId === lectureId && r.studentKey === studentKey; }, subToRow_(sub, lec));
    return { ok: true };
  });
}

// --- 테스트 (반 하나 단위) ---
// 테스트도 숙제처럼 여러 반에 걸 수 있음. targets = [{classId, date}] (예전 기록은 classId·date 한 칸)
function testTargets_(r) {
  var t = (parseJson_(r.targetsJson, null) || []).filter(function (x) { return x && x.classId; })
    .map(function (x) { return { classId: x.classId, date: x.date || r.date || '' }; });
  if (!t.length && r.classId) t = [{ classId: r.classId, date: r.date || '' }];
  return t;
}
function testTargetFor_(r, classId) {
  var t = testTargets_(r);
  for (var i = 0; i < t.length; i++) if (t[i].classId === classId) return t[i];
  return null;
}
function adminTests(pw, classId) {
  admin_(pw);
  var cm = classMap_();
  var inClass = {};
  classStudents_(classId).forEach(function (s) { inClass[s.key] = 1; });
  return readAll_('Tests').map(function (r) {
    var t = testTargetFor_(r, classId);
    if (!t) return null;
    var qs = parseJson_(r.questionsJson, []);
    var results = parseJson_(r.resultsJson, {});
    var others = testTargets_(r).filter(function (x) { return x.classId !== classId && cm[x.classId]; }).map(function (x) { return classLabel_(cm[x.classId]); });
    return { id: r.id, date: t.date, title: r.title, count: qs.length,
      entered: Object.keys(results).filter(function (k) { return inClass[k]; }).length, sharedWith: others };
  }).filter(function (x) { return x; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
}
function adminGetTest(pw, id) {
  admin_(pw);
  var r = readAll_('Tests').filter(function (x) { return x.id === id; })[0];
  if (!r) return null;
  return { id: r.id, classId: r.classId, date: r.date, title: r.title, targets: testTargets_(r),
    questions: parseJson_(r.questionsJson, []), results: parseJson_(r.resultsJson, {}) };
}
function adminClassStudents(pw, classId) {
  admin_(pw);
  return classStudents_(classId).map(function (r) { return { key: r.key, name: r.name, joinedAt: r.joinedAt || '' }; });
}
function adminSaveTest(pw, p) {
  admin_(pw);
  var cm = classMap_();
  var targets = (p.targets || []).map(function (t) { return { classId: t.classId, date: t.date || '' }; })
    .filter(function (t) { return cm[t.classId] && t.date; });
  if (!targets.length) throw new Error('테스트를 볼 반을 하나 이상 고르고 날짜를 넣어주세요.');
  return withLock_(function () {
    var id = p.id || newId_();
    var questions = (p.questions || []).map(function (q, i) {
      // type: mcq·short = 정답을 넣어 두면 학생 답 번호로 자동 채점, manual = 선생님이 O/X 직접
      var type = ['mcq', 'short', 'manual'].indexOf(q.type) !== -1 ? q.type : 'manual';
      return {
        no: i + 1, type: type, answer: type === 'mcq' ? mcqKey_(q.answer) : type === 'short' ? norm_(q.answer) : '',
        area: norm_(q.area), points: Number(q.points) || 1, expText: String(q.expText || ''), expImage: q.expImage || ''
      };
    });
    upsert_('Tests', function (r) { return r.id === id; }, {
      id: id, school: '', grade: '', className: '', classId: targets[0].classId, date: targets[0].date, title: norm_(p.title),
      targetsJson: JSON.stringify(targets),
      questionsJson: JSON.stringify(questions), resultsJson: JSON.stringify(gradeTestResults_(questions, p.results || {})), updatedAt: nowKst_()
    });
    return { ok: true, id: id };
  });
}
// 테스트에 정답이 있는 문항은 입력한 학생 답으로 O/X를 매김. 학생 답이 비어 있으면 손으로 넣은 O/X를 그대로 둠.
function testAutoKey_(q) { return (q.type === 'mcq' || q.type === 'short') && String(q.answer || '').trim() !== ''; }
function gradeTestResults_(questions, results) {
  var out = {};
  Object.keys(results).forEach(function (key) {
    var r = results[key] || {};
    if (r.absent) { out[key] = { absent: true, marks: {}, answers: {} }; return; }
    var marks = {}, answers = {};
    questions.forEach(function (q) {
      var a = r.answers ? r.answers[q.no] : null;
      a = a == null ? '' : String(a).trim().slice(0, 200);
      if (testAutoKey_(q) && a !== '') {
        answers[q.no] = q.type === 'mcq' ? mcqKey_(a) : a;
        marks[q.no] = isCorrect_(q, a) ? 1 : 0;
      } else {
        if (a !== '') answers[q.no] = a;
        var m = r.marks ? r.marks[q.no] : null;
        if (m === 1 || m === 0) marks[q.no] = m;
      }
    });
    if (Object.keys(marks).length) out[key] = { absent: false, marks: marks, answers: answers };
  });
  return out;
}

// ===================== 학생: 테스트 결과 상세 (내 기록) =====================
function studentTestRow_(st, id) {
  var r = readAll_('Tests').filter(function (x) { return x.id === id; })[0];
  if (!r) throw new Error('NOT_FOUND');
  var res = parseJson_(r.resultsJson, {})[st.key];
  if (!res) throw new Error('NOT_FOUND');
  return { r: r, res: res, questions: parseJson_(r.questionsJson, []) };
}
function studentTest(a, id) {
  var st = auth_(a);
  var c = studentTestRow_(st, id);
  var tt = testTargetFor_(c.r, st.classId);
  var view = { id: id, date: tt ? tt.date : c.r.date, title: c.r.title, absent: !!c.res.absent, score: 0, max: 0, items: [], areas: [] };
  var marks = c.res.marks || {}, answers = c.res.answers || {};
  var fr = {};
  c.questions.forEach(function (q) {
    var pts = Number(q.points) || 1;
    view.max += pts;
    var m = marks[q.no];
    if (m === 1) view.score += pts;
    fr[q.no] = m === 1 ? 'O' : m === 0 ? 'X' : 'P';
    view.items.push({
      no: q.no, type: q.type === 'mcq' ? 'mcq' : 'short', area: norm_(q.area) || '기타', points: pts,
      answer: q.answer || '', first: answers[q.no] == null ? '' : answers[q.no], retry: '',
      result: fr[q.no], expText: q.expText || '', hasImage: !!q.expImage, confused: false,
      manual: !(q.type === 'mcq' || q.type === 'short') || !String(q.answer || '').trim()
    });
  });
  if (!view.absent) view.areas = areaStats_(c.questions.map(function (q) { return { no: q.no, type: 'mcq', area: q.area }; }), fr, {}, []);
  return view;
}
function studentTestImage(a, id, no) {
  var st = auth_(a);
  var c = studentTestRow_(st, id);
  var q = c.questions.filter(function (x) { return x.no === Number(no); })[0];
  if (!q || !q.expImage) return null;
  return imageDataUrl_(q.expImage);
}
function adminDeleteTest(pw, id) {
  admin_(pw);
  withLock_(function () { deleteWhere_('Tests', function (r) { return r.id === id; }); });
  return { ok: true };
}

// ===================== 수업 영상 (반별 · 기간 지정) =====================
// 영상은 유튜브(일부공개)나 구글 드라이브(링크가 있는 모든 사용자)에 올리고 링크만 등록.
// targets = [{classId, from, to}] — from~to 날짜 사이에만 학생에게 보임 (to가 비면 계속)
function videoEmbed_(url) {
  url = String(url || '').trim();
  var m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (m) return { kind: 'youtube', yt: m[1], embed: 'https://www.youtube.com/embed/' + m[1] + '?rel=0', open: 'https://www.youtube.com/watch?v=' + m[1] };
  m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?(?:.*&)?id=|uc\?(?:.*&)?id=)([A-Za-z0-9_-]{20,})/);
  if (m) return { kind: 'drive', embed: 'https://drive.google.com/file/d/' + m[1] + '/preview', open: 'https://drive.google.com/file/d/' + m[1] + '/view' };
  return null;
}
function parseVideo_(r) {
  var targets = (parseJson_(r.targetsJson, []) || []).filter(function (t) { return t && t.classId; })
    .map(function (t) { return { classId: t.classId, from: t.from || '', to: t.to || '', students: cleanOverrides_(t.students) }; });
  return { id: r.id, title: r.title, memo: r.memo, url: r.url, targets: targets };
}
function allVideos_() { return readAll_('Videos').map(parseVideo_); }
// 학생별 예외: { 학생키: true(보여줌) | false(숨김) }. 없는 학생은 입반일 기준을 따름.
function cleanOverrides_(o) {
  var out = {};
  if (o && typeof o === 'object') Object.keys(o).forEach(function (k) {
    var x = o[k];
    if (x === true || x === false) out[k] = x;
    else if (x && typeof x === 'object') { // 차시: 영상(v)·자료(f) 따로
      var y = {};
      if (x.v === true || x.v === false) y.v = x.v;
      if (x.f === true || x.f === false) y.f = x.f;
      if (y.v !== undefined || y.f !== undefined) out[k] = y;
    }
  });
  return out;
}
// 이 학생이 이 반 영상을 볼 수 있는지: 예외 설정이 있으면 그대로,
// 없으면 입반일이 영상 시작 날짜보다 늦은 학생(중도 입반)은 안 보임. 입반일이 비어 있으면 처음부터 있던 학생.
function videoVisibleTo_(t, key, joinedAt) {
  if (t.students && t.students[key] !== undefined) { var o = t.students[key]; return typeof o === 'boolean' ? o : !!(o.v || o.f); }
  return !joinedAt || joinedAt <= t.from;
}
function videoTarget_(v, classId) {
  for (var i = 0; i < v.targets.length; i++) if (v.targets[i].classId === classId) return v.targets[i];
  return null;
}
function adminVideos(pw, classId) {
  admin_(pw);
  var cm = classMap_(), today = todayKst_();
  return allVideos_().map(function (v) {
    var t = videoTarget_(v, classId);
    if (!t) return null;
    var state = t.from > today ? 'upcoming' : (t.to && t.to < today) ? 'closed' : 'open';
    var others = v.targets.filter(function (x) { return x.classId !== classId && cm[x.classId]; }).map(function (x) { return classLabel_(cm[x.classId]); });
    return { id: v.id, title: v.title, from: t.from, to: t.to, state: state, kind: (videoEmbed_(v.url) || {}).kind || '', sharedWith: others,
      overrides: Object.keys(t.students || {}).length };
  }).filter(function (x) { return x; }).sort(function (a, b) { return a.from < b.from ? 1 : a.from > b.from ? -1 : 0; });
}
function adminGetVideo(pw, id) {
  admin_(pw);
  return allVideos_().filter(function (v) { return v.id === id; })[0] || null;
}
function adminSaveVideo(pw, p) {
  admin_(pw);
  assertLegacyMediaOpen_();
  if (!norm_(p.title)) throw new Error('영상 제목을 넣어주세요.');
  if (!videoEmbed_(p.url)) throw new Error('유튜브나 구글 드라이브 영상 링크를 넣어주세요.');
  var cm = classMap_();
  var targets = (p.targets || []).map(function (t) { return { classId: t.classId, from: t.from || '', to: t.to || '', students: cleanOverrides_(t.students) }; })
    .filter(function (t) { return cm[t.classId] && t.from; });
  if (!targets.length) throw new Error('보여줄 반을 하나 이상 고르고 시작 날짜를 넣어주세요.');
  var bad = targets.filter(function (t) { return t.to && t.to < t.from; });
  if (bad.length) throw new Error('끝 날짜가 시작 날짜보다 빨라요: ' + bad.map(function (t) { return classLabel_(cm[t.classId]); }).join(', '));
  return withLock_(function () {
    var id = p.id || newId_();
    upsert_('Videos', function (r) { return r.id === id; }, {
      id: id, title: norm_(p.title), memo: String(p.memo || ''), url: String(p.url).trim(),
      targetsJson: JSON.stringify(targets), updatedAt: nowKst_()
    });
    return { ok: true, id: id };
  });
}
function adminDeleteVideo(pw, id) {
  admin_(pw);
  withLock_(function () { deleteWhere_('Videos', function (r) { return r.id === id; }); });
  return { ok: true };
}
// 학생: 자기 반에 지금 열려 있는 영상
function studentVideos(a) {
  var st = auth_(a);
  if (unitsMigrated_()) return legacyVideosFromUnits_(st);
  var today = todayKst_();
  var list = [], upcoming = 0;
  allVideos_().forEach(function (v) {
    var t = videoTarget_(v, st.classId);
    if (!t) return;
    if (!videoVisibleTo_(t, st.key, st.joinedAt)) return;
    if (t.from > today) { upcoming++; return; }
    if (t.to && t.to < today) return;
    var e = videoEmbed_(v.url);
    if (!e) return;
    list.push({ id: v.id, title: v.title, memo: v.memo, from: t.from, to: t.to, kind: e.kind, embed: e.embed, open: e.open });
  });
  list.sort(function (x, y) { return x.from < y.from ? 1 : x.from > y.from ? -1 : 0; });
  return { list: list, upcoming: upcoming };
}

// ===================== 공지 (반별 · 기간 지정 · 링크/이미지) =====================
function parseNotice_(r) {
  var targets = (parseJson_(r.targetsJson, []) || []).filter(function (t) { return t && t.classId; })
    .map(function (t) { return { classId: t.classId, from: t.from || '', to: t.to || '' }; });
  return { id: r.id, title: r.title, body: r.body, image: r.image, linkUrl: r.linkUrl, linkLabel: r.linkLabel, pinned: r.pinned === 'true', targets: targets };
}
function allNotices_() { return readAll_('Notices').map(parseNotice_); }
function safeUrl_(u) { u = String(u || '').trim(); return /^https?:\/\/\S+$/i.test(u) ? u : ''; }
function adminNotices(pw, classId) {
  admin_(pw);
  var cm = classMap_(), today = todayKst_();
  return allNotices_().map(function (n) {
    var t = videoTarget_(n, classId);
    if (!t) return null;
    var state = t.from > today ? 'upcoming' : (t.to && t.to < today) ? 'closed' : 'open';
    var others = n.targets.filter(function (x) { return x.classId !== classId && cm[x.classId]; }).map(function (x) { return classLabel_(cm[x.classId]); });
    return { id: n.id, title: n.title, from: t.from, to: t.to, state: state, pinned: n.pinned, hasImage: !!n.image, hasLink: !!n.linkUrl, sharedWith: others };
  }).filter(function (x) { return x; }).sort(function (a, b) {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return a.from < b.from ? 1 : a.from > b.from ? -1 : 0;
  });
}
function adminGetNotice(pw, id) {
  admin_(pw);
  return allNotices_().filter(function (n) { return n.id === id; })[0] || null;
}
function adminSaveNotice(pw, p) {
  admin_(pw);
  if (!norm_(p.title)) throw new Error('공지 제목을 넣어주세요.');
  if (p.linkUrl && !safeUrl_(p.linkUrl)) throw new Error('링크는 https:// 로 시작하는 주소로 넣어주세요.');
  var cm = classMap_();
  var targets = (p.targets || []).map(function (t) { return { classId: t.classId, from: t.from || '', to: t.to || '' }; })
    .filter(function (t) { return cm[t.classId] && t.from; });
  if (!targets.length) throw new Error('보여줄 반을 하나 이상 고르고 시작 날짜를 넣어주세요.');
  var bad = targets.filter(function (t) { return t.to && t.to < t.from; });
  if (bad.length) throw new Error('끝 날짜가 시작 날짜보다 빨라요: ' + bad.map(function (t) { return classLabel_(cm[t.classId]); }).join(', '));
  return withLock_(function () {
    var id = p.id || newId_();
    upsert_('Notices', function (r) { return r.id === id; }, {
      id: id, title: norm_(p.title), body: String(p.body || '').slice(0, 5000), image: p.image || '',
      linkUrl: safeUrl_(p.linkUrl), linkLabel: norm_(p.linkLabel), pinned: p.pinned ? 'true' : 'false',
      targetsJson: JSON.stringify(targets), updatedAt: nowKst_()
    });
    return { ok: true, id: id };
  });
}
function adminDeleteNotice(pw, id) {
  admin_(pw);
  withLock_(function () { deleteWhere_('Notices', function (r) { return r.id === id; }); });
  return { ok: true };
}
function noticeOpenFor_(n, classId, today) {
  var t = videoTarget_(n, classId);
  return t && t.from <= today && (!t.to || t.to >= today) ? t : null;
}
// 학생: 자기 반에 지금 걸려 있는 공지 (고정 먼저, 최신 순)
function studentNotices(a) { return studentNoticesCore_(auth_(a)); }
function studentNoticesCore_(st) {
  var today = todayKst_();
  var list = [];
  allNotices_().forEach(function (n) {
    var t = noticeOpenFor_(n, st.classId, today);
    if (!t) return;
    list.push({ id: n.id, title: n.title, body: n.body, from: t.from, to: t.to, pinned: n.pinned,
      hasImage: !!n.image, linkUrl: safeUrl_(n.linkUrl), linkLabel: n.linkLabel });
  });
  list.sort(function (x, y) {
    if (x.pinned !== y.pinned) return x.pinned ? -1 : 1;
    return x.from < y.from ? 1 : x.from > y.from ? -1 : 0;
  });
  return list;
}
function studentNoticeImage(a, id) {
  var st = auth_(a);
  var n = allNotices_().filter(function (x) { return x.id === id; })[0];
  if (!n || !n.image || !noticeOpenFor_(n, st.classId, todayKst_())) return null;
  return imageDataUrl_(n.image);
}

// ===================== 수업 자료 (파일 내려받기 · 반별 기간 · 학생별 · 받은 기록) =====================
// 파일은 선생님 드라이브에 비공개로 두고, 로그인한 학생에게만 사이트가 꺼내 줌 (링크 공유 안 함).
// PDF는 학생 휴대폰에서 받을 때 아래 여백에 "이름 · 학교 · 날짜(6자리)"가 찍혀서 저장됨.
var MATERIAL_MAX_BYTES = 20 * 1024 * 1024; // 한 파일 최대 20MB
function getMaterialFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('MAT_FOLDER');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { } }
  var folder = DriveApp.createFolder(APP_TITLE + ' - 수업 자료');
  props.setProperty('MAT_FOLDER', folder.getId());
  return folder;
}
function driveFileId_(s) {
  s = String(s || '').trim();
  var m = s.match(/drive\.google\.com\/(?:file\/d\/|open\?(?:.*&)?id=|uc\?(?:.*&)?id=)([A-Za-z0-9_-]{20,})/) ||
          s.match(/docs\.google\.com\/[a-z]+\/d\/([A-Za-z0-9_-]{20,})/) || s.match(/^([A-Za-z0-9_-]{25,})$/);
  return m ? m[1] : '';
}
function parseMaterial_(r) {
  var targets = (parseJson_(r.targetsJson, []) || []).filter(function (t) { return t && t.classId; })
    .map(function (t) { return { classId: t.classId, from: t.from || '', to: t.to || '', students: cleanOverrides_(t.students) }; });
  return { id: r.id, title: r.title, memo: r.memo, fileId: r.fileId, fileName: r.fileName, mime: r.mime,
    size: Number(r.size) || 0, stamp: r.stamp !== 'false', targets: targets };
}
function allMaterials_() { return readAll_('Materials').map(parseMaterial_); }
function materialOpen_(t, today) { return t.from <= today && !(t.to && t.to < today); }
function downloadsBy_(materialId) {
  var out = {};
  readAll_('Downloads').forEach(function (r) {
    if (materialId && r.materialId !== materialId) return;
    var k = r.materialId + '|' + r.studentKey;
    if (!out[k]) out[k] = { first: r.at, last: r.at, count: 0 };
    out[k].count++;
    if (r.at < out[k].first) out[k].first = r.at;
    if (r.at > out[k].last) out[k].last = r.at;
  });
  return out;
}

// 강사: 파일 올리기 (휴대폰·PC에서 바로) — 드라이브 '수업 자료' 폴더에 비공개로 저장
function adminUploadMaterial(pw, dataUrl, filename) {
  admin_(pw);
  var m = String(dataUrl).match(/^data:([^;]*);base64,(.*)$/);
  if (!m) throw new Error('파일을 읽지 못했어요. 다시 골라 주세요.');
  var bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > MATERIAL_MAX_BYTES) throw new Error('파일이 너무 커요. 20MB 이하로 올려 주세요.');
  var blob = Utilities.newBlob(bytes, m[1] || 'application/octet-stream', filename || '자료');
  var file = getMaterialFolder_().createFile(blob);
  return { ok: true, fileId: file.getId(), fileName: file.getName(), mime: file.getMimeType(), size: file.getSize() };
}
// 강사: 드라이브에 이미 있는 파일 링크로 등록 (공유 설정은 안 바꿔도 됨)
function adminCheckMaterialLink(pw, link) {
  admin_(pw);
  var id = driveFileId_(link);
  if (!id) throw new Error('구글 드라이브 파일 링크가 아니에요.');
  var f;
  try { f = DriveApp.getFileById(id); } catch (e) { throw new Error('이 파일을 열 수 없어요. 내 드라이브에 있는 파일인지 확인해 주세요.'); }
  if (/^application\/vnd\.google-apps\./.test(f.getMimeType())) throw new Error('구글 문서·슬라이드는 PDF로 내려받아 올려 주세요.');
  if (f.getSize() > MATERIAL_MAX_BYTES) throw new Error('파일이 너무 커요. 20MB 이하만 쓸 수 있어요.');
  return { ok: true, fileId: id, fileName: f.getName(), mime: f.getMimeType(), size: f.getSize() };
}
function adminMaterials(pw, classId) {
  admin_(pw);
  var cm = classMap_(), today = todayKst_();
  var students = classStudents_(classId);
  var dl = downloadsBy_('');
  return allMaterials_().map(function (v) {
    var t = videoTarget_(v, classId);
    if (!t) return null;
    var state = t.from > today ? 'upcoming' : (t.to && t.to < today) ? 'closed' : 'open';
    var allowed = students.filter(function (s) { return videoVisibleTo_(t, s.key, s.joinedAt); });
    var got = allowed.filter(function (s) { return dl[v.id + '|' + s.key]; }).length;
    var others = v.targets.filter(function (x) { return x.classId !== classId && cm[x.classId]; }).map(function (x) { return classLabel_(cm[x.classId]); });
    return { id: v.id, title: v.title, fileName: v.fileName, from: t.from, to: t.to, state: state, sharedWith: others,
      allowed: allowed.length, got: got, overrides: Object.keys(t.students || {}).length };
  }).filter(function (x) { return x; }).sort(function (a, b) { return a.from < b.from ? 1 : a.from > b.from ? -1 : 0; });
}
function adminGetMaterial(pw, id) {
  admin_(pw);
  return allMaterials_().filter(function (v) { return v.id === id; })[0] || null;
}
function adminSaveMaterial(pw, p) {
  admin_(pw);
  assertLegacyMediaOpen_();
  if (!norm_(p.title)) throw new Error('자료 제목을 넣어주세요.');
  if (!p.fileId) throw new Error('파일을 올리거나 드라이브 링크를 넣어주세요.');
  var f;
  try { f = DriveApp.getFileById(p.fileId); } catch (e) { throw new Error('파일을 찾을 수 없어요. 다시 올려 주세요.'); }
  var cm = classMap_();
  var targets = (p.targets || []).map(function (t) { return { classId: t.classId, from: t.from || '', to: t.to || '', students: cleanOverrides_(t.students) }; })
    .filter(function (t) { return cm[t.classId] && t.from; });
  if (!targets.length) throw new Error('보여줄 반을 하나 이상 고르고 시작 날짜를 넣어주세요.');
  var bad = targets.filter(function (t) { return t.to && t.to < t.from; });
  if (bad.length) throw new Error('끝 날짜가 시작 날짜보다 빨라요: ' + bad.map(function (t) { return classLabel_(cm[t.classId]); }).join(', '));
  return withLock_(function () {
    var id = p.id || newId_();
    upsert_('Materials', function (r) { return r.id === id; }, {
      id: id, title: norm_(p.title), memo: String(p.memo || ''), fileId: p.fileId, fileName: f.getName(), mime: f.getMimeType(),
      size: f.getSize(), stamp: p.stamp === false ? 'false' : 'true', targetsJson: JSON.stringify(targets), updatedAt: nowKst_()
    });
    return { ok: true, id: id };
  });
}
// 자료를 지워도 드라이브 파일은 그대로 둠 (실수로 지워도 파일은 남게)
function adminDeleteMaterial(pw, id) {
  admin_(pw);
  withLock_(function () {
    deleteWhere_('Materials', function (r) { return r.id === id; });
    deleteWhere_('Downloads', function (r) { return r.materialId === id; });
  });
  return { ok: true };
}
// 받은 기록: 반 학생별로 받을 수 있는지·처음 받은 때·받은 횟수
function adminMaterialLog(pw, id, classId) {
  admin_(pw);
  var v = allMaterials_().filter(function (x) { return x.id === id; })[0];
  if (!v) return null;
  var t = videoTarget_(v, classId);
  var dl = downloadsBy_(id);
  var rows = classStudents_(classId).map(function (s) {
    var d = dl[id + '|' + s.key];
    return { name: s.name, allowed: t ? videoVisibleTo_(t, s.key, s.joinedAt) : false,
      first: d ? d.first : '', last: d ? d.last : '', count: d ? d.count : 0 };
  });
  return { title: v.title, fileName: v.fileName, from: t ? t.from : '', to: t ? t.to : '', rows: rows };
}
// 학생: 지금 받을 수 있는 자료
function studentMaterials(a) {
  var st = auth_(a);
  if (unitsMigrated_()) return legacyMaterialsFromUnits_(st);
  var today = todayKst_(), list = [], upcoming = 0;
  var dl = downloadsBy_('');
  allMaterials_().forEach(function (v) {
    var t = videoTarget_(v, st.classId);
    if (!t || !videoVisibleTo_(t, st.key, st.joinedAt)) return;
    if (t.from > today) { upcoming++; return; }
    if (t.to && t.to < today) return;
    var d = dl[v.id + '|' + st.key];
    list.push({ id: v.id, title: v.title, memo: v.memo, fileName: v.fileName, size: v.size, from: t.from, to: t.to,
      got: d ? d.first : '' });
  });
  list.sort(function (x, y) { return x.from < y.from ? 1 : x.from > y.from ? -1 : 0; });
  return { list: list, upcoming: upcoming };
}
// 학생: 파일 받기 (기록을 남기고 파일 내용을 돌려줌. PDF 이름 찍기는 학생 화면에서)
function studentDownloadMaterial(a, id) {
  var st = auth_(a);
  if (unitsMigrated_()) return downloadUnitFile_(st, null, id);
  var v = allMaterials_().filter(function (x) { return x.id === id; })[0];
  if (!v) throw new Error('자료를 찾을 수 없어요.');
  var t = videoTarget_(v, st.classId);
  if (!t || !videoVisibleTo_(t, st.key, st.joinedAt) || !materialOpen_(t, todayKst_())) throw new Error('지금은 받을 수 없는 자료예요.');
  var blob;
  try { blob = DriveApp.getFileById(v.fileId).getBlob(); } catch (e) { throw new Error('파일을 불러오지 못했어요. 선생님께 말해 주세요.'); }
  writeRow_('Downloads', -1, { materialId: id, studentKey: st.key, at: nowKst_() });
  var name = v.fileName || (v.title + '');
  var isPdf = /pdf/i.test(blob.getContentType()) || /\.pdf$/i.test(name);
  return {
    name: name, mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()),
    stamp: v.stamp && isPdf ? [st.name, normSchool_(st.school), Utilities.formatDate(new Date(), TZ, 'yyMMdd')].join(' · ') : ''
  };
}


// =====================================================================
// ===================== 여기부터 새 사이트용 API =====================
// =====================================================================
var API_VERSION = '2026.11.8';

// ===================== 해시 · 토큰 · 로그인 잠금 =====================
function hex_(bytes) {
  return bytes.map(function (b) { var v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v; }).join('');
}
function sha256Hex_(s) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8)); }
function randomHex_(n) {
  var s = '';
  while (s.length < n) s += Utilities.getUuid().replace(/-/g, '');
  return s.slice(0, n);
}
// 학생 비밀번호 해시: 학생마다 다른 솔트 + 여러 번 반복 (시트를 봐도 원래 번호를 바로 알 수 없게)
var PIN_HASH_ROUNDS = 300;
function pinHash_(salt, pin) {
  var d = String(pin == null ? '' : pin).replace(/\D/g, '');
  var h = sha256Hex_(salt + ':' + d);
  for (var i = 1; i < PIN_HASH_ROUNDS; i++) h = sha256Hex_(h + salt);
  return h;
}
// 학생이 정한 비밀번호는 해시로, 임시 비밀번호(선생님이 정한 것)는 그대로 비교
function pinMatches_(r, pin) {
  var d = String(pin == null ? '' : pin).trim();
  if (!/^\d+$/.test(d)) return false;
  if (r.pinHash) return !!r.pinSalt && pinHash_(r.pinSalt, d) === r.pinHash;
  if (!String(r.pin || '').trim()) return false;
  return normPin_(r.pin) === normPin_(d);
}

function tokenSecret_() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('TOKEN_SECRET');
  if (!s) { s = randomHex_(64); props.setProperty('TOKEN_SECRET', s); }
  return s;
}
function b64u_(s) { return Utilities.base64EncodeWebSafe(s, Utilities.Charset.UTF_8).replace(/=+$/, ''); }
function sig_(body) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(body, tokenSecret_())).replace(/=+$/, ''); }
function isToken_(s) { return /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(String(s || '')); }
// 토큰 = v1.{내용}.{서명}. 내용: r(역할 s·p·a) k(학생키) v(버전) e(만료 시각)
function issueToken_(role, key, ver, ms) {
  var body = b64u_(JSON.stringify({ r: role, k: key, v: String(ver), e: Date.now() + ms }));
  return 'v1.' + body + '.' + sig_(body);
}
function verifyToken_(tok, role) {
  if (!isToken_(tok)) throw new Error('AUTH');
  var parts = String(tok).split('.');
  if (sig_(parts[1]) !== parts[2]) throw new Error('AUTH');
  var p, b = parts[1];
  while (b.length % 4) b += '=';
  try { p = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(b)).getDataAsString('UTF-8')); } catch (e) { throw new Error('AUTH'); }
  if (!p || p.r !== role) throw new Error('AUTH');
  if (!p.e || Date.now() > Number(p.e)) throw new Error('EXPIRED');
  return p;
}
function codedError_(code, msg) { var e = new Error(msg); e.code = code; return e; }
// 로그인 잠금 (CacheService): limit번 틀리면 lockSec초 동안 잠금
function checkLock_(key) {
  if (CacheService.getScriptCache().get('lock:' + key)) {
    throw codedError_('LOCKED', '여러 번 틀려서 잠시 잠겼어요. 조금 뒤에 다시 해 주세요.');
  }
}
function addFail_(key, limit, lockSec) {
  var c = CacheService.getScriptCache();
  var n = (Number(c.get('fail:' + key)) || 0) + 1;
  if (n >= limit) { c.put('lock:' + key, '1', lockSec); c.remove('fail:' + key); }
  else c.put('fail:' + key, String(n), lockSec);
}
function clearFail_(key) { CacheService.getScriptCache().remove('fail:' + key); }

// ===================== 강사 비밀번호 · 강사 토큰 =====================
function adminVer_() { return PropertiesService.getScriptProperties().getProperty('ADMIN_VER') || '0'; }
function checkAdminPassword_(pw) {
  checkLock_('adm');
  var props = PropertiesService.getScriptProperties();
  var hash = props.getProperty('ADMIN_HASH'), salt = props.getProperty('ADMIN_SALT');
  var ok;
  if (hash && salt) ok = sha256Hex_(salt + ':' + pw) === hash;
  else {
    if (String(ADMIN_PASSWORD) === 'change-me-1234') throw new Error('코드 맨 위 ADMIN_PASSWORD를 먼저 바꿔 주세요.');
    ok = pw !== '' && pw === String(ADMIN_PASSWORD);
  }
  if (!ok) { addFail_('adm', 5, 1800); throw new Error('ADMIN'); }
  clearFail_('adm');
}
function verifyAdminToken_(tok) {
  var p = verifyToken_(tok, 'a');
  if (p.v !== adminVer_()) throw new Error('AUTH');
  return p;
}
function adminToken_() { return issueToken_('a', 'admin', adminVer_(), ADMIN_TOKEN_HOURS * 3600000); }
function apiAdminLogin_(d) {
  try { checkAdminPassword_(String(d.password || '')); }
  catch (e) { if (e.message === 'ADMIN') throw new Error('비밀번호가 맞지 않아요.'); throw e; }
  migrate_();
  return { token: adminToken_(), hours: ADMIN_TOKEN_HOURS };
}
// 강사 비밀번호 바꾸기 → 스크립트 속성에 해시로 저장. 다른 기기의 강사 로그인은 모두 끊김.
function apiAdminChangePassword_(tok, d) {
  checkAdmin_(tok);
  var cur = String(d.current || ''), next = String(d.next || '');
  try { checkAdminPassword_(cur); }
  catch (e) { if (e.message === 'ADMIN') throw new Error('지금 비밀번호가 맞지 않아요.'); throw e; }
  if (next.length < 8) throw new Error('새 비밀번호는 8자 이상으로 정해 주세요.');
  if (next === cur) throw new Error('지금과 다른 비밀번호로 정해 주세요.');
  var salt = randomHex_(32);
  PropertiesService.getScriptProperties().setProperties({
    ADMIN_SALT: salt, ADMIN_HASH: sha256Hex_(salt + ':' + next), ADMIN_VER: String((Number(adminVer_()) || 0) + 1)
  });
  return { token: adminToken_() };
}

// ===================== 학생 로그인 · 내 정보 =====================
function studentToken_(r) { return issueToken_('s', r.key, Number(r.pinVersion) || 0, TOKEN_DAYS.s * 86400000); }
function studentBrief_(r) {
  var c = classMap_()[r.classId];
  return { name: r.name, school: r.school, grade: r.grade, className: c ? c.name : '', academy: c ? c.academy : '' };
}
function apiStudentLogin_(d) {
  migrate_();
  var f = findLoginStudent_(d.school, d.name, d.pin);
  if (!f.ok) throw new Error(f.dup ? '같은 학교·이름·비밀번호인 학생이 둘이에요. 선생님께 말해 주세요.' : '학교·이름·비밀번호 중 맞지 않는 게 있어요.');
  var r = f.row;
  return { token: studentToken_(r), days: TOKEN_DAYS.s, mustChange: r.pinSet !== '1', student: studentBrief_(r) };
}
function apiStudentChangePin_(tok, d) {
  var st = auth_({ token: tok });
  var res = changePinCore_(st, d.pin, d.newPin, [NEW_PIN_LENGTH]);
  return { token: issueToken_('s', st.key, res.pinVersion, TOKEN_DAYS.s * 86400000) };
}
function studentMe_(st) {
  var r = studentRowByKey_(st.key);
  var code = r.parentCode || ensureParentCode_(st.key);
  var b = studentBrief_(r);
  b.joinedAt = r.joinedAt || '';
  b.pinSet = r.pinSet === '1';
  b.parentCode = code;
  return b;
}

// ===================== 학부모 코드 =====================
// 헷갈리는 글자(O·0·I·1) 뺀 32글자 중 8자리. 학생 화면 '내 정보'에 보이고, 강사가 재발급하면 예전 코드는 막힘.
var PARENT_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function normCode_(s) { return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function newParentCode_(used) {
  for (var tries = 0; tries < 20; tries++) {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid() + Date.now() + tries);
    var c = '';
    for (var i = 0; i < 8; i++) c += PARENT_CODE_CHARS.charAt(((bytes[i] % 32) + 32) % 32);
    if (!used[c]) return c;
  }
  throw new Error('코드를 만들지 못했어요. 다시 해 주세요.');
}
function ensureParentCode_(key, reissue) {
  return withLock_(function () {
    var rows = readAll_('Students');
    var row = rows.filter(function (r) { return r.key === key; })[0];
    if (!row) throw new Error('NOT_FOUND');
    if (row.parentCode && !reissue) return row.parentCode;
    var used = {};
    rows.forEach(function (r) { if (r.parentCode) used[normCode_(r.parentCode)] = 1; });
    var code = newParentCode_(used);
    setCell_('Students', row.__row, 'parentCode', code);
    return code;
  });
}
function parentVer_(code) { return sha256Hex_('parent:' + normCode_(code)).slice(0, 12); }
function apiParentLogin_(d) {
  migrate_();
  checkLock_('par');
  var code = normCode_(d.code);
  var r = code.length === 8 ? readAll_('Students').filter(function (x) { return x.parentCode && normCode_(x.parentCode) === code; })[0] : null;
  if (!r) {
    addFail_('par', 30, 600);
    throw new Error('학부모 코드가 맞지 않아요. 아이 화면의 ‘내 정보’에서 코드를 확인해 주세요.');
  }
  return { token: issueToken_('p', r.key, parentVer_(r.parentCode), TOKEN_DAYS.p * 86400000), days: TOKEN_DAYS.p, student: studentBrief_(r) };
}
function parentAuth_(tok) {
  var p = verifyToken_(tok, 'p');
  var r = studentRowByKey_(p.k);
  if (!r || !r.parentCode || parentVer_(r.parentCode) !== p.v) throw new Error('AUTH');
  return studentFromRow_(r);
}

// ===================== 학생: 홈 =====================
function weekStartKst_() {
  var d = new Date();
  var dow = Number(Utilities.formatDate(d, TZ, 'u')); // 1=월 … 7=일
  return Utilities.formatDate(new Date(d.getTime() - (dow - 1) * 86400000), TZ, 'yyyy-MM-dd');
}
function addDays_(ymd, n) {
  var p = ymd.split('-');
  var d = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + n));
  return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
}
function studentHome_(tok) {
  var a = { token: tok };
  var h = studentHome(a);
  var st = auth_(a);
  var today = todayKst_(), ws = weekStartKst_();
  var week = h.lectures.filter(function (l) { return l.date >= ws; });
  var units = studentUnits_(st);
  var exams = studentExams_(st).filter(function (x) { return x.date >= today; });
  var wrong = attachReviews_(st, wrongNotesCore_(st));
  var c = classMap_()[st.classId];
  var newAnswers = readAll_('Questions').filter(function (r) { return r.studentKey === st.key && r.answer && r.seen !== '1'; }).length;
  return {
    student: studentBrief_(studentRowByKey_(st.key)),
    mustChange: h.mustChange,
    notices: c && c.archived ? [] : studentNoticesCore_(st),
    lectures: h.lectures, upcoming: h.upcoming,
    week: { total: week.length, done: week.filter(function (l) { return l.status === 'done' || l.status === 'retry'; }).length },
    newUnits: units.list.filter(function (u) { return u.from >= addDays_(today, -7); }).slice(0, 3)
      .map(function (u) { return { id: u.id, title: u.title, videos: u.videos.length, files: u.files.length }; }),
    exams: exams,
    wrongCount: wrong.filter(function (x) { return !x.mastered; }).length,
    reviewDue: wrong.filter(function (x) { return x.due; }).length,
    newAnswers: newAnswers,
    lastJournal: st.classId ? lastJournal_(st.classId) : null,
    archived: c && c.archived ? { date: c.archived, mediaUntil: addDays_(c.archived, 7) } : null
  };
}

// ===================== 학생: 시험 D-day (학생이 직접 설정) =====================
function studentExams_(st) {
  return examProgress_(st, readAll_('Exams').filter(function (r) { return r.studentKey === st.key; })
    .map(function (r) { return { id: r.id, title: r.title, date: r.date, range: parseJson_(r.rangeJson, []) || [] }; })
    .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }));
}
function studentSaveExam_(st, d) {
  var title = norm_(d.title).slice(0, 30), date = String(d.date || '');
  if (!title) throw new Error('시험 이름을 넣어 주세요.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('날짜를 골라 주세요.');
  return withLock_(function () {
    var mine = readAll_('Exams').filter(function (r) { return r.studentKey === st.key; });
    var id = d.id && mine.some(function (r) { return r.id === d.id; }) ? d.id : '';
    if (!id && mine.length >= 10) throw new Error('시험은 10개까지 넣을 수 있어요. 지난 시험을 지워 주세요.');
    id = id || newId_();
    var old = mine.filter(function (r) { return r.id === id; })[0];
    upsert_('Exams', function (r) { return r.id === id && r.studentKey === st.key; },
      { id: id, studentKey: st.key, title: title, date: date, updatedAt: nowKst_(), rangeJson: old ? old.rangeJson : '' });
    return studentExams_(st);
  });
}
function studentDeleteExam_(st, d) {
  withLock_(function () { deleteWhere_('Exams', function (r) { return r.id === d.id && r.studentKey === st.key; }); });
  return studentExams_(st);
}

// ===================== 학생: 문제 사진 · 오답 모음 =====================
function studentQuestionImage_(st, d) {
  var c = studentLectureCtx_(st, d.id, false);
  var q = c.lec.questions.filter(function (x) { return x.no === Number(d.no); })[0];
  if (!q || !q.qImage) return null;
  return imageDataUrl_(q.qImage);
}
// 첫 시도에서 틀린 문항. 재풀이를 마쳐 해설이 열린 숙제만 정답·해설을 넣음. 수업 테스트에서 틀린 문항도 포함.
function wrongNotesCore_(st) {
  var lecBy = {};
  allLectures_().forEach(function (l) { lecBy[l.id] = l; });
  var items = [];
  readAll_('Submissions').forEach(function (r) {
    if (r.studentKey !== st.key || !lecBy[r.lectureId]) return;
    var s = parseSub_(r), l = lecBy[r.lectureId];
    var t = targetFor_(l, st.classId) || l.targets[0] || { date: '' };
    var revealed = s.phase === 'revealed';
    l.questions.forEach(function (q) {
      if (effectiveResult_(q, s.firstResult, s.essayScores) !== 'X') return;
      var it = { src: 'hw', id: l.id, title: l.title, date: t.date, no: q.no, type: q.type, area: norm_(q.area) || '기타',
        mine: s.firstAnswers[q.no] == null ? '' : String(s.firstAnswers[q.no]), hasQ: !!q.qImage, revealed: revealed, fixed: false };
      if (revealed) {
        var retry = s.retryAnswers[q.no];
        it.answer = q.answer; it.expText = q.expText || ''; it.hasImage = !!q.expImage;
        it.retry = retry == null ? '' : String(retry);
        it.fixed = retry != null && q.type !== 'essay' && isCorrect_(q, retry);
      }
      items.push(it);
    });
  });
  readAll_('Tests').forEach(function (r) {
    var res = parseJson_(r.resultsJson, {})[st.key];
    if (!res || res.absent) return;
    var tt = testTargetFor_(r, st.classId);
    parseJson_(r.questionsJson, []).forEach(function (q) {
      if (!res.marks || res.marks[q.no] !== 0) return;
      items.push({ src: 'test', id: r.id, title: r.title, date: tt ? tt.date : r.date, no: q.no, type: q.type, area: norm_(q.area) || '기타',
        mine: res.answers && res.answers[q.no] != null ? String(res.answers[q.no]) : '', hasQ: false, revealed: true, fixed: false,
        answer: q.answer || '', expText: q.expText || '', hasImage: !!q.expImage });
    });
  });
  items.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.title < b.title ? -1 : a.title > b.title ? 1 : a.no - b.no); });
  return items;
}

// ===================== 차시 (영상 여러 개 + 파일 여러 개) =====================
function parseUnit_(r) {
  var targets = (parseJson_(r.targetsJson, []) || []).filter(function (t) { return t && t.classId; })
    .map(function (t) { return { classId: t.classId, from: t.from || '', to: t.to || '', students: cleanOverrides_(t.students) }; });
  var videos = (parseJson_(r.videosJson, []) || []).filter(function (v) { return v && v.url; })
    .map(function (v, i) { return { id: v.id || ('v' + i), label: norm_(v.label), url: String(v.url) }; });
  var files = (parseJson_(r.filesJson, []) || []).filter(function (f) { return f && f.fileId; })
    .map(function (f, i) { return { id: f.id || ('f' + i), fileId: f.fileId, fileName: f.fileName || '', mime: f.mime || '', size: Number(f.size) || 0, stamp: f.stamp !== false }; });
  return { id: r.id, title: r.title, memo: r.memo, videos: videos, files: files, targets: targets, audience: r.audience === 'pick' ? 'pick' : 'all' };
}
// 차시를 누가 볼 수 있는지 (영상 v · 자료 f 따로)
//  · 반 전체 차시(all): 반 학생 모두 (중도 입반생은 입반 전 차시 안 보임)
//  · 고른 학생만(pick): 기본은 아무도 안 보임 → 학생의 '늘 받는 것' 설정, 그날 결석·영상 수강이면 영상+자료 자동
//  · 차시별 학생 예외가 있으면 그게 최우선
function attIndex_() {
  var m = {};
  readAll_('Attendance').forEach(function (r) { if (r.status) m[r.classId + '|' + r.date + '|' + r.studentKey] = r.status; });
  return m;
}
function unitAccess_(u, t, s, attIdx) {
  var v, f, why = '';
  if (u.audience === 'all') { v = f = true; why = 'all'; }
  else {
    var rc = String(s.receive || '');
    v = rc.indexOf('v') !== -1; f = rc.indexOf('f') !== -1;
    if (rc) why = 'setting';
  }
  if (s.joinedAt && t.from && s.joinedAt > t.from) { v = f = false; why = 'joined'; }
  if (u.audience !== 'all') {
    var a = attIdx[t.classId + '|' + t.from + '|' + s.key];
    if (a === 'A' || a === 'V') { v = f = true; why = a === 'A' ? 'absent' : 'video'; }
  }
  var o = t.students && t.students[s.key];
  if (o !== undefined) {
    if (typeof o === 'boolean') { v = f = o; }
    else { if (o.v !== undefined) v = o.v; if (o.f !== undefined) f = o.f; }
    why = 'override';
  }
  return { v: !!v && u.videos.length > 0, f: !!f && u.files.length > 0, why: why };
}
function allUnits_() { return readAll_('Units').map(parseUnit_); }
function unitsMigrated_() { return PropertiesService.getScriptProperties().getProperty('UNITS_MIGRATED') === '1'; }
function ensureUnits_() { if (!unitsMigrated_()) migrateToUnits_(); }
// 예전 화면에서 영상·자료를 새로 넣지 못하게 (차시로 옮긴 뒤 데이터가 둘로 갈라지지 않게)
function assertLegacyMediaOpen_() {
  if (unitsMigrated_()) throw new Error('영상·자료는 이제 새 사이트의 자료실(차시)에서 올려 주세요.');
}
// 예전 영상·자료 → 차시로 복사 (한 번만). 제목과 공개 설정(반·기간·학생별 예외)이 같은 것끼리 한 차시로 묶음.
// 원래 Videos·Materials 탭은 그대로 둠. 파일 ID를 예전 자료 ID 그대로 써서 받은 기록이 이어짐.
function migrateToUnits_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('UNITS_MIGRATED') === '1') return { units: 0 };
  return withLock_(function () {
    if (props.getProperty('UNITS_MIGRATED') === '1') return { units: 0 };
    var done = {};
    readAll_('Units').forEach(function (r) { String(r.legacyIds || '').split(',').forEach(function (x) { if (x) done[x] = 1; }); });
    var groups = {}, order = [];
    function keyOf(title, targets) {
      var t = targets.map(function (x) {
        var st = Object.keys(x.students || {}).sort().map(function (k) { return k + '=' + x.students[k]; }).join(';');
        return [x.classId, x.from, x.to, st].join('|');
      }).sort().join('#');
      return norm_(title) + '§' + t;
    }
    function group(title, memo, targets) {
      var k = keyOf(title, targets);
      if (!groups[k]) { groups[k] = { title: norm_(title), memos: [], targets: targets, videos: [], files: [], legacy: [] }; order.push(k); }
      var g = groups[k];
      memo = String(memo || '').trim();
      if (memo && g.memos.indexOf(memo) === -1) g.memos.push(memo);
      return g;
    }
    allVideos_().forEach(function (v) {
      if (done['v:' + v.id] || !v.targets.length) return;
      var g = group(v.title, v.memo, v.targets);
      g.videos.push({ id: v.id, label: '', url: v.url });
      g.legacy.push('v:' + v.id);
    });
    allMaterials_().forEach(function (m) {
      if (done['m:' + m.id] || !m.targets.length || !m.fileId) return;
      var g = group(m.title, m.memo, m.targets);
      g.files.push({ id: m.id, fileId: m.fileId, fileName: m.fileName, mime: m.mime, size: m.size, stamp: m.stamp });
      g.legacy.push('m:' + m.id);
    });
    order.forEach(function (k) {
      var g = groups[k];
      g.videos.forEach(function (v, i) { v.label = g.videos.length > 1 ? '영상 ' + (i + 1) : '영상'; });
      writeRow_('Units', -1, {
        id: newId_(), title: g.title, memo: g.memos.join('\n'), videosJson: JSON.stringify(g.videos), filesJson: JSON.stringify(g.files),
        targetsJson: JSON.stringify(g.targets), updatedAt: nowKst_(), legacyIds: g.legacy.join(',')
      });
    });
    props.setProperty('UNITS_MIGRATED', '1');
    return { units: order.length };
  });
}
// 종강한 반: 종강 후 7일까지만 영상·자료를 열어 둠
function classMediaClosed_(classId, today) {
  var c = classMap_()[classId];
  return !!(c && c.archived && addDays_(c.archived, 7) < today);
}
function unitVisibleNow_(u, st, today, attIdx) {
  if (classMediaClosed_(st.classId, today)) return null;
  var t = videoTarget_(u, st.classId);
  if (!t || !materialOpen_(t, today)) return null;
  var acc = unitAccess_(u, t, st, attIdx || attIndex_());
  return acc.v || acc.f ? acc : null;
}
function studentUnits_(st) {
  ensureUnits_();
  var today = todayKst_(), dl = downloadsBy_(''), list = [], upcoming = 0, wb = watchBy_(st.key);
  if (classMediaClosed_(st.classId, today)) return { list: [], upcoming: 0, closed: true };
  var att = attIndex_();
  allUnits_().forEach(function (u) {
    var t = videoTarget_(u, st.classId);
    if (!t) return;
    var acc = unitAccess_(u, t, st, att);
    if (!acc.v && !acc.f) return;
    if (t.from > today) { upcoming++; return; }
    if (t.to && t.to < today) return;
    list.push({
      id: u.id, title: u.title, memo: u.memo, from: t.from, to: t.to,
      videos: (acc.v ? u.videos : []).map(function (v) {
        var e = videoEmbed_(v.url);
        if (!e) return null;
        var w = wb[u.id + '|' + v.id + '|' + st.key];
        return { id: v.id, label: v.label, kind: e.kind, embed: e.embed, open: e.kind === 'youtube' ? '' : e.open, yt: e.yt || '',
          watch: w ? { pct: w.pct, pos: w.pos, bits: w.bits, dur: w.dur } : null };
      }).filter(function (x) { return x; }),
      files: (acc.f ? u.files : []).map(function (f) {
        var d = dl[f.id + '|' + st.key];
        return { id: f.id, fileName: f.fileName, size: f.size, isPdf: /pdf/i.test(f.mime) || /\.pdf$/i.test(f.fileName), got: d ? d.first : '' };
      })
    });
  });
  list.sort(function (x, y) { return x.from < y.from ? 1 : x.from > y.from ? -1 : 0; });
  return { list: list, upcoming: upcoming, wm: [st.name, st.school].filter(function (x) { return x; }).join(' · ') };
}

// ===================== 영상 시청 진도 =====================
// 5초를 한 칸으로 보고, 실제로 재생된 칸만 채움(건너뛰기·끝으로 넘기기는 안 채워짐). bits는 16진수 비트맵.
var WATCH_STEP = 5;
function watchBy_(key) {
  var out = {};
  readAll_('Watch').forEach(function (r) {
    if (key && r.studentKey !== key) return;
    out[r.unitId + '|' + r.videoId + '|' + r.studentKey] = { dur: Number(r.dur) || 0, bits: String(r.bits || ''), pct: Number(r.pct) || 0, pos: Number(r.pos) || 0,
      sec: Number(r.sec) || 0, updatedAt: r.updatedAt, doneAt: r.doneAt || '' };
  });
  return out;
}
function orHex_(a, b) {
  a = String(a || '').replace(/[^0-9a-f]/gi, ''); b = String(b || '').replace(/[^0-9a-f]/gi, '');
  var n = Math.max(a.length, b.length), out = '';
  for (var i = 0; i < n; i++) out += (parseInt(a.charAt(i) || '0', 16) | parseInt(b.charAt(i) || '0', 16)).toString(16);
  return out;
}
function hexPct_(hex, dur) {
  var cells = Math.max(1, Math.ceil(dur / WATCH_STEP)), on = 0;
  for (var i = 0; i < hex.length && i * 4 < cells; i++) {
    var v = parseInt(hex.charAt(i), 16);
    for (var b = 0; b < 4; b++) if (i * 4 + b < cells && (v & (8 >> b))) on++;
  }
  return Math.min(100, Math.round(on / cells * 100));
}
function studentWatch_(st, d) {
  ensureUnits_();
  var u = allUnits_().filter(function (x) { return x.id === d.unitId; })[0];
  var acc = u ? unitVisibleNow_(u, st, todayKst_()) : null;
  if (!acc || !acc.v || !u.videos.some(function (v) { return v.id === d.videoId; })) return { ok: false };
  var dur = Math.max(0, Math.min(Number(d.dur) || 0, 6 * 3600));
  if (!dur) return { ok: false };
  var maxLen = Math.ceil(Math.ceil(dur / WATCH_STEP) / 4);
  var bits = String(d.bits || '').replace(/[^0-9a-f]/gi, '').slice(0, maxLen);
  var pos = Math.max(0, Math.min(Number(d.pos) || 0, dur)), add = Math.max(0, Math.min(Number(d.sec) || 0, 600));
  return withLock_(function () {
    var row = readAll_('Watch').filter(function (r) { return r.unitId === d.unitId && r.videoId === d.videoId && r.studentKey === st.key; })[0];
    var merged = orHex_(row ? row.bits : '', bits).slice(0, maxLen);
    var pct = hexPct_(merged, dur), now = nowKst_();
    var doneAt = row && row.doneAt ? row.doneAt : (pct >= 90 ? now : '');
    writeRow_('Watch', row ? row.__row : -1, { unitId: d.unitId, videoId: d.videoId, studentKey: st.key, dur: Math.round(dur), bits: merged, pct: pct,
      pos: Math.round(pos), sec: Math.round((row ? Number(row.sec) || 0 : 0) + add), updatedAt: now, doneAt: doneAt });
    return { ok: true, pct: pct };
  });
}
// 파일 받기: 공개 여부 확인 → 받은 기록 → 파일 내용(base64) + 워터마크 문구(이름 · 학교 · yyMMdd)
function downloadUnitFile_(st, unitId, fileId) {
  ensureUnits_();
  var today = todayKst_(), u = null, f = null;
  allUnits_().some(function (x) {
    if (unitId && x.id !== unitId) return false;
    var hit = x.files.filter(function (y) { return y.id === fileId; })[0];
    if (hit) { u = x; f = hit; return true; }
    return false;
  });
  if (!u) throw new Error('자료를 찾을 수 없어요.');
  var acc = unitVisibleNow_(u, st, today);
  if (!acc || !acc.f) throw new Error('지금은 받을 수 없는 자료예요.');
  var blob;
  try { blob = DriveApp.getFileById(f.fileId).getBlob(); } catch (e) { throw new Error('파일을 불러오지 못했어요. 선생님께 말해 주세요.'); }
  writeRow_('Downloads', -1, { materialId: f.id, studentKey: st.key, at: nowKst_(), unitId: u.id });
  var name = f.fileName || u.title;
  var isPdf = /pdf/i.test(blob.getContentType()) || /\.pdf$/i.test(name);
  return {
    name: name, mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()),
    stamp: f.stamp && isPdf ? [st.name, normSchool_(st.school), Utilities.formatDate(new Date(), TZ, 'yyMMdd')].join(' · ') : ''
  };
}
// 예전 화면(전환 전)도 차시 데이터를 그대로 보여 주도록 예전 모양으로 바꿔 줌
function legacyVideosFromUnits_(st) {
  var u = studentUnits_(st), list = [];
  u.list.forEach(function (x) {
    x.videos.forEach(function (v) {
      list.push({ id: v.id, title: x.title + (x.videos.length > 1 && v.label ? ' · ' + v.label : ''), memo: x.memo, from: x.from, to: x.to,
        kind: v.kind, embed: v.embed, open: v.open });
    });
  });
  return { list: list, upcoming: u.upcoming };
}
function legacyMaterialsFromUnits_(st) {
  var u = studentUnits_(st), list = [];
  u.list.forEach(function (x) {
    x.files.forEach(function (f) {
      list.push({ id: f.id, title: x.title, memo: x.memo, fileName: f.fileName, size: f.size, from: x.from, to: x.to, got: f.got });
    });
  });
  return { list: list, upcoming: u.upcoming };
}

// --- 강사: 차시 ---
function adminUnits_(tok, classId) {
  checkAdmin_(tok);
  ensureUnits_();
  var cm = classMap_(), today = todayKst_();
  var students = classStudents_(classId);
  var dl = downloadsBy_(''), vw = viewsBy_(), att = attIndex_();
  return allUnits_().map(function (u) {
    var t = videoTarget_(u, classId);
    if (!t) return null;
    var state = t.from > today ? 'upcoming' : (t.to && t.to < today) ? 'closed' : 'open';
    var accs = students.map(function (s) { return { s: s, a: unitAccess_(u, t, s, att) }; });
    var canV = accs.filter(function (x) { return x.a.v; }), canF = accs.filter(function (x) { return x.a.f; });
    var viewed = canV.filter(function (x) { return u.videos.some(function (v) { return vw[u.id + '|' + v.id + '|' + x.s.key]; }); }).length;
    var allowed = accs.filter(function (x) { return x.a.v || x.a.f; });
    var got = canF.filter(function (x) { return u.files.some(function (f) { return dl[f.id + '|' + x.s.key]; }); }).length;
    var others = u.targets.filter(function (x) { return x.classId !== classId && cm[x.classId]; }).map(function (x) { return classLabel_(cm[x.classId]); });
    return { id: u.id, title: u.title, from: t.from, to: t.to, state: state, videos: u.videos.length, files: u.files.length,
      allowed: allowed.length, allowedV: canV.length, allowedF: canF.length, got: got, viewed: viewed, audience: u.audience,
      overrides: Object.keys(t.students || {}).length, sharedWith: others };
  }).filter(function (x) { return x; }).sort(function (a, b) { return a.from < b.from ? 1 : a.from > b.from ? -1 : 0; });
}
function adminGetUnit_(tok, id) {
  checkAdmin_(tok);
  ensureUnits_();
  return allUnits_().filter(function (u) { return u.id === id; })[0] || null;
}
function adminSaveUnit_(tok, p) {
  checkAdmin_(tok);
  ensureUnits_();
  var title = norm_(p.title);
  if (!title) throw new Error('차시 제목을 넣어 주세요.');
  var videos = (p.videos || []).filter(function (v) { return v && String(v.url || '').trim(); }).map(function (v, i) {
    if (!videoEmbed_(v.url)) throw new Error((i + 1) + '번째 영상 링크가 유튜브나 구글 드라이브 링크가 아니에요.');
    return { id: v.id || newId_(), label: norm_(v.label) || ('영상 ' + (i + 1)), url: String(v.url).trim() };
  });
  var prev = p.id ? allUnits_().filter(function (u) { return u.id === p.id; })[0] : null;
  var prevFiles = {};
  if (prev) prev.files.forEach(function (f) { prevFiles[f.id] = f; });
  var files = (p.files || []).filter(function (f) { return f && f.fileId; }).map(function (f) {
    var old = f.id && prevFiles[f.id] && prevFiles[f.id].fileId === f.fileId ? prevFiles[f.id] : null;
    if (old) return { id: old.id, fileId: old.fileId, fileName: old.fileName, mime: old.mime, size: old.size, stamp: f.stamp !== false };
    var file;
    try { file = DriveApp.getFileById(f.fileId); } catch (e) { throw new Error('파일을 찾을 수 없어요. 다시 올려 주세요.'); }
    return { id: newId_(), fileId: f.fileId, fileName: file.getName(), mime: file.getMimeType(), size: file.getSize(), stamp: f.stamp !== false };
  });
  if (!videos.length && !files.length) throw new Error('영상이나 파일을 하나 이상 넣어 주세요.');
  var cm = classMap_();
  var targets = (p.targets || []).map(function (t) { return { classId: t.classId, from: t.from || '', to: t.to || '', students: cleanOverrides_(t.students) }; })
    .filter(function (t) { return cm[t.classId] && t.from; });
  if (!targets.length) throw new Error('보여줄 반을 하나 이상 고르고 시작 날짜를 넣어 주세요.');
  var bad = targets.filter(function (t) { return t.to && t.to < t.from; });
  if (bad.length) throw new Error('끝 날짜가 시작 날짜보다 빨라요: ' + bad.map(function (t) { return classLabel_(cm[t.classId]); }).join(', '));
  return withLock_(function () {
    var id = p.id || newId_();
    var old = readAll_('Units').filter(function (r) { return r.id === id; })[0];
    upsert_('Units', function (r) { return r.id === id; }, {
      id: id, title: title, memo: String(p.memo || '').slice(0, 2000), videosJson: JSON.stringify(videos), filesJson: JSON.stringify(files),
      targetsJson: JSON.stringify(targets), updatedAt: nowKst_(), legacyIds: old ? old.legacyIds : '',
      audience: p.audience === 'all' ? 'all' : p.audience === 'pick' ? 'pick' : (old && old.audience ? old.audience : 'all')
    });
    return { ok: true, id: id };
  });
}
// 차시를 지워도 드라이브 파일은 그대로 둠
function adminDeleteUnit_(tok, id) {
  checkAdmin_(tok);
  withLock_(function () {
    var u = allUnits_().filter(function (x) { return x.id === id; })[0];
    if (!u) return;
    var fileIds = {};
    u.files.forEach(function (f) { fileIds[f.id] = 1; });
    deleteWhere_('Units', function (r) { return r.id === id; });
    deleteWhere_('Downloads', function (r) { return r.unitId === id || fileIds[r.materialId]; });
  });
  return { ok: true };
}
function adminDownloadLog_(tok, unitId, classId) {
  checkAdmin_(tok);
  var u = allUnits_().filter(function (x) { return x.id === unitId; })[0];
  if (!u) return null;
  var t = videoTarget_(u, classId);
  var dl = downloadsBy_(''), vw = viewsBy_(), att = attIndex_(), wb = watchBy_('');
  var rows = classStudents_(classId).map(function (s) {
    var acc = t ? unitAccess_(u, t, s, att) : { v: false, f: false };
    return {
      key: s.key, name: s.name, allowed: acc.v || acc.f, canV: acc.v, canF: acc.f,
      videos: u.videos.map(function (v) { var x = vw[u.id + '|' + v.id + '|' + s.key], w = wb[u.id + '|' + v.id + '|' + s.key];
        return { first: x ? x.first : '', count: x ? x.count : 0, pct: w ? w.pct : null, sec: w ? w.sec : 0, last: w ? w.updatedAt : '', done: w ? w.doneAt : '' }; }),
      files: u.files.map(function (f) {
        var d = dl[f.id + '|' + s.key];
        return { first: d ? d.first : '', last: d ? d.last : '', count: d ? d.count : 0 };
      })
    };
  });
  return { title: u.title, from: t ? t.from : '', to: t ? t.to : '', files: u.files.map(function (f) { return { id: f.id, fileName: f.fileName }; }),
    videos: u.videos.map(function (v) { return { id: v.id, label: v.label }; }), rows: rows };
}

// ===================== 리포트 (학부모 · 강사 공통) =====================
function pct_(sc) { return sc && sc.max ? Math.round(sc.score / sc.max * 100) : null; }
function avg_(arr) { return arr.length ? Math.round(arr.reduce(function (a, b) { return a + b; }, 0) / arr.length) : null; }
function homeworkFor_(st) {
  var today = todayKst_(), now = nowKst_();
  var events = classEvents_(allLectures_(), st.classId);
  var subBy = {};
  readAll_('Submissions').forEach(function (r) { if (r.studentKey === st.key) subBy[r.lectureId] = parseSub_(r); });
  return events.filter(function (e) {
    // 입반 전 숙제는 제출한 경우만 셈 (중도 입반생이 미제출로 잡히지 않게)
    return e.t.date <= today && (!st.joinedAt || e.t.date >= st.joinedAt || subBy[e.lec.id]);
  }).map(function (e) {
    var sub = subBy[e.lec.id], deadline = deadlineFor_(e.t, events);
    var sc = sub ? computeScore_(e.lec.questions, sub.firstResult, sub.essayScores) : null;
    return {
      id: e.lec.id, date: e.t.date, title: e.lec.title, deadline: deadline,
      status: sub ? (sub.late ? 'late' : 'done') : ((deadline && now > deadline) ? 'missing' : 'todo'),
      score: sc ? sc.score : null, max: sc ? sc.max : null, pending: sc ? sc.pending : 0, pct: pct_(sc)
    };
  });
}
function summarize_(list) {
  var due = list.filter(function (h) { return h.status !== 'todo'; });
  var done = due.filter(function (h) { return h.status === 'done' || h.status === 'late'; });
  return {
    due: due.length, done: done.length, onTime: due.filter(function (h) { return h.status === 'done'; }).length,
    missing: due.length - done.length,
    rate: due.length ? Math.round(done.length / due.length * 100) : null,
    avg: avg_(done.filter(function (h) { return h.pct != null; }).map(function (h) { return h.pct; }))
  };
}
function reportFor_(st, month) {
  var today = todayKst_();
  month = /^\d{4}-\d{2}$/.test(String(month || '')) ? String(month) : today.slice(0, 7);
  var hw = homeworkFor_(st);
  var rec = studentRecordsCore_(st);
  var monthsMap = {};
  monthsMap[today.slice(0, 7)] = 1;
  hw.forEach(function (h) { monthsMap[h.date.slice(0, 7)] = 1; });
  rec.tests.forEach(function (t) { if (t.date) monthsMap[t.date.slice(0, 7)] = 1; });
  var inMonth = hw.filter(function (h) { return h.date.slice(0, 7) === month; });
  // 진도: 반 숙제 중 열린 것 / 전체, 이 학생에게 보이는 차시 중 열린 것 / 전체
  var events = classEvents_(allLectures_(), st.classId);
  ensureUnits_();
  var attI = attIndex_();
  var myUnits = allUnits_().map(function (u) { var t = videoTarget_(u, st.classId); if (!t) return null; var a = unitAccess_(u, t, st, attI); return a.v || a.f ? t : null; })
    .filter(function (t) { return t; });
  var comment = readAll_('Comments').filter(function (r) { return r.studentKey === st.key && r.month === month; })[0];
  return {
    student: studentBrief_(studentRowByKey_(st.key)),
    month: month,
    months: Object.keys(monthsMap).sort().reverse(),
    summary: { month: summarize_(inMonth), overall: summarize_(hw) },
    homework: inMonth.slice().reverse(),
    trend: hw.filter(function (h) { return h.pct != null; }).slice(-12).map(function (h) { return { date: h.date, title: h.title, pct: h.pct }; }),
    recentMissing: hw.filter(function (h) { return h.status === 'missing'; }).slice(-5).reverse(),
    tests: rec.tests.filter(function (t) { return !t.absent; }).slice(0, 12).reverse()
      .map(function (t) { return { date: t.date, title: t.title, score: t.score, max: t.max, pct: t.max ? Math.round(t.score / t.max * 100) : null }; }),
    testsInMonth: rec.tests.filter(function (t) { return (t.date || '').slice(0, 7) === month; })
      .map(function (t) { return { date: t.date, title: t.title, score: t.score, max: t.max, absent: !!t.absent }; }),
    areas: rec.areas.slice(0, 3).map(function (a) { return { area: a.area, total: a.total, correct: a.correct, pct: a.total ? Math.round(a.correct / a.total * 100) : null }; }),
    progress: {
      lecturesOpened: events.filter(function (e) { return e.t.date <= today; }).length, lecturesTotal: events.length,
      unitsOpened: myUnits.filter(function (t) { return t.from <= today; }).length, unitsTotal: myUnits.length
    },
    comment: comment ? comment.text : '',
    attendance: attendanceSummary_(st.key, month, false),
    attendanceAll: attendanceSummary_(st.key, '', false).rate,
    journals: st.classId ? journalsFor_(st.classId, month) : []
  };
}
function adminStudentReport_(tok, d) {
  checkAdmin_(tok);
  var r = studentRowByKey_(d.key);
  if (!r) throw new Error('학생을 찾을 수 없어요.');
  var st = studentFromRow_(r);
  var rep = reportFor_(st, d.month);
  var dlCount = readAll_('Downloads').filter(function (x) { return x.studentKey === st.key; }).length;
  rep.admin = { key: r.key, joinedAt: r.joinedAt || '', pinSet: r.pinSet === '1', tempPin: r.pinSet === '1' ? '' : normPin_(r.pin),
    parentCode: r.parentCode || ensureParentCode_(r.key), downloads: dlCount,
    areasAll: studentRecordsCore_(st).areas, notes: notesFor_(r.key) };
  rep.attendance = attendanceSummary_(st.key, rep.month, true);
  return rep;
}
// ===================== 인쇄용 성적표 (기간 선택) =====================
function adminReportCard_(tok, d) {
  checkAdmin_(tok);
  var c = classMap_()[d.classId];
  if (!c) throw new Error('반을 찾을 수 없어요.');
  var ok = function (x) { return /^\d{4}-\d{2}-\d{2}$/.test(String(x || '')); };
  var today = todayKst_(), from = ok(d.from) ? d.from : today.slice(0, 8) + '01', to = ok(d.to) ? d.to : today;
  if (from > to) { var tmp = from; from = to; to = tmp; }
  var students = classStudents_(d.classId);
  var keys = d.key ? [d.key] : students.map(function (s) { return s.key; });
  var inClass = {}; students.forEach(function (s) { inClass[s.key] = s; });
  if (d.key && !inClass[d.key]) { var one = studentRowByKey_(d.key); if (!one) throw new Error('학생을 찾을 수 없어요.'); inClass[d.key] = one; }
  // 반 평균: 숙제별·테스트별
  var events = classEvents_(allLectures_(), d.classId).filter(function (e) { return e.t.date >= from && e.t.date <= to && e.t.date <= today; });
  var subBy = {};
  readAll_('Submissions').forEach(function (r) { if (inClass[r.studentKey]) subBy[r.lectureId + '|' + r.studentKey] = r; });
  var lecAvg = {};
  events.forEach(function (e) {
    var arr = [];
    students.forEach(function (s) { var r = subBy[e.lec.id + '|' + s.key]; if (r) { var sub = parseSub_(r); var p = pct_(computeScore_(e.lec.questions, sub.firstResult, sub.essayScores)); if (p != null) arr.push(p); } });
    lecAvg[e.lec.id] = avg_(arr);
  });
  var testAvg = {};
  readAll_('Tests').forEach(function (r) {
    var tt = testTargetFor_(r, d.classId); if (!tt) return;
    var res = parseJson_(r.resultsJson, {}), qs = parseJson_(r.questionsJson, []), arr = [];
    students.forEach(function (s) {
      var x = res[s.key]; if (!x || x.absent || !x.marks) return;
      var sc = 0, mx = 0, g = 0;
      qs.forEach(function (q) { var pts = Number(q.points) || 1, m = x.marks[q.no]; mx += pts; if (m === 1) { sc += pts; g++; } else if (m === 0) g++; });
      if (g && mx) arr.push(Math.round(sc / mx * 100));
    });
    testAvg[r.id] = avg_(arr);
  });
  var cards = keys.map(function (k) {
    var row = inClass[k]; var st = studentFromRow_(row);
    var hw = homeworkFor_(st).filter(function (h) { return h.date >= from && h.date <= to && h.status !== 'todo'; });
    hw.forEach(function (h) { h.classAvg = lecAvg[h.id] == null ? null : lecAvg[h.id]; });
    var sm = summarize_(hw);
    var hwClass = avg_(hw.map(function (h) { return h.classAvg; }).filter(function (x) { return x != null; }));
    var rec = studentRecordsCore_(st, from, to);
    var tests = rec.tests.slice().reverse().map(function (t) {
      return { date: t.date, title: t.title, absent: !!t.absent, score: t.score, max: t.max, pct: t.absent || !t.max ? null : Math.round(t.score / t.max * 100), classAvg: testAvg[t.id] == null ? null : testAvg[t.id] };
    });
    var tp = tests.filter(function (t) { return t.pct != null; });
    var att = readAll_('Attendance').filter(function (r) { return r.studentKey === k && r.status && r.date >= from && r.date <= to; });
    var cnt = { O: 0, L: 0, A: 0, E: 0, V: 0 }; att.forEach(function (r) { cnt[r.status] = (cnt[r.status] || 0) + 1; });
    var ckey = 'RC:' + from + '~' + to;
    var cms = readAll_('Comments').filter(function (r) { return r.studentKey === k; });
    var cm = cms.filter(function (r) { return r.month === ckey; })[0];
    if (!cm && from.slice(0, 7) === to.slice(0, 7)) cm = cms.filter(function (r) { return r.month === from.slice(0, 7); })[0];
    return {
      key: k, name: row.name, school: row.school, grade: row.grade,
      hw: { list: hw.map(function (h) { return { date: h.date, title: h.title, status: h.status, pct: h.pct, pending: h.pending, classAvg: h.classAvg }; }),
        due: sm.due, done: sm.done, onTime: sm.onTime, late: sm.done - sm.onTime, missing: sm.missing, rate: sm.rate, avg: sm.avg, classAvg: hwClass },
      tests: tests,
      testAvg: avg_(tp.map(function (t) { return t.pct; })),
      testClassAvg: avg_(tp.map(function (t) { return t.classAvg; }).filter(function (x) { return x != null; })),
      att: { total: att.length, present: cnt.O, late: cnt.L, absent: cnt.A, early: cnt.E, video: cnt.V,
        rate: att.length ? Math.round((att.length - cnt.A) / att.length * 100) : null,
        list: att.filter(function (r) { return r.status !== 'O' && r.status !== 'V'; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; })
          .map(function (r) { return { date: r.date, label: ATT_LABEL[r.status], status: r.status }; }) },
      areas: rec.areas.map(function (a) { return { area: a.area, total: a.total, correct: a.correct, pct: a.total ? Math.round(a.correct / a.total * 100) : null }; }),
      comment: cm ? cm.text : '', commentKey: ckey
    };
  });
  return { classLabel: classLabel_(c), academy: c.academy || '', className: c.name, from: from, to: to, issued: today, students: cards };
}
function adminSaveComment_(tok, d) {
  checkAdmin_(tok);
  if (!studentRowByKey_(d.key)) throw new Error('학생을 찾을 수 없어요.');
  if (!/^\d{4}-\d{2}$/.test(String(d.month || '')) && !/^RC:\d{4}-\d{2}-\d{2}~\d{4}-\d{2}-\d{2}$/.test(String(d.month || ''))) throw new Error('월이 올바르지 않아요.');
  var text = String(d.text || '').slice(0, 2000);
  withLock_(function () {
    upsert_('Comments', function (r) { return r.studentKey === d.key && r.month === d.month; },
      { studentKey: d.key, month: d.month, text: text, updatedAt: nowKst_() });
  });
  return { ok: true };
}
function adminResetPin_(tok, key) {
  checkAdmin_(tok);
  return withLock_(function () {
    var r = studentRowByKey_(key);
    if (!r) throw new Error('학생을 찾을 수 없어요.');
    setCell_('Students', r.__row, 'pin', DEFAULT_PIN);
    setCell_('Students', r.__row, 'pinSet', '');
    setCell_('Students', r.__row, 'pinHash', '');
    setCell_('Students', r.__row, 'pinSalt', '');
    setCell_('Students', r.__row, 'pinVersion', (Number(r.pinVersion) || 0) + 1);
    return { ok: true, pin: DEFAULT_PIN };
  });
}
function adminParentCode_(tok, d) {
  checkAdmin_(tok);
  return { code: ensureParentCode_(d.key, !!d.reissue) };
}

// ===================== 강사: 홈 대시보드 · 반 리포트 =====================
function subIndex_() {
  var m = {};
  readAll_('Submissions').forEach(function (r) { m[r.lectureId + '|' + r.studentKey] = parseSub_(r); });
  return m;
}
function adminDashboard_(tok) {
  checkAdmin_(tok);
  var today = todayKst_(), all = allLectures_(), subs = subIndex_();
  var students = readAll_('Students');
  var classes = allClasses_().filter(function (c) { return !c.archived; }).map(function (c) {
    var st = students.filter(function (s) { return s.classId === c.id; });
    var opened = classEvents_(all, c.id).filter(function (e) { return e.t.date <= today; });
    var latest = opened.length ? opened[opened.length - 1] : null;
    var missing = latest ? st.filter(function (s) {
      return (!s.joinedAt || s.joinedAt <= latest.t.date) && !subs[latest.lec.id + '|' + s.key];
    }).map(function (s) { return s.name; }) : [];
    var essay = 0, dropping = [];
    st.forEach(function (s) {
      var pcts = [];
      opened.forEach(function (e) {
        var sub = subs[e.lec.id + '|' + s.key];
        if (!sub) return;
        var sc = computeScore_(e.lec.questions, sub.firstResult, sub.essayScores);
        essay += sc.pending;
        if (sc.max) pcts.push(sc.score / sc.max * 100);
      });
      // 점수 하락: 최근 숙제가 직전 3개 평균보다 15점 이상 낮음
      if (pcts.length >= 3) {
        var last = pcts[pcts.length - 1], prev = pcts.slice(-4, -1);
        if (avg_(prev) - last >= 15) dropping.push(s.name);
      }
    });
    return { id: c.id, academy: c.academy, name: c.name, label: classLabel_(c), students: st.length,
      latest: latest ? { id: latest.lec.id, title: latest.lec.title, date: latest.t.date } : null,
      missing: missing.length, missingNames: missing, essayPending: essay, dropping: dropping.length, droppingNames: dropping,
      absentStreak: absentStreaks_(c.id, st) };
  });
  var acad = {}, order = [];
  classes.forEach(function (c) {
    var k = c.academy || '기타';
    if (!acad[k]) { acad[k] = { name: k, classes: [], totals: { missing: 0, essayPending: 0, dropping: 0, students: 0 } }; order.push(k); }
    acad[k].classes.push(c);
    ['missing', 'essayPending', 'dropping', 'students'].forEach(function (f) { acad[k].totals[f] += c[f]; });
  });
  order.sort(function (a, b) { return a === '기타' ? 1 : b === '기타' ? -1 : a.localeCompare(b); });
  // 오늘 할 일
  var names = studentNameMap_(), cm = classMap_();
  var todayLectures = [];
  classes.forEach(function (c) { var l = lectureOn_(c.id, today); if (l) todayLectures.push({ classId: c.id, className: c.name, academy: c.academy, title: l.lec.title, startTime: l.t.startTime }); });
  todayLectures.sort(function (a, b) { return (a.startTime || '99') < (b.startTime || '99') ? -1 : 1; });
  var reminders = readAll_('Notes').filter(function (r) { return r.remindAt && r.remindAt <= today && r.done !== '1' && names[r.studentKey]; })
    .map(function (r) { var s = names[r.studentKey]; return { id: r.id, key: r.studentKey, name: s.name, classLabel: cm[s.classId] ? classLabel_(cm[s.classId]) : '', text: String(r.text).slice(0, 80), remindAt: r.remindAt }; });
  var absentToday = readAll_('Attendance').filter(function (r) { return r.date === today && r.status === 'A' && names[r.studentKey]; })
    .map(function (r) { return { key: r.studentKey, name: names[r.studentKey].name, classLabel: cm[r.classId] ? classLabel_(cm[r.classId]) : '' }; });
  var openQ = readAll_('Questions').filter(function (r) { return r.status === 'open'; }).length;
  var essayTotal = classes.reduce(function (a, c) { return a + c.essayPending; }, 0);
  return { today: today, todo: { lectures: todayLectures, reminders: reminders, absent: absentToday, questions: openQ, essay: essayTotal },
    lastBackup: PropertiesService.getScriptProperties().getProperty('LAST_BACKUP') || '',
    academies: order.map(function (k) {
      acad[k].classes.sort(function (a, b) { return a.name.localeCompare(b.name); });
      return acad[k];
    }) };
}
function adminClassReport_(tok, classId) {
  checkAdmin_(tok);
  var c = classMap_()[classId];
  if (!c) throw new Error('반을 찾을 수 없어요.');
  var today = todayKst_(), now = nowKst_(), subs = subIndex_();
  var events = classEvents_(allLectures_(), classId);
  var opened = events.filter(function (e) { return e.t.date <= today; });
  var students = classStudents_(classId);
  var lectures = opened.map(function (e) {
    var eligible = students.filter(function (s) { return !s.joinedAt || s.joinedAt <= e.t.date; });
    var pcts = [];
    var submitted = eligible.filter(function (s) {
      var sub = subs[e.lec.id + '|' + s.key];
      if (sub) { var p = pct_(computeScore_(e.lec.questions, sub.firstResult, sub.essayScores)); if (p != null) pcts.push(p); }
      return !!sub;
    }).length;
    return { id: e.lec.id, date: e.t.date, title: e.lec.title, eligible: eligible.length, submitted: submitted, avg: avg_(pcts) };
  }).reverse();
  var rows = students.map(function (s) {
    var done = 0, miss = 0, pcts = [];
    opened.forEach(function (e) {
      var sub = subs[e.lec.id + '|' + s.key];
      if (sub) {
        done++;
        var p = pct_(computeScore_(e.lec.questions, sub.firstResult, sub.essayScores));
        if (p != null) pcts.push(p);
      } else if (!s.joinedAt || s.joinedAt <= e.t.date) {
        var dl = deadlineFor_(e.t, events);
        if (dl && now > dl) miss++;
      }
    });
    return { key: s.key, name: s.name, school: s.school, joinedAt: s.joinedAt || '', done: done, missing: miss, att: attendanceSummary_(s.key, '', false).rate,
      avg: avg_(pcts), last: pcts.length ? Math.round(pcts[pcts.length - 1]) : null };
  }).sort(function (a, b) { return (b.avg == null ? -1 : b.avg) - (a.avg == null ? -1 : a.avg); });
  return { class: { id: c.id, label: classLabel_(c) }, lectures: lectures, rows: rows };
}

// ===================== 학생 키가 바뀔 때(이름·학교 수정) 새 기록도 함께 옮김 =====================
function moveStudentKey_(oldKey, newKey) {
  readAll_('Units').forEach(function (r) {
    var ts = parseJson_(r.targetsJson, []) || [], moved = false;
    ts.forEach(function (t) {
      if (t && t.students && t.students[oldKey] !== undefined) { t.students[newKey] = t.students[oldKey]; delete t.students[oldKey]; moved = true; }
    });
    if (moved) setCell_('Units', r.__row, 'targetsJson', JSON.stringify(ts));
  });
  readAll_('Materials').forEach(function (r) {
    var ts = parseJson_(r.targetsJson, []) || [], moved = false;
    ts.forEach(function (t) {
      if (t && t.students && t.students[oldKey] !== undefined) { t.students[newKey] = t.students[oldKey]; delete t.students[oldKey]; moved = true; }
    });
    if (moved) setCell_('Materials', r.__row, 'targetsJson', JSON.stringify(ts));
  });
  ['Exams', 'Comments', 'Downloads', 'Attendance', 'Notes', 'Questions', 'Reviews', 'Views', 'Watch'].forEach(function (name) {
    readAll_(name).forEach(function (r) { if (r.studentKey === oldKey) setCell_(name, r.__row, 'studentKey', newKey); });
  });
}

// ===================== 비밀번호 해시 전환 (한 번만) =====================
// 학생이 직접 정한 비밀번호만 해시로 옮기고 pin 칸을 비움. 임시 비밀번호(1111 등)는 선생님이 아는 값이라 그대로 둠.
function migratePins_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('PIN_HASHED') === '1') return 0;
  return withLock_(function () {
    if (props.getProperty('PIN_HASHED') === '1') return 0;
    var n = 0;
    readAll_('Students').forEach(function (r) {
      if (r.pinSet !== '1' || r.pinHash || !String(r.pin || '').trim()) return;
      var salt = randomHex_(16);
      setCell_('Students', r.__row, 'pinSalt', salt);
      setCell_('Students', r.__row, 'pinHash', pinHash_(salt, normPin_(r.pin)));
      setCell_('Students', r.__row, 'pin', '');
      n++;
    });
    props.setProperty('PIN_HASHED', '1');
    return n;
  });
}

// ===================== 전환 스위치 · 새 사이트 주소 =====================
function siteSwitched_() { return PropertiesService.getScriptProperties().getProperty('SITE_SWITCHED') === '1'; }
function siteUrl_() { return PropertiesService.getScriptProperties().getProperty('SITE_URL') || SITE_URL_DEFAULT; }
function escHtml_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function redirectPage_() {
  var url = siteUrl_(), u = escHtml_(url);
  var html = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>' + APP_TITLE + '</title></head>' +
    '<body style="margin:0;font-family:sans-serif;background:#FAF7F2;color:#2F3437;text-align:center;padding:72px 20px">' +
    '<h2 style="margin:0 0 8px">사이트 주소가 바뀌었어요</h2>' +
    '<p style="color:#6A6F75;margin:0 0 28px">' + u + '</p>' +
    '<a href="' + u + '" target="_top" style="display:inline-block;background:#F4B49C;color:#3A1E12;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:14px">새 사이트로 가기</a>' +
    '<p style="color:#6A6F75;font-size:13px;margin-top:24px">즐겨찾기도 새 주소로 바꿔 주세요.</p>' +
    '<script>try{window.top.location.replace(' + JSON.stringify(url) + ');}catch(e){}</script></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle(APP_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function adminSiteSettings_(tok, d) {
  checkAdmin_(tok);
  var props = PropertiesService.getScriptProperties();
  if (d && d.save) {
    var url = String(d.siteUrl || '').trim().replace(/\/+$/, '');
    if (!/^https:\/\/[A-Za-z0-9.-]+(\/[^\s"'<>]*)?$/.test(url)) throw new Error('사이트 주소는 https:// 로 시작하게 넣어 주세요.');
    props.setProperty('SITE_URL', url);
    props.setProperty('SITE_SWITCHED', d.switched ? '1' : '');
  }
  return { siteUrl: siteUrl_(), switched: siteSwitched_(), unitsMigrated: unitsMigrated_(),
    pinsHashed: props.getProperty('PIN_HASHED') === '1', version: API_VERSION, lastBackup: props.getProperty('LAST_BACKUP') || '' };
}

// ===================== API 입구 =====================
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function S_(fn) { return function (t, d) { return fn(auth_({ token: t }), d); }; }       // 학생 토큰 필요
function P_(fn) { return function (t, d) { return fn(parentAuth_(t), d); }; }            // 학부모 토큰 필요
var API_ = {
  'ping': function () { return { version: API_VERSION }; },

  // 학생
  'student.login': function (t, d) { return apiStudentLogin_(d); },
  'student.changePin': function (t, d) { return apiStudentChangePin_(t, d); },
  'student.me': S_(function (st) { return studentMe_(st); }),
  'student.home': function (t) { return studentHome_(t); },
  'student.notices': S_(function (st) { return studentNoticesCore_(st); }),
  'student.noticeImage': function (t, d) { return studentNoticeImage({ token: t }, d.id); },
  'student.lecture': function (t, d) { return studentLecture({ token: t }, d.id); },
  'student.questionImage': S_(studentQuestionImage_),
  'student.submitFirst': function (t, d) { return studentSubmitFirst({ token: t }, d.id, d.answers || {}, d.confused || []); },
  'student.submitRetry': function (t, d) { return studentSubmitRetry({ token: t }, d.id, d.answers || {}); },
  'student.explanationImage': function (t, d) { return studentExplanationImage({ token: t }, d.id, d.no); },
  'student.test': function (t, d) { return studentTest({ token: t }, d.id); },
  'student.testImage': function (t, d) { return studentTestImage({ token: t }, d.id, d.no); },
  'student.records': S_(function (st) { return studentRecordsCore_(st); }),
  'student.wrongNotes': S_(function (st) { return attachReviews_(st, wrongNotesCore_(st)); }),
  'student.reviewSet': S_(studentReviewSet_),
  'student.reviewSubmit': S_(studentReviewSubmit_),
  'student.ask': S_(studentAsk_),
  'student.questions': S_(studentQuestions_),
  'student.seenAnswers': S_(studentSeenAnswers_),
  'student.checkin': S_(studentCheckin_),
  'student.viewVideo': S_(studentViewVideo_),
  'student.watch': S_(studentWatch_),
  'student.saveExamRange': S_(studentSaveExamRange_),
  'student.units': S_(function (st) { return studentUnits_(st); }),
  'student.download': S_(function (st, d) { return downloadUnitFile_(st, d.unitId, d.fileId); }),
  'student.exams': S_(function (st) { return studentExams_(st); }),
  'student.saveExam': S_(studentSaveExam_),
  'student.deleteExam': S_(studentDeleteExam_),

  // 학부모
  'parent.login': function (t, d) { return apiParentLogin_(d); },
  'parent.report': P_(function (st, d) { return reportFor_(st, d.month); }),
  'parent.notices': P_(function (st) { return studentNoticesCore_(st); }),

  // 강사
  'admin.login': function (t, d) { return apiAdminLogin_(d); },
  'admin.changePassword': function (t, d) { return apiAdminChangePassword_(t, d); },
  'admin.dashboard': function (t) { return adminDashboard_(t); },
  'admin.siteSettings': function (t, d) { return adminSiteSettings_(t, d); },
  'admin.classes': function (t) { return adminClasses(t); },
  'admin.saveClass': function (t, d) { return adminSaveClass(t, d); },
  'admin.deleteClass': function (t, d) { return adminDeleteClass(t, d.id); },
  'admin.students': function (t) { return adminStudents(t); },
  'admin.addRoster': function (t, d) { return adminAddRoster(t, d.classId, d.school, d.grade, d.rows); },
  'admin.updateStudent': function (t, d) { return adminUpdateStudent(t, d.key, d); },
  'admin.setStudentClass': function (t, d) { return adminSetStudentClass(t, d.key, d.classId); },
  'admin.deleteStudent': function (t, d) { return adminDeleteStudent(t, d.key); },
  'admin.resetPin': function (t, d) { return adminResetPin_(t, d.key); },
  'admin.parentCode': function (t, d) { return adminParentCode_(t, d); },
  'admin.studentReport': function (t, d) { return adminStudentReport_(t, d); },
  'admin.classReport': function (t, d) { return adminClassReport_(t, d.classId); },
  'admin.saveComment': function (t, d) { return adminSaveComment_(t, d); },
  'admin.reportCard': function (t, d) { return adminReportCard_(t, d); },
  'admin.lectures': function (t, d) { return adminLectures(t, d.classId); },
  'admin.getLecture': function (t, d) { return adminGetLecture(t, d.id); },
  'admin.saveLecture': function (t, d) { return adminSaveLecture(t, d); },
  'admin.deleteLecture': function (t, d) { return adminDeleteLecture(t, d.id); },
  'admin.lectureStatus': function (t, d) { return adminLectureStatus(t, d.id, d.classId); },
  'admin.regradeLecture': function (t, d) { return adminRegradeLecture(t, d.id); },
  'admin.gradeEssay': function (t, d) { return adminGradeEssay(t, d.lectureId, d.studentKey, d.no, d.score); },
  'admin.uploadImage': function (t, d) { return adminUploadImage(t, d.dataUrl, d.filename); },
  'admin.getImage': function (t, d) { return adminGetImage(t, d.fileId); },
  'admin.tests': function (t, d) { return adminTests(t, d.classId); },
  'admin.getTest': function (t, d) { return adminGetTest(t, d.id); },
  'admin.classStudents': function (t, d) { return adminClassStudents(t, d.classId); },
  'admin.saveTest': function (t, d) { return adminSaveTest(t, d); },
  'admin.deleteTest': function (t, d) { return adminDeleteTest(t, d.id); },
  'admin.units': function (t, d) { return adminUnits_(t, d.classId); },
  'admin.getUnit': function (t, d) { return adminGetUnit_(t, d.id); },
  'admin.saveUnit': function (t, d) { return adminSaveUnit_(t, d); },
  'admin.deleteUnit': function (t, d) { return adminDeleteUnit_(t, d.id); },
  'admin.uploadFile': function (t, d) { return adminUploadMaterial(t, d.dataUrl, d.filename); },
  'admin.checkLink': function (t, d) { return adminCheckMaterialLink(t, d.link); },
  'admin.downloadLog': function (t, d) { return adminDownloadLog_(t, d.unitId, d.classId); },
  'admin.notices': function (t, d) { return adminNotices(t, d.classId); },
  'admin.getNotice': function (t, d) { return adminGetNotice(t, d.id); },
  'admin.saveNotice': function (t, d) { return adminSaveNotice(t, d); },
  'admin.deleteNotice': function (t, d) { return adminDeleteNotice(t, d.id); },
  'admin.archiveClass': function (t, d) { return adminArchiveClass_(t, d); },
  'admin.attendance': function (t, d) { return adminAttendance_(t, d); },
  'admin.saveAttendance': function (t, d) { return adminSaveAttendance_(t, d); },
  'admin.startCheckin': function (t, d) { return adminStartCheckin_(t, d); },
  'admin.timing': function (t, d) { return adminTiming_(t, d); },
  'admin.stopCheckin': function (t, d) { return adminStopCheckin_(t, d); },
  'admin.makeup': function (t, d) { return adminMakeup_(t, d); },
  'admin.notes': function (t, d) { return adminNotes_(t, d); },
  'admin.saveNote': function (t, d) { return adminSaveNote_(t, d); },
  'admin.deleteNote': function (t, d) { return adminDeleteNote_(t, d); },
  'admin.searchNotes': function (t, d) { return adminSearchNotes_(t, d); },
  'admin.questions': function (t, d) { return adminQuestions_(t, d); },
  'admin.answerQuestion': function (t, d) { return adminAnswerQuestion_(t, d); },
  'admin.copyLecture': function (t, d) { return adminCopyLecture_(t, d); },
  'admin.copyUnit': function (t, d) { return adminCopyUnit_(t, d); },
  'admin.setReceive': function (t, d) { return adminSetReceive_(t, d); },
  'admin.unitAudience': function (t, d) { return adminUnitAudience_(t, d); }
};
// 오류를 화면이 알아듣는 짧은 코드로. 한글 메시지는 그대로 보여 줌.
function apiError_(err) {
  var m = String((err && err.message) || err || '');
  if (err && err.code) return { error: err.code, message: m };
  var map = { AUTH: 'AUTH', ADMIN: 'AUTH', EXPIRED: 'EXPIRED', LOCKED: 'NOT_OPEN', NOT_FOUND: 'NOT_FOUND' };
  if (map[m]) return { error: map[m] };
  if (/[가-힣]/.test(m)) return { error: m };
  console.error((err && err.stack) || m);
  return { error: '서버에서 문제가 생겼어요. 잠시 뒤 다시 해 주세요.' };
}
function doPost(e) {
  var req;
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (x) { return json_({ ok: false, error: '요청 형식이 올바르지 않아요.' }); }
  var action = String(req.action || ''), fn = API_.hasOwnProperty(action) ? API_[action] : null;
  if (!fn) return json_({ ok: false, error: '알 수 없는 요청이에요.' });
  try {
    var data = fn(String(req.token || ''), req.data || {});
    return json_({ ok: true, data: data === undefined ? null : data });
  } catch (err) {
    var r = apiError_(err);
    r.ok = false;
    return json_(r);
  }
}

// ===================== 업데이트 직후 한 번 실행 =====================
// 새 칸·새 탭 만들기 + 학생이 정한 비밀번호를 해시로 옮기기. 실행 로그에 결과가 나와요.
function setupApi() {
  var n = migratePins_();
  setupSheets();
  tokenSecret_();
  try { setupBackup(); } catch (e) { Logger.log('자동 백업 설정은 건너뜀: ' + e.message); }
  Logger.log('비밀번호 해시 전환: ' + n + '명 (이미 했으면 0명)');
  Logger.log('준비 완료. 이제 배포 관리 → 기존 배포 수정 → 새 버전으로 배포하세요.');
}


// =====================================================================
// ===================== 2차 업데이트: 출석·메모·일지·복습·질문 등 =====================
// =====================================================================
var ATT_LABEL = { O: '출석', L: '지각', A: '결석', E: '조퇴', V: '영상' }; // V: 영상으로 수강
function addMinutes_(hhmm, n) {
  var p = String(hhmm || '00:00').split(':'), t = Number(p[0]) * 60 + Number(p[1] || 0) + n;
  t = Math.max(0, Math.min(t, 23 * 60 + 59));
  var hh = Math.floor(t / 60), mm = t % 60;
  return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
}
function studentNameMap_() { var m = {}; readAll_('Students').forEach(function (r) { m[r.key] = r; }); return m; }

// ===================== 종강 =====================
function adminArchiveClass_(tok, d) {
  checkAdmin_(tok);
  return withLock_(function () {
    var r = readAll_('Classes').filter(function (x) { return x.id === d.id; })[0];
    if (!r) throw new Error('반을 찾을 수 없어요.');
    setCell_('Classes', r.__row, 'archived', d.archived ? todayKst_() : '');
    return { ok: true };
  });
}

// ===================== 출석부 =====================
function lectureOn_(classId, date) {
  var hit = null;
  allLectures_().forEach(function (l) { var t = targetFor_(l, classId); if (t && t.date === date && !hit) hit = { lec: l, t: t }; });
  return hit;
}
function adminAttendance_(tok, d) {
  checkAdmin_(tok);
  var c = classMap_()[d.classId];
  if (!c) throw new Error('반을 찾을 수 없어요.');
  var today = todayKst_();
  var all = readAll_('Attendance');
  var dset = {};
  // 수업 날짜: 강사가 정한 날짜만 (숙제 날짜 + 출석·수업 일지를 저장한 날짜). 앞으로의 수업일도 보여 줌.
  all.forEach(function (r) { if (r.classId === d.classId) dset[r.date] = 1; });
  readAll_('Journal').forEach(function (r) { if (r.classId === d.classId && r.text) dset[r.date] = 1; });
  classEvents_(allLectures_(), d.classId).forEach(function (e) { if (e.t.date) dset[e.t.date] = 1; });
  var cand = Object.keys(dset).sort();
  var past = cand.filter(function (x) { return x <= today; }), future = cand.filter(function (x) { return x > today; });
  var nextClass = future[0] || '';
  var date = /^\d{4}-\d{2}-\d{2}$/.test(String(d.date || '')) ? d.date : (past.length ? past[past.length - 1] : (nextClass || today));
  if (cand.length || d.date) dset[date] = 1;
  var att = {};
  all.forEach(function (r) { if (r.classId === d.classId && r.date === date) att[r.studentKey] = r; });
  var j = readAll_('Journal').filter(function (r) { return r.classId === d.classId && r.date === date; })[0];
  var units = allUnits_().map(function (u) { var t = videoTarget_(u, d.classId); return t ? { id: u.id, title: u.title, from: t.from } : null; })
    .filter(function (x) { return x; }).sort(function (a, b) { return a.from < b.from ? 1 : -1; }).slice(0, 30);
  var lec = lectureOn_(d.classId, date);
  // 그날 열린 차시 영상을 열어 본 학생 (영상 수강생 확인용)
  var dayUnits = allUnits_().filter(function (u) { var t = videoTarget_(u, d.classId); return t && t.from === date && u.videos.length; });
  var viewed = {};
  if (dayUnits.length) {
    var ids = {};
    dayUnits.forEach(function (u) { ids[u.id] = 1; });
    readAll_('Views').forEach(function (r) { if (ids[r.unitId] && (!viewed[r.studentKey] || r.at < viewed[r.studentKey])) viewed[r.studentKey] = r.at; });
  }
  return {
    date: date, dates: Object.keys(dset).sort().reverse().slice(0, 60), classLabel: classLabel_(c),
    noClass: !cand.length && !d.date, beforeFirst: !past.length && !!nextClass && !d.date, nextClass: nextClass,
    lecture: lec ? { title: lec.lec.title, startTime: lec.t.startTime } : null,
    students: classStudents_(d.classId).map(function (s) {
      var a = att[s.key];
      return { key: s.key, name: s.name, joinedAt: s.joinedAt || '', status: a ? a.status : '', note: a ? a.note : '', by: a ? a.by : '', at: a ? a.at : '', viewedAt: viewed[s.key] || '' };
    }),
    journal: j ? j.text : '', units: units, checkin: activeCheckin_(d.classId, date)
  };
}
function adminSaveAttendance_(tok, d) {
  checkAdmin_(tok);
  if (!classMap_()[d.classId]) throw new Error('반을 찾을 수 없어요.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.date || ''))) throw new Error('날짜를 골라 주세요.');
  return withLock_(function () {
    var idx = {};
    readAll_('Attendance').forEach(function (r) { if (r.classId === d.classId && r.date === d.date) idx[r.studentKey] = r; });
    var now = nowKst_();
    (d.rows || []).forEach(function (x) {
      var st = ['O', 'L', 'A', 'E', 'V'].indexOf(x.status) !== -1 ? x.status : '';
      var old = idx[x.key];
      var note = String(x.note || '').slice(0, 200);
      if (old && old.status === st && old.note === note) return; // 바뀐 것만 저장
      var obj = { date: d.date, classId: d.classId, studentKey: x.key, status: st, note: note, by: 'teacher', at: now };
      if (old) writeRow_('Attendance', old.__row, obj);
      else if (st) writeRow_('Attendance', -1, obj);
    });
    if (d.journal !== undefined) {
      upsert_('Journal', function (r) { return r.classId === d.classId && r.date === d.date; },
        { date: d.date, classId: d.classId, text: String(d.journal || '').slice(0, 2000), updatedAt: now });
    }
    return { ok: true };
  });
}
// QR 셀프 출석: 강사가 띄우면 40분 동안 열림. 수업 시작 M분(설정, 기본 10분) 뒤부터는 지각.
function adminStartCheckin_(tok, d) {
  checkAdmin_(tok);
  if (!classMap_()[d.classId]) throw new Error('반을 찾을 수 없어요.');
  var date = todayKst_(), c = CacheService.getScriptCache();
  var lec = lectureOn_(d.classId, date);
  var startTime = String(d.startTime || (lec ? lec.t.startTime : '') || '');
  var code = '';
  for (var i = 0; i < 6; i++) code += PARENT_CODE_CHARS.charAt(Math.floor(Math.random() * 32));
  var info = { classId: d.classId, date: date, startTime: startTime, exp: Date.now() + 2400000 };
  c.put('ci:' + code, JSON.stringify(info), 2400);
  c.put('cic:' + d.classId + ':' + date, code, 2400);
  return { code: code, date: date, startTime: startTime, exp: info.exp, lateAfter: timing_().lateAfter };
}
function activeCheckin_(classId, date) {
  var c = CacheService.getScriptCache(), code = c.get('cic:' + classId + ':' + date);
  if (!code) return null;
  var raw = c.get('ci:' + code);
  if (!raw) return null;
  var info = JSON.parse(raw);
  return { code: code, startTime: info.startTime, exp: info.exp };
}
function adminStopCheckin_(tok, d) {
  checkAdmin_(tok);
  var c = CacheService.getScriptCache(), date = todayKst_(), code = c.get('cic:' + d.classId + ':' + date);
  if (code) c.remove('ci:' + code);
  c.remove('cic:' + d.classId + ':' + date);
  return { ok: true };
}
function studentCheckin_(st, d) {
  var code = normCode_(d.code).slice(0, 6);
  var raw = code ? CacheService.getScriptCache().get('ci:' + code) : null;
  if (!raw) throw new Error('출석 QR 시간이 지났거나 맞지 않는 코드예요. 선생님께 말해 주세요.');
  var info = JSON.parse(raw);
  if (info.classId !== st.classId) throw new Error('우리 반 출석 QR이 아니에요.');
  return withLock_(function () {
    var row = readAll_('Attendance').filter(function (r) { return r.classId === info.classId && r.date === info.date && r.studentKey === st.key; })[0];
    if (row && row.status) return { status: row.status, label: ATT_LABEL[row.status], date: info.date, already: true };
    var now = nowKst_();
    var late = info.startTime && now > info.date + ' ' + addMinutes_(info.startTime, timing_().lateAfter);
    var status = late ? 'L' : 'O';
    writeRow_('Attendance', row ? row.__row : -1, { date: info.date, classId: info.classId, studentKey: st.key, status: status, note: '', by: 'qr', at: now });
    return { status: status, label: ATT_LABEL[status], date: info.date };
  });
}
// 출석 요약 (withNotes: 강사 화면에서만 사유까지)
function attendanceSummary_(key, month, withNotes) {
  var rows = readAll_('Attendance').filter(function (r) { return r.studentKey === key && r.status && (!month || r.date.slice(0, 7) === month); });
  var cnt = { O: 0, L: 0, A: 0, E: 0, V: 0 };
  rows.forEach(function (r) { cnt[r.status] = (cnt[r.status] || 0) + 1; });
  return {
    total: rows.length, present: cnt.O, late: cnt.L, absent: cnt.A, early: cnt.E, video: cnt.V,
    rate: rows.length ? Math.round((rows.length - cnt.A) / rows.length * 100) : null,
    list: rows.filter(function (r) { return r.status !== 'O' && r.status !== 'V'; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; })
      .map(function (r) { var o = { date: r.date, status: r.status, label: ATT_LABEL[r.status] }; if (withNotes) o.note = r.note; return o; })
  };
}
// 연속 결석: 이 반에서 가장 최근 출석 기록 2개가 모두 결석
function absentStreaks_(classId, students) {
  var by = {};
  readAll_('Attendance').forEach(function (r) { if (r.classId === classId && r.status) (by[r.studentKey] = by[r.studentKey] || []).push(r); });
  return students.filter(function (s) {
    var list = (by[s.key] || []).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    return list.length >= 2 && list[0].status === 'A' && list[1].status === 'A';
  }).map(function (s) { return s.name; });
}
// 결석생 보강: 이 차시를 그 학생에게 보이게 (입반일 때문에 가려진 경우에도)
function adminMakeup_(tok, d) {
  checkAdmin_(tok);
  return withLock_(function () {
    var r = readAll_('Units').filter(function (x) { return x.id === d.unitId; })[0];
    if (!r) throw new Error('차시를 찾을 수 없어요.');
    var ts = parseJson_(r.targetsJson, []) || [], hit = false;
    ts.forEach(function (t) { if (t && t.classId === d.classId) { t.students = t.students || {}; t.students[d.key] = { v: true, f: true }; hit = true; } });
    if (!hit) throw new Error('이 반에 공개된 차시가 아니에요.');
    setCell_('Units', r.__row, 'targetsJson', JSON.stringify(ts));
    return { ok: true };
  });
}

// ===================== 수업 일지 =====================
function journalsFor_(classId, month) {
  return readAll_('Journal').filter(function (r) { return r.classId === classId && r.text && (!month || r.date.slice(0, 7) === month); })
    .map(function (r) { return { date: r.date, text: r.text }; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
}
function lastJournal_(classId) {
  var today = todayKst_();
  var list = journalsFor_(classId, '').filter(function (j) { return j.date <= today; });
  return list.length ? list[list.length - 1] : null;
}

// ===================== 강사 전용 메모 =====================
var NOTE_TAGS = ['상담', '학부모 통화', '수업 태도', '진도', '기타'];
function parseNote_(r) {
  return { id: r.id, key: r.studentKey, date: r.date, tag: r.tag, text: r.text, pinned: r.pinned === '1', remindAt: r.remindAt || '', done: r.done === '1', updatedAt: r.updatedAt };
}
function notesFor_(key) {
  return readAll_('Notes').filter(function (r) { return r.studentKey === key; }).map(parseNote_).sort(function (a, b) {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (b.date + b.updatedAt).localeCompare(a.date + a.updatedAt);
  });
}
function adminNotes_(tok, d) { checkAdmin_(tok); return notesFor_(d.key); }
function adminSaveNote_(tok, d) {
  checkAdmin_(tok);
  if (!studentRowByKey_(d.key)) throw new Error('학생을 찾을 수 없어요.');
  var text = String(d.text || '').trim().slice(0, 3000);
  if (!text) throw new Error('메모 내용을 써 주세요.');
  var date = /^\d{4}-\d{2}-\d{2}$/.test(String(d.date || '')) ? d.date : todayKst_();
  var remindAt = /^\d{4}-\d{2}-\d{2}$/.test(String(d.remindAt || '')) ? d.remindAt : '';
  return withLock_(function () {
    var id = d.id || newId_();
    upsert_('Notes', function (r) { return r.id === id; }, {
      id: id, studentKey: d.key, date: date, tag: NOTE_TAGS.indexOf(d.tag) !== -1 ? d.tag : '기타', text: text,
      pinned: d.pinned ? '1' : '', remindAt: remindAt, done: d.done ? '1' : '', updatedAt: nowKst_()
    });
    return notesFor_(d.key);
  });
}
function adminDeleteNote_(tok, d) {
  checkAdmin_(tok);
  var key = '';
  withLock_(function () {
    var r = readAll_('Notes').filter(function (x) { return x.id === d.id; })[0];
    if (r) key = r.studentKey;
    deleteWhere_('Notes', function (x) { return x.id === d.id; });
  });
  return key ? notesFor_(key) : [];
}
function adminSearchNotes_(tok, d) {
  checkAdmin_(tok);
  var q = String(d.q || '').replace(/\s+/g, '');
  if (!q) return [];
  var names = studentNameMap_(), cm = classMap_();
  return readAll_('Notes').filter(function (r) { return String(r.text).replace(/\s+/g, '').indexOf(q) !== -1 && names[r.studentKey]; })
    .slice(0, 50).map(function (r) {
      var s = names[r.studentKey];
      return { key: r.studentKey, name: s.name, classLabel: cm[s.classId] ? classLabel_(cm[s.classId]) : '(반 없음)', date: r.date, text: String(r.text).slice(0, 120) };
    });
}

// ===================== 문항별 질문 =====================
function refTitles_() {
  var m = {};
  allLectures_().forEach(function (l) { m['hw|' + l.id] = l.title; });
  readAll_('Tests').forEach(function (r) { m['test|' + r.id] = r.title; });
  return m;
}
function studentAsk_(st, d) {
  var src = d.src === 'test' ? 'test' : 'hw', no = Number(d.no);
  var text = String(d.text || '').trim().slice(0, 500);
  if (!text) throw new Error('궁금한 점을 써 주세요.');
  if (src === 'hw' && !findSub_(d.id, st.key)) throw new Error('낸 숙제의 문항만 질문할 수 있어요.');
  if (src === 'test') {
    var t = readAll_('Tests').filter(function (r) { return r.id === d.id; })[0];
    if (!t || !parseJson_(t.resultsJson, {})[st.key]) throw new Error('내 테스트 문항만 질문할 수 있어요.');
  }
  return withLock_(function () {
    var open = readAll_('Questions').filter(function (r) { return r.studentKey === st.key && r.status === 'open'; }).length;
    if (open >= 20) throw new Error('답을 기다리는 질문이 너무 많아요. 선생님 답을 받은 뒤에 더 물어봐 주세요.');
    writeRow_('Questions', -1, { id: newId_(), studentKey: st.key, src: src, refId: d.id, no: no, text: text, answer: '', status: 'open', askedAt: nowKst_(), answeredAt: '', seen: '' });
    return { ok: true };
  });
}
function studentQuestions_(st) {
  var titles = refTitles_();
  var list = readAll_('Questions').filter(function (r) { return r.studentKey === st.key; }).map(function (r) {
    return { id: r.id, src: r.src, refId: r.refId, no: Number(r.no), title: titles[r.src + '|' + r.refId] || '(지워진 숙제)', text: r.text, answer: r.answer,
      status: r.status, askedAt: r.askedAt, answeredAt: r.answeredAt, isNew: !!r.answer && r.seen !== '1' };
  }).sort(function (a, b) { return b.askedAt.localeCompare(a.askedAt); });
  return list;
}
function studentSeenAnswers_(st) {
  withLock_(function () {
    readAll_('Questions').forEach(function (r) { if (r.studentKey === st.key && r.answer && r.seen !== '1') setCell_('Questions', r.__row, 'seen', '1'); });
  });
  return { ok: true };
}
function adminQuestions_(tok, d) {
  checkAdmin_(tok);
  var names = studentNameMap_(), cm = classMap_(), titles = refTitles_();
  return readAll_('Questions').filter(function (r) { return d.all || r.status === 'open'; }).map(function (r) {
    var s = names[r.studentKey] || {};
    return { id: r.id, key: r.studentKey, name: s.name || '(지워진 학생)', classLabel: cm[s.classId] ? classLabel_(cm[s.classId]) : '',
      src: r.src, refId: r.refId, no: Number(r.no), title: titles[r.src + '|' + r.refId] || '(지워진 숙제)', text: r.text, answer: r.answer, status: r.status, askedAt: r.askedAt };
  }).sort(function (a, b) {
    if ((a.status === 'open') !== (b.status === 'open')) return a.status === 'open' ? -1 : 1;
    return b.askedAt.localeCompare(a.askedAt);
  }).slice(0, 200);
}
function adminAnswerQuestion_(tok, d) {
  checkAdmin_(tok);
  return withLock_(function () {
    var r = readAll_('Questions').filter(function (x) { return x.id === d.id; })[0];
    if (!r) throw new Error('질문을 찾을 수 없어요.');
    var ans = String(d.answer || '').trim().slice(0, 2000);
    setCell_('Questions', r.__row, 'answer', ans);
    setCell_('Questions', r.__row, 'status', ans ? 'answered' : (d.close ? 'closed' : 'open'));
    setCell_('Questions', r.__row, 'answeredAt', ans ? nowKst_() : '');
    setCell_('Questions', r.__row, 'seen', '');
    return { ok: true };
  });
}

// ===================== 오답 다시 풀기 (간격 복습) =====================
// 맞히면 3일 뒤 → 7일 뒤 → 완료(3단계). 틀리면 다음 날 다시.
function reviewIndex_(key) {
  var m = {};
  readAll_('Reviews').forEach(function (r) { if (r.studentKey === key) m[r.src + '|' + r.refId + '|' + r.no] = r; });
  return m;
}
function attachReviews_(st, items) {
  var idx = reviewIndex_(st.key), today = todayKst_();
  items.forEach(function (it) {
    var r = idx[it.src + '|' + it.id + '|' + it.no];
    it.stage = r ? Number(r.stage) || 0 : 0;
    it.mastered = it.stage >= 3;
    it.nextAt = r ? r.nextAt : '';
    it.reviewable = it.revealed && (it.type === 'mcq' || it.type === 'short') && String(it.answer || '').trim() !== '';
    it.due = it.reviewable && !it.mastered && (!r || !r.nextAt || r.nextAt <= today);
  });
  return items;
}
function questionFor_(src, id, no) {
  if (src === 'test') {
    var t = readAll_('Tests').filter(function (r) { return r.id === id; })[0];
    return t ? parseJson_(t.questionsJson, []).filter(function (q) { return q.no === no; })[0] : null;
  }
  var l = allLectures_().filter(function (x) { return x.id === id; })[0];
  return l ? l.questions.filter(function (q) { return q.no === no; })[0] : null;
}
function studentReviewSet_(st) {
  var items = attachReviews_(st, wrongNotesCore_(st)).filter(function (x) { return x.due; }).slice(0, 20);
  return items.map(function (x) {
    var q = questionFor_(x.src, x.id, x.no) || {};
    return { src: x.src, id: x.id, no: x.no, title: x.title, date: x.date, area: x.area, type: x.type, hasQ: x.hasQ,
      pick: x.type === 'mcq' ? (mcqKey_(q.answer).length || 1) : 1, stage: x.stage };
  });
}
function studentReviewSubmit_(st, d) {
  var due = {};
  attachReviews_(st, wrongNotesCore_(st)).forEach(function (x) { if (x.reviewable && !x.mastered) due[x.src + '|' + x.id + '|' + x.no] = x; });
  var today = todayKst_(), out = [];
  return withLock_(function () {
    var idx = reviewIndex_(st.key);
    (d.answers || []).slice(0, 30).forEach(function (a) {
      var k = (a.src === 'test' ? 'test' : 'hw') + '|' + a.id + '|' + Number(a.no), item = due[k];
      if (!item) return;
      var q = questionFor_(item.src, item.id, item.no);
      if (!q) return;
      var mine = String(a.answer == null ? '' : a.answer).slice(0, 200);
      var ok = isCorrect_(q, mine);
      var old = idx[k], stage = old ? Number(old.stage) || 0 : 0;
      stage = ok ? Math.min(3, stage + 1) : 0;
      var next = stage >= 3 ? '' : addDays_(today, ok ? (stage === 1 ? 3 : 7) : 1);
      writeRow_('Reviews', old ? old.__row : -1, { studentKey: st.key, src: item.src, refId: item.id, no: item.no, stage: stage, nextAt: next, lastAt: nowKst_(), lastResult: ok ? 'O' : 'X' });
      out.push({ src: item.src, id: item.id, no: item.no, title: item.title, type: item.type, area: item.area, mine: mine, correct: ok,
        answer: q.answer, expText: q.expText || '', hasImage: !!q.expImage, hasQ: item.hasQ, stage: stage, nextAt: next });
    });
    return out;
  });
}

// ===================== 시험 범위 진도 =====================
function examProgress_(st, exams) {
  var done = {};
  readAll_('Submissions').forEach(function (r) { if (r.studentKey === st.key) done[r.lectureId] = 1; });
  return exams.map(function (x) {
    var range = x.range || [];
    x.rangeTotal = range.length;
    x.rangeDone = range.filter(function (id) { return done[id]; }).length;
    return x;
  });
}
function studentSaveExamRange_(st, d) {
  return withLock_(function () {
    var r = readAll_('Exams').filter(function (x) { return x.id === d.id && x.studentKey === st.key; })[0];
    if (!r) throw new Error('시험을 찾을 수 없어요.');
    var mine = {};
    classEvents_(allLectures_(), st.classId).forEach(function (e) { mine[e.lec.id] = 1; });
    readAll_('Submissions').forEach(function (s) { if (s.studentKey === st.key) mine[s.lectureId] = 1; });
    var ids = (d.lectureIds || []).filter(function (id) { return mine[id]; }).slice(0, 60);
    setCell_('Exams', r.__row, 'rangeJson', JSON.stringify(ids));
    return studentExams_(st);
  });
}

// ===================== 영상 열어 본 기록 =====================
function studentViewVideo_(st, d) {
  var u = allUnits_().filter(function (x) { return x.id === d.unitId; })[0];
  var acc = u ? unitVisibleNow_(u, st, todayKst_()) : null;
  if (!acc || !acc.v) return { ok: false };
  var today = todayKst_();
  var dup = readAll_('Views').some(function (r) { return r.unitId === d.unitId && r.videoId === d.videoId && r.studentKey === st.key && String(r.at).slice(0, 10) === today; });
  if (!dup) writeRow_('Views', -1, { unitId: d.unitId, videoId: String(d.videoId || ''), studentKey: st.key, at: nowKst_() });
  return { ok: true };
}
function viewsBy_() {
  var out = {};
  readAll_('Views').forEach(function (r) {
    var k = r.unitId + '|' + r.videoId + '|' + r.studentKey;
    if (!out[k]) out[k] = { first: r.at, count: 0 };
    out[k].count++;
    if (r.at < out[k].first) out[k].first = r.at;
  });
  return out;
}

// ===================== 복사 (다른 반·다음 기수) =====================
function adminCopyLecture_(tok, d) {
  checkAdmin_(tok);
  var l = allLectures_().filter(function (x) { return x.id === d.id; })[0];
  if (!l) throw new Error('숙제를 찾을 수 없어요.');
  return adminSaveLecture(tok, { id: '', title: norm_(d.title) || l.title, memo: l.memo, targets: d.targets, questions: l.questions });
}
function adminCopyUnit_(tok, d) {
  checkAdmin_(tok);
  var u = allUnits_().filter(function (x) { return x.id === d.id; })[0];
  if (!u) throw new Error('차시를 찾을 수 없어요.');
  return adminSaveUnit_(tok, { id: '', title: norm_(d.title) || u.title, memo: u.memo,
    videos: u.videos.map(function (v) { return { label: v.label, url: v.url }; }),
    files: u.files.map(function (f) { return { fileId: f.fileId, stamp: f.stamp }; }), targets: d.targets, audience: u.audience });
}

// ===================== 자동 백업 (매주 월요일 새벽) =====================
// 편집기에서 setupBackup을 한 번 실행하면 예약돼요. 시트 내용만 새 스프레드시트로 복사(스크립트는 복사 안 함).
function getBackupFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('BACKUP_FOLDER');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { } }
  var folder = DriveApp.createFolder(APP_TITLE + ' - 백업');
  props.setProperty('BACKUP_FOLDER', folder.getId());
  return folder;
}
function weeklyBackup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var name = ss.getName() + ' 백업 ' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  var copy = SpreadsheetApp.create(name);
  ss.getSheets().forEach(function (sh) { sh.copyTo(copy).setName(sh.getName()); });
  var first = copy.getSheets()[0];
  if (copy.getSheets().length > 1 && /^(Sheet1|시트1)$/.test(first.getName())) copy.deleteSheet(first);
  var folder = getBackupFolder_();
  DriveApp.getFileById(copy.getId()).moveTo(folder);
  var files = [], it = folder.getFiles();
  while (it.hasNext()) files.push(it.next());
  files.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  files.slice(8).forEach(function (f) { f.setTrashed(true); }); // 최근 8주만 남김
  PropertiesService.getScriptProperties().setProperty('LAST_BACKUP', nowKst_());
}
function setupBackup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'weeklyBackup') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('weeklyBackup').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(4).create();
  weeklyBackup();
  Logger.log('자동 백업을 켰어요. 매주 월요일 새벽에 "' + APP_TITLE + ' - 백업" 폴더에 사본이 생기고, 최근 8주만 남아요.');
}


// ===================== 3차: 학생별 '늘 받는 것' · 차시 공개 대상 =====================
function adminSetReceive_(tok, d) {
  checkAdmin_(tok);
  var rc = (String(d.receive || '').indexOf('v') !== -1 ? 'v' : '') + (String(d.receive || '').indexOf('f') !== -1 ? 'f' : '');
  return withLock_(function () {
    var r = studentRowByKey_(d.key);
    if (!r) throw new Error('학생을 찾을 수 없어요.');
    setCell_('Students', r.__row, 'receive', rc);
    return { ok: true, receive: rc };
  });
}
// 차시 편집 화면의 학생별 설정용: 지금 규칙대로면 누가 영상·자료를 받는지와 그 이유
function adminUnitAudience_(tok, d) {
  checkAdmin_(tok);
  var u = d.unitId ? allUnits_().filter(function (x) { return x.id === d.unitId; })[0] : null;
  var base = { audience: d.audience === 'all' ? 'all' : 'pick', videos: [1], files: [1] };
  var uu = { audience: base.audience, videos: base.videos, files: base.files };
  var t = { classId: d.classId, from: String(d.from || ''), students: {} };
  var att = attIndex_();
  return classStudents_(d.classId).map(function (s) {
    var a = unitAccess_(uu, t, s, att);
    return { key: s.key, name: s.name, joinedAt: s.joinedAt || '', receive: s.receive || '',
      att: att[d.classId + '|' + t.from + '|' + s.key] || '', defV: a.v, defF: a.f, why: a.why };
  });
}

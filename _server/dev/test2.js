// 2차 업데이트 기능 시험
const H = require('./harness.js');
H.ctx.setupApi();
function call(action, token, data) { return JSON.parse(H.ctx.doPost({ postData: { contents: JSON.stringify({ action, token, data }) } }).s); }
let fails = 0;
function check(label, cond, extra) { if (!cond) fails++; console.log((cond ? 'OK  ' : 'FAIL') + ' ' + label + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 400) : '')); }
const at = call('admin.login', '', { password: 'teacherpw1' }).data.token;
const kim = call('student.login', '', { school: '청담고', name: '김철수', pin: '4821' }).data.token;
const park = call('student.login', '', { school: '청담고', name: '박중도', pin: '1111' }).data.token;

// 캐시: 두 번째 읽기는 시트를 안 읽음
let reads = 0;
const orig = H.sheets.Students.getDataRange;
H.sheets.Students.getDataRange = function () { reads++; return orig.call(this); };
call('student.me', kim, {}); call('student.me', kim, {});
check('시트 캐시: 두 번 요청에 Students 시트는 한 번만 읽음', reads <= 1, reads);
call('admin.updateStudent', at, { key: '청담고|1|박중도', name: '박중도', school: '청담고', grade: '1', classId: 'c1', joinedAt: '2026-11-20' });
reads = 0; call('student.me', kim, {});
check('저장하면 캐시가 새로 읽힘', reads === 1, reads);
H.sheets.Students.getDataRange = orig;

// 출석
let r = call('admin.attendance', at, { classId: 'c1', date: '2026-11-21' });
check('출석부 불러오기', r.ok && r.data.students.length === 2 && r.data.lecture && r.data.lecture.title === '2차시 숙제', r.data && r.data.dates);
r = call('admin.saveAttendance', at, { classId: 'c1', date: '2026-11-21', rows: [{ key: '청담고|1|김철수', status: 'O' }, { key: '청담고|1|박중도', status: 'A', note: '학교 행사' }], journal: '전자기 유도 개념, 교재 12~18쪽' });
check('출석 저장 + 일지', r.ok);
call('admin.saveAttendance', at, { classId: 'c1', date: '2026-11-14', rows: [{ key: '청담고|1|박중도', status: 'A' }, { key: '청담고|1|김철수', status: 'L' }] });
r = call('admin.dashboard', at, {});
const spark = r.data.academies[0].classes[0];
check('연속 결석 경고', JSON.stringify(spark.absentStreak) === '["박중도"]', spark.absentStreak);
check('오늘 할 일 블록', r.data.todo && typeof r.data.todo.questions === 'number', r.data.todo);
r = call('admin.startCheckin', at, { classId: 'c1', startTime: '23:59' });
check('QR 출석 시작', r.ok && /^[A-HJ-NP-Z2-9]{6}$/.test(r.data.code), r.data);
const code = r.data.code;
r = call('student.checkin', kim, { code: code.toLowerCase() });
check('QR 출석 → 출석', r.ok && r.data.status === 'O', r.data);
r = call('student.checkin', kim, { code });
check('두 번 찍어도 그대로', r.ok && r.data.already, r.data);
const lee = call('student.login', '', { school: '세화여고', name: '이영희', pin: '1111' }).data.token;
r = call('student.checkin', lee, { code });
check('다른 반 학생은 막힘', !r.ok && /우리 반/.test(r.error), r.error);
r = call('student.checkin', park, { code: 'ZZZZZZ' });
check('틀린 코드', !r.ok, r.error);
r = call('admin.attendance', at, { classId: 'c1' });
check('출석부에 QR 표시', r.ok && r.data.students.find(s => s.name === '김철수').by === 'qr' && r.data.checkin, r.data.checkin);

// 메모
r = call('admin.saveNote', at, { key: '청담고|1|김철수', tag: '상담', text: '내신 목표 1등급, 계산 실수 잦음', pinned: true });
check('메모 저장', r.ok && r.data.length === 1 && r.data[0].pinned);
r = call('admin.saveNote', at, { key: '청담고|1|김철수', tag: '학부모 통화', text: '어머님과 통화, 다음 상담 예정', remindAt: '2026-11-20' });
check('상담 알림 메모', r.ok && r.data.length === 2);
r = call('admin.dashboard', at, {});
check('오늘 할 일: 상담 알림', r.data.todo.reminders.length === 1, r.data.todo.reminders);
r = call('admin.searchNotes', at, { q: '계산 실수' });
check('메모 검색', r.ok && r.data.length === 1 && r.data[0].name === '김철수');
r = call('student.home', kim, {});
check('학생 응답에 메모 없음', r.ok && JSON.stringify(r.data).indexOf('계산 실수') === -1);
r = call('student.me', kim, {});
const pcode = r.data.parentCode;
const pt = call('parent.login', '', { code: pcode }).data.token;
r = call('parent.report', pt, { month: '2026-11' });
check('학부모 리포트: 출석·일지, 메모·사유 없음', r.ok && r.data.attendance.total >= 2 && r.data.journals.length === 1 && JSON.stringify(r.data).indexOf('계산 실수') === -1, r.data.attendance);
const pr = call('parent.report', call('parent.login', '', { code: call('admin.parentCode', at, { key: '청담고|1|박중도' }).data.code }).data.token, { month: '2026-11' });
check('학부모에게 결석 사유는 안 보임', pr.ok && JSON.stringify(pr.data).indexOf('학교 행사') === -1, pr.data.attendance);
r = call('admin.studentReport', at, { key: '청담고|1|박중도' });
check('강사 리포트엔 사유 보임', r.ok && JSON.stringify(r.data.attendance).indexOf('학교 행사') !== -1);
r = call('student.home', kim, {});
check('학생 홈: 지난 수업 일지', r.ok && r.data.lastJournal && /전자기/.test(r.data.lastJournal.text), r.data.lastJournal);

// 오답 다시 풀기
call('student.submitFirst', kim, { id: 'L2', answers: { 1: '4', 2: '미토콘드리아', 3: '3' } });
r = call('student.reviewSet', kim, {});
check('복습: 공개 전 숙제는 안 나옴 (테스트 문항만)', r.ok && r.data.every(x => x.src === 'test'), r.data);
call('student.submitRetry', kim, { id: 'L2', answers: { 1: '4' } });
r = call('student.reviewSet', kim, {});
check('복습 목록 (정답 미포함)', r.ok && r.data.some(x => x.src === 'hw' && x.no === 1 && x.pick === 2) && !('answer' in r.data[0]), r.data);
r = call('student.reviewSubmit', kim, { answers: [{ src: 'hw', id: 'L2', no: 1, answer: '45' }, { src: 'test', id: 'T1', no: 1, answer: '3' }] });
check('복습 채점: 맞힘 → 3일 뒤, 틀림 → 내일', r.ok && r.data[0].correct && r.data[0].stage === 1 && !r.data[1].correct && r.data[1].stage === 0, r.data.map(x => [x.no, x.correct, x.stage, x.nextAt]));
r = call('student.reviewSet', kim, {});
check('오늘 다시 나오지 않음', r.ok && !r.data.some(x => x.src === 'hw' && x.no === 1));
r = call('student.wrongNotes', kim, {});
check('오답 모음에 복습 단계', r.ok && r.data.find(x => x.src === 'hw').stage === 1);

// 질문
r = call('student.ask', kim, { src: 'hw', id: 'L2', no: 1, text: '5번 보기가 왜 맞는지 모르겠어요' });
check('질문하기', r.ok);
r = call('student.ask', park, { src: 'hw', id: 'L2', no: 1, text: '?' });
check('안 낸 숙제는 질문 못 함', !r.ok);
r = call('admin.questions', at, {});
check('질문함', r.ok && r.data.length === 1 && r.data[0].name === '김철수', r.data);
call('admin.answerQuestion', at, { id: r.data[0].id, answer: '자기장 방향을 반대로 생각해 봐!' });
r = call('student.home', kim, {});
check('새 답변 알림', r.data.newAnswers === 1);
r = call('student.questions', kim, {});
check('내 질문 목록', r.ok && r.data[0].isNew && r.data[0].answer);
call('student.seenAnswers', kim, {});
check('읽음 처리', call('student.home', kim, {}).data.newAnswers === 0);

// 시험 범위
let ex = call('student.saveExam', kim, { title: '기말', date: '2026-12-10' }).data;
r = call('student.saveExamRange', kim, { id: ex[0].id, lectureIds: ['L1', 'L2', 'L3', 'NOPE'] });
check('범위 진도', r.ok && r.data[0].rangeTotal === 3 && r.data[0].rangeDone === 1, r.data[0]);
ex = call('student.saveExam', kim, { id: ex[0].id, title: '2학기 기말', date: '2026-12-10' }).data;
check('시험 이름 바꿔도 범위 유지', ex[0].rangeTotal === 3);

// 영상 시청
r = call('student.units', kim, {});
const u1 = r.data.list.find(u => u.title === '1강');
call('student.viewVideo', kim, { unitId: u1.id, videoId: u1.videos[0].id });
call('student.viewVideo', kim, { unitId: u1.id, videoId: u1.videos[0].id });
r = call('admin.downloadLog', at, { unitId: u1.id, classId: 'c1' });
check('시청 기록 (하루 한 번)', r.ok && r.data.rows.find(x => x.name === '김철수').videos[0].count === 1, r.data.videos);
r = call('admin.units', at, { classId: 'c1' });
check('차시 목록 시청 수', r.data.find(u => u.title === '1강').viewed === 1);

// 보강
r = call('admin.makeup', at, { unitId: u1.id, classId: 'c1', key: '청담고|1|박중도' });
check('결석생 보강 → 중도 입반생도 1강 보임', r.ok && call('student.units', park, {}).data.list.some(u => u.title === '1강'));

// 복사
r = call('admin.copyLecture', at, { id: 'L2', targets: [{ classId: 'c2', date: '2026-11-22' }] });
check('숙제 복사', r.ok && r.data.id !== 'L2');
r = call('admin.copyUnit', at, { id: u1.id, targets: [{ classId: 'c2', from: '2026-11-22' }] });
check('차시 복사', r.ok);
r = call('student.units', lee, {});
check('복사된 차시가 다른 반에 보임', r.ok && r.data.list.some(u => u.title === '1강' && u.videos.length === 2 && u.files.length === 1));

// 종강
r = call('admin.archiveClass', at, { id: 'c2', archived: true });
check('종강 처리', r.ok && call('admin.dashboard', at, {}).data.academies.every(a => a.classes.every(c => c.id !== 'c2')));
r = call('student.home', lee, {});
check('종강반 학생 홈 (1주 동안 자료 열림)', r.ok && r.data.archived && call('student.units', lee, {}).data.list.length > 0, r.data.archived);
// 종강일을 10일 전으로
const cls = H.sheets.Classes._data; const ci = cls[0].indexOf('archived');
cls.find(x => x[0] === 'c2')[ci] = '2026-11-10';
H.ctx.invalidate_('Classes');
r = call('student.units', lee, {});
check('종강 1주 지나면 자료 닫힘', r.ok && r.data.closed && r.data.list.length === 0);
check('기록은 그대로', call('student.records', lee, {}).ok);
r = call('admin.classes', at, {});
check('설정에 종강반 표시', r.data.find(c => c.id === 'c2').archived === '2026-11-10');
call('admin.archiveClass', at, { id: 'c2', archived: false });
check('다시 열기', call('admin.dashboard', at, {}).data.academies.some(a => a.classes.some(c => c.id === 'c2')));
check('반 이름 고쳐도 종강 상태 유지', (() => { call('admin.archiveClass', at, { id: 'c2', archived: true }); call('admin.saveClass', at, { id: 'c2', academy: '한양학원', name: 'COMPASS 2' }); return !!call('admin.classes', at, {}).data.find(c => c.id === 'c2').archived; })());
console.log(fails ? `\n${fails} FAIL` : '\nALL OK');

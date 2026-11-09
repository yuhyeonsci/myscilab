// 미리보기용 예시 데이터 (이름·점수는 모두 가짜)
module.exports = function (H) {
  function call(action, token, data) {
    const r = JSON.parse(H.ctx.doPost({ postData: { contents: JSON.stringify({ action, token, data }) } }).s);
    if (!r.ok) console.log('seed fail', action, r.error);
    return r.data;
  }
  const at = call('admin.login', '', { password: 'teacherpw1' }).token;
  call('admin.addRoster', at, { classId: 'c1', school: '현대고', grade: '1', rows: [{ name: '정하은' }, { name: '최도윤' }, { name: '한서연' }] });
  call('admin.addRoster', at, { classId: 'c2', school: '세화여고', grade: '1', rows: [{ name: '윤지아' }] });
  const Q = [
    { type: 'mcq', answer: '3', area: '전자기 유도', points: 1, expText: '자석이 가까워질수록 자기 선속이 늘어나요.' },
    { type: 'mcq', answer: '4+5', area: '전자기 유도', points: 1, expText: '두 개 모두 골라야 정답이에요.' },
    { type: 'short', answer: '렌츠/렌츠의 법칙', area: '전자기 유도', points: 1 },
    { type: 'mcq', answer: '2', area: '원소의 주기성', points: 1 },
    { type: 'mcq', answer: '1', area: '원소의 주기성', points: 1 },
    { type: 'essay', answer: '전류의 방향이 반대가 된다', area: '전자기 유도', points: 2 }
  ];
  call('admin.saveLecture', at, { id: 'L4', title: '3차시 · 전자기 유도', memo: '교재 42~47쪽 문제를 풀고 답을 입력해요.', targets: [{ classId: 'c1', date: '2026-11-24', startTime: '14:00' }], questions: Q });
  call('admin.saveNotice', at, { title: '11/28 수업은 13:30에 시작해요', body: '학교 행사 때문에 30분 일찍 시작해요.\n교재 꼭 챙겨 오세요.', pinned: true, targets: [{ classId: 'c1', from: '2026-11-20' }] });
  // 학생 제출
  function stu(name, school, pin) { const r = call('student.login', '', { school, name, pin }); return r && r.token; }
  const t1 = stu('정하은', '현대고', '1111');
  call('student.submitFirst', t1, { id: 'L2', answers: { 1: '45', 2: '미토콘드리아', 3: '3' } });
  const t2 = stu('최도윤', '현대고', '1111');
  call('student.submitFirst', t2, { id: 'L2', answers: { 1: '4', 2: '엽록체', 3: '1' } });
  const k = stu('김철수', '청담고', '4821');
  call('student.submitFirst', k, { id: 'L1', answers: { 1: '45', 2: '미토콘드리아', 3: '2' } });
  call('student.submitRetry', k, { id: 'L1', answers: { 3: '3' } });
  call('student.saveExam', k, { title: '2학기 기말고사', date: '2026-12-18' });
  call('student.units', k, {});
  call('admin.saveComment', at, { key: '청담고|1|김철수', month: '2026-11', text: '숙제를 꼬박꼬박 내고 있어요. 전자기 유도 계산 문제만 조금 더 연습하면 좋겠어요.' });
};

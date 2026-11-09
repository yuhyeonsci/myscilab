// 학생 화면: 로그인 → 홈 / 숙제 / 자료실 / 내 기록 (+ 오답 모음, 공지, 테스트 결과, 비밀번호 바꾸기)
(function () {
  var h = UI.h, icon = UI.icon, ROLE = 'student';
  var PIN_LEN = window.APP_CONFIG.PIN_LENGTH || 6;
  var S = { pin: '', mustChange: false, who: null, keyHandler: null, home: null };
  var NAV = [
    { href: '#/', label: '홈', icon: 'home', key: 'home' },
    { href: '#/hw', label: '숙제', icon: 'hw', key: 'hw' },
    { href: '#/units', label: '자료실', icon: 'folder', key: 'units' },
    { href: '#/me', label: '내 기록', icon: 'chart', key: 'me' }
  ];
  function call(action, data) { return API.call(action, data, ROLE); }
  function loadWho() { try { S.who = JSON.parse(localStorage.getItem('msl_student_who') || 'null'); } catch (e) { S.who = null; } }
  function saveWho(st) {
    if (!st) return;
    S.who = [(st.academy ? st.academy + ' · ' : '') + (st.className || st.school || ''), st.name];
    try { localStorage.setItem('msl_student_who', JSON.stringify(S.who)); } catch (e) { }
  }
  function logout() {
    API.setToken(ROLE, '');
    try { localStorage.removeItem('msl_student_who'); } catch (e) { }
    S = { pin: '', mustChange: false, who: null, keyHandler: null, home: null };
    API.clearCache(ROLE);
    location.hash = '#/';
    renderLogin();
  }
  function page(active, content) {
    if (S.keyHandler) { document.removeEventListener('keydown', S.keyHandler); S.keyHandler = null; }
    UI.mount(UI.shell({ nav: NAV, active: active, who: S.who, content: content, onLogout: logout }));
    window.scrollTo(0, 0);
  }
  // 불러오는 동안 빙글 → 다 되면 채움
  function loadInto(box, promise, fill) {
    box.appendChild(UI.loading());
    promise.then(function (d) { box.innerHTML = ''; fill(d); }, function (e) {
      box.innerHTML = '';
      if (e && (e.code === 'AUTH' || e.code === 'EXPIRED')) return;
      box.appendChild(UI.errorBox(e, route));
    });
  }
  // 저장된 내용 먼저 보여 주고 새로 받아 바꾸기
  function live(box, reqs, fill) { API.live(box, ROLE, reqs, fill, function (e) { box.appendChild(UI.errorBox(e, route)); }); }
  function callC(action, data) { return API.call(action, data, ROLE, { cache: true }); }
  function fmtAns(type, a) {
    if (a == null || a === '') return '–';
    if (type === 'mcq') return String(a).replace(/[^1-5]/g, '').split('').join('+') || '–';
    return String(a);
  }
  function back(href, label, here) {
    return h('nav', { class: 'backrow', 'aria-label': '위치' }, h('a', { href: href }, icon('left', 16), label), here ? h('span', { class: 'here', text: here }) : null);
  }

  window.addEventListener('auth-lost', function (e) {
    if (e.detail.role !== ROLE) return;
    UI.toast(e.detail.code === 'EXPIRED' ? '로그인 시간이 지났어요. 다시 로그인해 주세요.' : '다시 로그인해 주세요.');
    renderLogin();
  });
  window.addEventListener('hashchange', route);

  function route() {
    if (!API.getToken(ROLE)) return renderLogin();
    if (S.mustChange) return renderPinChange(true);
    var p = location.hash.replace(/^#\/?/, '').split('/');
    switch (p[0]) {
      case 'hw': return p[1] ? viewLecture(decodeURIComponent(p[1])) : viewHwList();
      case 'units': return viewUnits();
      case 'me': return viewMe();
      case 'wrong': return viewWrong();
      case 'notices': return viewNotices();
      case 'test': return viewTest(decodeURIComponent(p[1] || ''));
      case 'pin': return renderPinChange(false);
      case 'review': return viewReview();
      case 'questions': return viewQuestions();
      case 'checkin': return doCheckin(p[1] || '');
      default: return viewHome();
    }
  }

  // ===================== 로그인 =====================
  function renderLogin() {
    if (S.keyHandler) { document.removeEventListener('keydown', S.keyHandler); S.keyHandler = null; }
    var school = h('input', { class: 'input', id: 'lg-school', autocomplete: 'off', placeholder: '학교 이름' });
    var name = h('input', { class: 'input', id: 'lg-name', autocomplete: 'off', placeholder: '이름' });
    var pin = h('input', { class: 'input pin', id: 'lg-pin', type: 'password', inputmode: 'numeric', maxlength: String(PIN_LEN), autocomplete: 'off', placeholder: '숫자 비밀번호' });
    var err = h('p', { class: 'err', role: 'alert' });
    var btn = h('button', { class: 'btn primary block', type: 'submit' }, '들어가기');
    var form = h('form', { class: 'card form', onsubmit: function (e) {
      e.preventDefault();
      err.textContent = '';
      var p = pin.value.trim();
      if (!school.value.trim() || !name.value.trim() || !/^\d{4,6}$/.test(p)) { err.textContent = '학교·이름·비밀번호를 모두 넣어 주세요.'; return; }
      UI.busy(btn, async function () {
        var r = await API.call('student.login', { school: school.value, name: name.value, pin: p });
        API.setToken(ROLE, r.token);
        S.pin = p; S.mustChange = r.mustChange;
        saveWho(r.student);
        if (!location.hash || location.hash === '#') location.hash = '#/';
        route();
      }).catch(function (e) { err.textContent = e.message; });
    } },
      h('div', { class: 'field' }, h('label', { for: 'lg-school', text: '학교' }), school),
      h('div', { class: 'field' }, h('label', { for: 'lg-name', text: '이름' }), name),
      h('div', { class: 'field' }, h('label', { for: 'lg-pin', text: '비밀번호' }), pin),
      err, btn,
      h('p', { class: 'small muted', style: 'text-align:center', text: '비밀번호를 잊었으면 선생님께 말해 주세요.' }));
    UI.mount(h('div', { class: 'auth' }, h('div', { class: 'box' },
      h('div', { class: 'brand' }, h('div', { class: 'logo', text: '유' }), window.APP_CONFIG.TITLE),
      h('p', { class: 'lead', text: '숙제 제출 · 수업 자료 · 내 기록' }),
      form,
      h('div', { class: 'inline', style: 'justify-content:center;gap:16px' },
        h('a', { href: '/parent/', class: 'small', text: '학부모 리포트' }),
        h('a', { href: '/admin/', class: 'small muted', text: '선생님' }),
        UI.themeButton()))));
    setTimeout(function () { school.focus(); }, 30);
  }

  // ===================== 비밀번호 바꾸기 =====================
  function renderPinChange(forced) {
    var needCur = !(forced && S.pin);
    var cur = h('input', { class: 'input pin', id: 'pc-cur', type: 'password', inputmode: 'numeric', maxlength: '6', autocomplete: 'off' });
    var p1 = h('input', { class: 'input pin', id: 'pc-1', type: 'password', inputmode: 'numeric', maxlength: String(PIN_LEN), autocomplete: 'off', placeholder: '숫자 ' + PIN_LEN + '자리' });
    var p2 = h('input', { class: 'input pin', id: 'pc-2', type: 'password', inputmode: 'numeric', maxlength: String(PIN_LEN), autocomplete: 'off', placeholder: '한 번 더' });
    var err = h('p', { class: 'err', role: 'alert' });
    var btn = h('button', { class: 'btn primary block', type: 'submit' }, '바꾸기');
    var form = h('form', { class: 'card form', onsubmit: function (e) {
      e.preventDefault();
      err.textContent = '';
      var a = p1.value.trim(), b = p2.value.trim();
      if (!new RegExp('^\\d{' + PIN_LEN + '}$').test(a)) { err.textContent = '숫자 ' + PIN_LEN + '자리로 정해 주세요.'; return; }
      if (a !== b) { err.textContent = '두 번 넣은 번호가 달라요.'; return; }
      UI.busy(btn, async function () {
        var r = await call('student.changePin', { pin: needCur ? cur.value.trim() : S.pin, newPin: a });
        API.setToken(ROLE, r.token);
        S.pin = ''; S.mustChange = false;
        UI.toast('비밀번호를 바꿨어요. 선생님도 모르는 번호예요.');
        location.hash = forced ? '#/' : '#/me';
        route();
      }).catch(function (e) { err.textContent = e.message; });
    } },
      forced ? h('div', { class: 'tint navy card' }, h('p', { class: 'bold', text: '처음 들어왔어요! 나만 아는 비밀번호로 바꿔 주세요.' }),
        h('p', { class: 'small', style: 'margin-top:4px', text: '선생님 화면에도 보이지 않아요. 잊어버리면 선생님이 임시 비밀번호로 되돌려 줄 수 있어요.' })) : null,
      needCur ? h('div', { class: 'field' }, h('label', { for: 'pc-cur', text: '지금 비밀번호' }), cur) : null,
      h('div', { class: 'field' }, h('label', { for: 'pc-1', text: '새 비밀번호' }), p1),
      h('div', { class: 'field' }, h('label', { for: 'pc-2', text: '새 비밀번호 확인' }), p2),
      h('p', { class: 'small muted', text: '같은 숫자 반복(111111)이나 123456 같은 쉬운 번호는 안 돼요.' }),
      err, btn,
      forced ? h('button', { class: 'link', type: 'button', onclick: logout, style: 'align-self:center' }, '로그아웃') : null);
    if (forced) {
      UI.mount(h('div', { class: 'auth' }, h('div', { class: 'box' },
        h('div', { class: 'brand' }, h('div', { class: 'logo', text: '유' }), window.APP_CONFIG.TITLE), form)));
    } else {
      page('me', h('div', { class: 'sec', style: 'max-width:440px' }, back('#/me', '내 기록', '비밀번호 바꾸기'), form));
    }
    setTimeout(function () { (needCur ? cur : p1).focus(); }, 30);
  }

  // ===================== 홈 =====================
  function statusChip(l) {
    if (l.status === 'overdue') return h('span', { class: 'chip coral', text: '마감 지남' });
    if (l.status === 'retry') return h('span', { class: 'chip navy', text: '재풀이' });
    if (l.status === 'done') {
      if (l.pending) return h('span', { class: 'chip butter', text: '채점 중' });
      return h('span', { class: 'chip mint', text: UI.pct(l.score, l.max) + '점' });
    }
    if (l.deadline) {
      var d = UI.daysUntil(l.deadline.slice(0, 10));
      if (d <= 0) return h('span', { class: 'chip butter', text: '오늘 마감' });
      if (d === 1) return h('span', { class: 'chip butter', text: '내일 마감' });
    }
    return h('span', { class: 'chip', text: '풀기' });
  }
  function lectureRow(l) {
    var sub = l.status === 'retry' ? '틀린 문항 다시 풀면 해설이 열려요'
      : l.status === 'done' ? (l.score + ' / ' + l.max + (l.late ? ' · 늦게 냄' : '') + (l.pending ? ' · 서술형 채점 중' : ''))
      : (l.count + '문항' + (l.deadline ? ' · 마감 ' + UI.fmtDT(l.deadline) : ''));
    return h('a', { class: 'row', href: '#/hw/' + encodeURIComponent(l.id) },
      h('div', null, h('div', { class: 't', text: l.title }), h('div', { class: 's', text: UI.fmtDate(l.date) + ' · ' + sub })), statusChip(l));
  }
  function viewHome() {
    var box = h('div', { class: 'sec', style: 'gap:16px' });
    page('home', box);
    live(box, [['student.home', {}]], function (r) {
      var d = r[0];
      S.home = d;
      saveWho(d.student);
      if (d.mustChange) { S.mustChange = true; return renderPinChange(true); }
      var who = document.querySelector('.topbar .who');
      if (who) who.replaceWith(h('div', { class: 'who' }, S.who[0], h('br'), h('b', { text: S.who[1] })));
      var todo = d.lectures.filter(function (l) { return l.status !== 'done'; })
        .sort(function (a, b) { return (a.deadline || '9') < (b.deadline || '9') ? -1 : 1; });
      var next = todo.filter(function (l) { return l.deadline; })[0];
      var exam = d.exams[0];
      if (d.archived) box.appendChild(h('div', { class: 'card tint butter small' }, h('b', { text: '종강한 반이에요. ' }),
        UI.daysUntil(d.archived.mediaUntil) >= 0 ? '영상·자료는 ' + UI.fmtDate(d.archived.mediaUntil) + '까지 볼 수 있어요. ' : '', '지난 숙제와 내 기록은 계속 볼 수 있어요.'));
      if (d.notices.length) {
        box.appendChild(h('a', { class: 'notice-strip', href: '#/notices' }, icon('bell', 18),
          h('div', { class: 'txt' }, h('b', { text: '공지' }), ' · ' + d.notices[0].title + (d.notices.length > 1 ? ' 외 ' + (d.notices.length - 1) + '개' : '')), icon('right', 16)));
      }
      var weekPct = d.week.total ? Math.round(d.week.done / d.week.total * 100) : 100;
      var hero = h('section', { class: 'card tint coral sec', style: 'gap:12px;padding:20px' },
        h('div', { class: 'inline', style: 'justify-content:space-between;align-items:flex-start' },
          h('div', null, h('div', { class: 'k', text: '이번 주 할 일' }),
            h('div', { class: 'big hero-title', style: 'margin-top:2px', text: todo.length ? '숙제 ' + todo.length + '개 남았어요' : '남은 숙제가 없어요' })),
          exam ? h('div', { class: 'chip only-m', style: 'background:var(--surface);color:var(--navy-ink);padding:6px 10px;border-radius:12px', text: exam.title + ' ' + UI.dday(exam.date) }) : null),
        d.week.total ? h('div', { class: 'bar', role: 'img', 'aria-label': '이번 주 ' + d.week.total + '개 중 ' + d.week.done + '개 끝' }, h('i', { style: 'width:' + weekPct + '%' })) : null,
        h('div', { class: 'small', style: 'color:var(--coral-deep)', text: (d.week.total ? '이번 주 ' + d.week.total + '개 중 ' + d.week.done + '개 끝' : '이번 주 숙제는 아직 없어요') + (next ? ' · 가장 가까운 마감 ' + UI.fmtDT(next.deadline) : '') }));
      var colA = h('div', { class: 'col-a' }, hero,
        h('section', { class: 'sec' }, h('div', { class: 'sec-h' }, '해야 할 숙제', h('a', { href: '#/hw', class: 'small', text: '전체 보기' })),
          todo.length ? todo.slice(0, 5).map(lectureRow) : h('div', { class: 'card empty', text: '지금 할 숙제가 없어요. 잘했어요!' })));
      var colB = h('div', { class: 'col-b' },
        exam ? h('a', { class: 'card tint navy only-pc', href: '#/me', style: 'text-decoration:none;color:inherit;padding:20px' },
          h('div', { class: 'k', text: exam.title + '까지' }), h('div', { class: 'huge', style: 'color:var(--navy-ink);margin-top:4px', text: UI.dday(exam.date) }),
          h('div', { class: 'small', style: 'color:var(--navy-ink);margin-top:2px', text: UI.fmtDate(exam.date) + (exam.rangeTotal ? ' · 범위 숙제 ' + exam.rangeTotal + '개 중 ' + exam.rangeDone + '개 끝' : '') }))
          : h('a', { class: 'row', href: '#/me' }, h('div', null, h('div', { class: 't', text: '시험 D-day 넣기' }), h('div', { class: 's', text: '내 시험 날짜를 넣으면 홈에 D-day가 떠요' })), icon('right', 18)),
        d.newUnits.length ? h('section', { class: 'sec' }, h('div', { class: 'sec-h', text: '새로 열린 수업' }),
          d.newUnits.map(function (u) {
            return h('a', { class: 'row tint mint', href: '#/units', style: 'border:0' },
              h('div', null, h('div', { class: 't', text: u.title }), h('div', { class: 's', style: 'color:var(--mint-ink)', text: [u.videos ? '영상 ' + u.videos + '개' : '', u.files ? '자료 ' + u.files + '개' : ''].filter(Boolean).join(' · ') })),
              icon('right', 18));
          })) : null,
        d.newAnswers ? h('a', { class: 'row tint navy', href: '#/questions', style: 'border:0' },
          h('div', null, h('div', { class: 't', text: '선생님 답변 ' + d.newAnswers + '개' }), h('div', { class: 's', style: 'color:var(--navy-ink)', text: '내가 한 질문에 답이 달렸어요' })), icon('right', 18)) : null,
        h('a', { class: 'card tint lav', href: d.reviewDue ? '#/review' : '#/wrong', style: 'text-decoration:none;color:inherit' },
          h('div', { class: 'k', text: d.reviewDue ? '오늘 다시 풀 문항' : '내 오답 모음' }),
          h('div', { style: 'font-weight:800;font-size:17px;margin-top:4px', text: d.reviewDue ? d.reviewDue + '개 다시 풀기' : d.wrongCount ? '다시 볼 문항 ' + d.wrongCount + '개' : '틀린 문항이 없어요' })),
        d.lastJournal ? h('section', { class: 'card sec', style: 'gap:4px' }, h('div', { class: 'k', text: '지난 수업 (' + UI.fmtDate(d.lastJournal.date) + ')' }),
          h('p', { class: 'small', style: 'white-space:pre-wrap', text: d.lastJournal.text })) : null);
      box.appendChild(h('div', { class: 'cols' }, colA, colB));
      if (d.upcoming) box.appendChild(h('p', { class: 'small muted', text: '다음 숙제 ' + d.upcoming + '개는 날짜가 되면 열려요.' }));
      if (!S.prefetched) { // 다른 탭 미리 받아 두기
        S.prefetched = true;
        ['student.units', 'student.records', 'student.me', 'student.exams', 'student.wrongNotes'].forEach(function (a) { callC(a, {}).catch(function () { }); });
      }
    });
  }

  // ===================== 숙제 목록 =====================
  function viewHwList() {
    var box = h('div', { class: 'sec', style: 'gap:16px' });
    page('hw', box);
    box.appendChild(h('h1', { text: '숙제' }));
    var inner = h('div', { class: 'sec', style: 'gap:16px' });
    box.appendChild(inner);
    live(inner, [['student.home', {}]], function (r) {
      var d = r[0];
      var todo = d.lectures.filter(function (l) { return l.status !== 'done'; });
      var done = d.lectures.filter(function (l) { return l.status === 'done'; });
      inner.appendChild(h('section', { class: 'sec' }, h('div', { class: 'sec-h', text: '해야 할 숙제 ' + todo.length }),
        todo.length ? todo.map(lectureRow) : h('div', { class: 'card empty', text: '지금 할 숙제가 없어요.' })));
      inner.appendChild(h('section', { class: 'sec' }, h('div', { class: 'sec-h', text: '끝낸 숙제 ' + done.length }),
        done.length ? done.map(lectureRow) : h('div', { class: 'card empty', text: '아직 낸 숙제가 없어요.' })));
      if (d.upcoming) inner.appendChild(h('p', { class: 'small muted', text: '다음 숙제 ' + d.upcoming + '개는 날짜가 되면 열려요.' }));
    });
  }

  // ===================== 숙제 풀기 =====================
  function viewLecture(id) {
    var box = h('div', { class: 'sec', style: 'gap:16px' });
    page('hw', box);
    loadInto(box, call('student.lecture', { id: id }), function (v) { renderLecture(box, v); });
  }
  function lectureHead(v) {
    return [back('#/hw', '숙제', v.title),
      h('div', null, h('h1', { text: v.title }),
        h('p', { class: 'small muted', style: 'margin-top:2px', text: UI.fmtDate(v.date) + (v.deadline ? ' · 마감 ' + UI.fmtDT(v.deadline) : '') + ' · ' + v.questions.length + '문항' })),
      v.memo ? h('div', { class: 'card small', style: 'white-space:pre-wrap', text: v.memo }) : null];
  }
  function renderLecture(box, v) {
    box.innerHTML = '';
    if (S.keyHandler) { document.removeEventListener('keydown', S.keyHandler); S.keyHandler = null; }
    box.appendChild(h('div', { class: 'sec', style: 'gap:12px' }, lectureHead(v)));
    if (v.phase === 'new') { box.appendChild(solver(v, 'first', function (nv) { renderLecture(box, nv); window.scrollTo(0, 0); })); return; }
    box.appendChild(scoreCard(v));
    if (v.phase === 'retry') {
      box.appendChild(h('div', { class: 'card tint navy' }, h('p', { class: 'bold', style: 'color:var(--navy-ink)', text: '틀린 ' + v.wrongNos.length + '문항을 다시 풀어 보세요.' }),
        h('p', { class: 'small', style: 'margin-top:2px', text: '다시 풀고 내면 정답과 해설이 열려요. 점수는 처음 낸 답 기준이에요.' })));
      box.appendChild(solver(v, 'retry', function (nv) { renderLecture(box, nv); window.scrollTo(0, 0); }));
      return;
    }
    box.appendChild(revealList(v.items, { src: 'hw', id: v.id }));
    if (v.areas && v.areas.length) box.appendChild(areaCard(v.areas.map(function (a) { return { area: a.area, total: a.total, correct: a.correct }; }), '영역별 결과'));
  }
  function scoreCard(v) {
    var p = UI.pct(v.score, v.max);
    return h('section', { class: 'card tint coral inline', style: 'justify-content:space-between;padding:18px 20px' },
      h('div', null, h('div', { class: 'k', text: '내 점수 (처음 낸 답 기준)' }),
        h('div', { class: 'big', style: 'margin-top:2px', text: v.score + ' / ' + v.max }),
        v.pending ? h('div', { class: 'small', style: 'color:var(--coral-deep)', text: '서술형 ' + v.pending + '문항은 선생님이 채점 중이에요.' }) : null),
      h('div', { class: 'chips' }, v.late ? h('span', { class: 'chip butter', text: '늦게 냄' }) : null,
        h('span', { class: 'chip', style: 'background:var(--surface);color:var(--coral-ink);font-size:15px;padding:6px 12px', text: p + '점' })));
  }
  // 문제 사진: 화면에 보일 때 불러옴
  function qImage(fetcher) {
    var wrap = h('div', { class: 'qimg' }, h('div', { class: 'loading', style: 'padding:18px 0' }, h('div', { class: 'spin' })));
    var loaded = false;
    function load() {
      if (loaded) return; loaded = true;
      fetcher().then(function (url) {
        wrap.innerHTML = '';
        if (url) wrap.appendChild(h('img', { src: url, alt: '문제', loading: 'lazy' }));
        else wrap.appendChild(h('p', { class: 'small muted', style: 'padding:12px', text: '문제 사진이 없어요.' }));
      }, function (e) { loaded = false; wrap.innerHTML = ''; wrap.appendChild(h('button', { class: 'btn small', type: 'button', style: 'margin:10px', onclick: load }, '문제 사진 다시 불러오기')); });
    }
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) { if (es.some(function (x) { return x.isIntersecting; })) { io.disconnect(); load(); } }, { rootMargin: '300px' });
      setTimeout(function () { io.observe(wrap); }, 0);
    } else setTimeout(load, 0);
    return wrap;
  }
  // 숙제 풀기 (처음·재풀이)
  function solver(v, mode, onDone) {
    var qs = mode === 'retry' ? v.questions.filter(function (q) { return v.wrongNos.indexOf(q.no) !== -1; }) : v.questions;
    return omr({
      items: qs.map(function (q) {
        return { key: String(q.no), short: String(q.no), label: q.no + '번', type: q.type, pick: q.pick || 1, hasQ: q.hasQ,
          img: function () { return call('student.questionImage', { id: v.id, no: q.no }); } };
      }),
      confused: mode === 'first',
      forceShow: mode === 'retry', // 재풀이는 틀린 문제라 사진을 보여 줌
      submitLabel: mode === 'retry' ? '재풀이 내기' : '제출하기',
      confirmMsg: function (left) {
        var msg = left ? '아직 안 푼 문항이 ' + left + '개 있어요. 그래도 낼까요?' : (mode === 'retry' ? '재풀이를 낼까요? 내면 정답과 해설이 열려요.' : '제출할까요?');
        if (mode === 'first') msg += '\n처음 낸 답으로 점수가 매겨지고, 낸 뒤에는 바꿀 수 없어요.';
        return msg;
      },
      submit: async function (answers, confusedKeys) {
        var nv = mode === 'retry' ? await call('student.submitRetry', { id: v.id, answers: answers })
          : await call('student.submitFirst', { id: v.id, answers: answers, confused: confusedKeys.map(Number) });
        UI.toast(mode === 'retry' ? '정답과 해설이 열렸어요.' : '제출했어요!');
        onDone(nv);
      }
    });
  }
  // OMR처럼 한 문항씩: 객관식은 고르면 자동으로 다음, 단답·서술은 "다음"(Enter). 마지막엔 답안 확인 → 제출
  // cfg: { items:[{key, short, label, sub?, type, pick, hasQ, img()}], confused, submitLabel, confirmMsg(left), submit(answers, confusedKeys) }
  // 보기 방식: one = 한 문제씩(사진 보임), sheet = 한 화면 빠른 입력(사진 숨김, 필요한 문제만 펼쳐 봄)
  function getSolveMode() { try { return localStorage.getItem('msl_solve_mode') === 'sheet' ? 'sheet' : 'one'; } catch (e) { return 'one'; } }
  function setSolveMode(m) { try { localStorage.setItem('msl_solve_mode', m); } catch (e) { } }
  function omr(cfg) {
    var qs = cfg.items;
    var answers = {}, confused = {}, idx = 0, imgs = {}, timer = null;
    var anyQ = qs.some(function (q) { return q.hasQ; });
    var mode = cfg.forceShow ? 'one' : getSolveMode();
    var wrap = h('div', { class: 'sec', style: 'gap:12px' });
    var seg = h('div', { class: 'seg solve-seg', role: 'tablist', 'aria-label': '보기 방식' });
    function drawSeg() {
      seg.innerHTML = '';
      [['one', anyQ ? '한 문제씩 · 사진 보기' : '한 문제씩'], ['sheet', anyQ ? '한 화면 입력 · 사진 숨김' : '한 화면 빠른 입력']].forEach(function (o) {
        seg.appendChild(h('button', { type: 'button', role: 'tab', class: mode === o[0] ? 'on' : '', 'aria-selected': mode === o[0] ? 'true' : 'false', onclick: function () {
          if (mode === o[0]) return;
          mode = o[0]; if (!cfg.forceShow) setSolveMode(mode);
          drawSeg(); go(mode === 'one' ? Math.min(idx, qs.length - 1) : idx);
        } }, o[1]));
      });
    }
    drawSeg();
    var strip = h('div', { class: 'strip', role: 'tablist', 'aria-label': '문항 번호' });
    var stage = h('div', { class: 'sec', style: 'gap:12px' });
    wrap.appendChild(seg); wrap.appendChild(strip); wrap.appendChild(stage);
    function has(q) { return answers[q.key] != null && String(answers[q.key]).trim() !== ''; }
    function answered() { return qs.filter(has).length; }
    function img(q) { if (!imgs[q.key]) imgs[q.key] = q.img(); return imgs[q.key]; }
    function go(i) {
      clearTimeout(timer);
      idx = Math.max(0, Math.min(qs.length, i));
      draw();
      var cur = strip.querySelector('.cur');
      if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
    function drawStrip() {
      strip.innerHTML = '';
      qs.forEach(function (q, i) {
        strip.appendChild(h('button', { type: 'button', role: 'tab', class: (has(q) ? 'done ' : '') + (i === idx ? 'cur' : ''), 'aria-selected': i === idx ? 'true' : 'false',
          'aria-label': q.label + (has(q) ? ' 답함' : ''), text: q.short, onclick: function () { go(i); } }));
      });
      strip.appendChild(h('button', { type: 'button', role: 'tab', class: 'check-tab' + (idx === qs.length ? ' cur' : ''), 'aria-selected': idx === qs.length ? 'true' : 'false', onclick: function () { go(qs.length); } }, '확인'));
    }
    function draw() {
      stage.innerHTML = '';
      strip.style.display = mode === 'sheet' ? 'none' : '';
      if (mode === 'sheet') return drawSheet();
      drawStrip();
      if (idx === qs.length) return drawReview();
      var q = qs[idx], pick = q.pick || 1;
      var typeLabel = q.type === 'mcq' ? '객관식' + (pick > 1 ? ' · ' + pick + '개 고르기' : '') : q.type === 'short' ? '단답형' : '서술형';
      var head = h('div', { class: 'q-h' }, h('div', { class: 'inline' }, h('span', { class: 'q-no', text: q.label }), h('span', { class: 'small muted', text: (idx + 1) + ' / ' + qs.length }), h('span', { class: 'chip', text: typeLabel })));
      if (cfg.confused) {
        var cbtn = h('button', { class: 'confused' + (confused[q.key] ? ' on' : ''), type: 'button', 'aria-pressed': confused[q.key] ? 'true' : 'false', onclick: function () {
          confused[q.key] = !confused[q.key]; cbtn.classList.toggle('on', confused[q.key]); cbtn.setAttribute('aria-pressed', confused[q.key] ? 'true' : 'false');
        } }, '헷갈려요');
        head.appendChild(cbtn);
      }
      var card = h('section', { class: 'card q', 'aria-label': q.label }, head, q.sub ? h('p', { class: 'small muted', text: q.sub }) : null);
      if (q.hasQ) {
        var box = h('div', { class: 'qimg' }, h('div', { class: 'loading', style: 'padding:18px 0' }, h('div', { class: 'spin' })));
        img(q).then(function (url) { box.innerHTML = ''; if (url) box.appendChild(h('img', { src: url, alt: q.label + ' 문제' })); },
          function () { delete imgs[q.key]; box.innerHTML = ''; box.appendChild(h('p', { class: 'small muted', style: 'padding:12px', text: '문제 사진을 못 불러왔어요. 번호를 다시 눌러 보세요.' })); });
        card.appendChild(box);
      }
      var isLast = idx === qs.length - 1;
      var next = h('button', { class: 'btn primary', type: 'button', onclick: function () { go(idx + 1); } }, isLast ? '답안 확인' : '다음', icon('right', 16));
      if (q.type === 'mcq') {
        var sel = String(answers[q.key] || '').split('').filter(Boolean).map(Number);
        var btns = [1, 2, 3, 4, 5].map(function (n) {
          return h('button', { type: 'button', class: sel.indexOf(n) !== -1 ? 'on' : '', 'aria-pressed': sel.indexOf(n) !== -1 ? 'true' : 'false', 'aria-label': q.label + ' ' + n, text: String(n), onclick: function () { choose(n); } });
        });
        var choose = function (n) {
          var k = sel.indexOf(n);
          if (k !== -1) sel.splice(k, 1); else { if (sel.length >= pick) sel.shift(); sel.push(n); }
          btns.forEach(function (b, j) { var on = sel.indexOf(j + 1) !== -1; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
          if (sel.length) answers[q.key] = sel.slice().sort().join(''); else delete answers[q.key];
          drawStrip();
          clearTimeout(timer);
          if (sel.length === pick) timer = setTimeout(function () { go(idx + 1); }, 220);
        };
        card._choose = choose;
        card.appendChild(h('div', { class: 'pad big', role: 'group', 'aria-label': q.label + ' 답' }, btns));
        if (pick > 1) card.appendChild(h('p', { class: 'small muted', style: 'text-align:center', text: pick + '개를 모두 고르면 다음 문항으로 넘어가요.' }));
      } else if (q.type === 'short') {
        var inp = h('input', { class: 'input', 'aria-label': q.label + ' 답', placeholder: '답 입력 후 Enter', autocomplete: 'off', enterkeyhint: 'next', value: answers[q.key] || '',
          oninput: function (e) { answers[q.key] = e.target.value; drawStrip(); },
          onkeydown: function (e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); go(idx + 1); } } });
        card.appendChild(inp);
        setTimeout(function () { inp.focus(); }, 30);
      } else {
        card.appendChild(h('textarea', { class: 'input', 'aria-label': q.label + ' 답', placeholder: '답을 써 주세요', text: answers[q.key] || '',
          oninput: function (e) { answers[q.key] = e.target.value; drawStrip(); } }));
      }
      stage.appendChild(card);
      stage.appendChild(h('div', { class: 'submitbar' },
        h('button', { class: 'btn', type: 'button', disabled: idx === 0, onclick: function () { go(idx - 1); } }, icon('left', 16), '이전'),
        h('span', { class: 'small muted', text: answered() + ' / ' + qs.length + ' 답함' }), next));
      var nq = qs[idx + 1];
      if (nq && nq.hasQ) img(nq); // 다음 문항 사진 미리 받아 두기
    }
    function submitButton() {
      var btn = h('button', { class: 'btn primary', type: 'button' }, cfg.submitLabel);
      btn.addEventListener('click', async function () {
        if (!(await UI.confirm(cfg.confirmMsg(qs.length - answered()), '내기'))) return;
        UI.busy(btn, async function () {
          await cfg.submit(answers, Object.keys(confused).filter(function (k) { return confused[k]; }));
        }).catch(function () { });
      });
      return btn;
    }
    // 한 화면 빠른 입력: 번호마다 한 줄. 사진은 '문제' 버튼을 눌렀을 때만 불러옴
    function drawSheet() {
      var count = h('span', { class: 'small muted' });
      function drawCount() { count.textContent = answered() + ' / ' + qs.length + ' 답함'; }
      var rows = [];
      var list = h('div', { class: 'card sheet' }, qs.map(function (q, i) {
        var pick = q.pick || 1;
        var row = h('div', { class: 'srow' + (has(q) ? ' done' : '') });
        function mark() { row.classList.toggle('done', has(q)); drawCount(); }
        function focusNext() { var nx = rows[i + 1]; if (nx && nx._focus) nx._focus(); }
        var ctl;
        if (q.type === 'mcq') {
          var sel = String(answers[q.key] || '').split('').filter(Boolean).map(Number);
          var btns = [1, 2, 3, 4, 5].map(function (n) {
            return h('button', { type: 'button', class: sel.indexOf(n) !== -1 ? 'on' : '', 'aria-pressed': sel.indexOf(n) !== -1 ? 'true' : 'false', 'aria-label': q.label + ' ' + n, text: String(n), onclick: function () {
              var k = sel.indexOf(n);
              if (k !== -1) sel.splice(k, 1); else { if (sel.length >= pick) sel.shift(); sel.push(n); }
              btns.forEach(function (b, j) { var on = sel.indexOf(j + 1) !== -1; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
              if (sel.length) answers[q.key] = sel.slice().sort().join(''); else delete answers[q.key];
              mark();
            } });
          });
          ctl = h('div', { class: 'pad mini', role: 'group', 'aria-label': q.label + ' 답' + (pick > 1 ? ' (' + pick + '개)' : '') }, btns);
        } else if (q.type === 'short') {
          ctl = h('input', { class: 'input sm', 'aria-label': q.label + ' 답', placeholder: '답', autocomplete: 'off', enterkeyhint: 'next', value: answers[q.key] || '',
            oninput: function (e) { answers[q.key] = e.target.value; mark(); },
            onkeydown: function (e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); focusNext(); } } });
          row._focus = function () { ctl.focus(); };
        } else {
          ctl = h('textarea', { class: 'input sm', rows: 2, 'aria-label': q.label + ' 답', placeholder: '서술형 답', text: answers[q.key] || '',
            oninput: function (e) { answers[q.key] = e.target.value; mark(); } });
          row._focus = function () { ctl.focus(); };
        }
        var tools = h('div', { class: 'stools' });
        var peek = null;
        if (q.hasQ) {
          var pb = h('button', { class: 'peek', type: 'button', 'aria-expanded': 'false' }, icon('image', 14), '문제');
          pb.addEventListener('click', function () {
            if (peek) { peek.remove(); peek = null; pb.setAttribute('aria-expanded', 'false'); pb.classList.remove('on'); return; }
            peek = h('div', { class: 'qimg speek' }, h('div', { class: 'loading', style: 'padding:14px 0' }, h('div', { class: 'spin' })));
            var box = peek;
            img(q).then(function (url) { box.innerHTML = ''; if (url) box.appendChild(h('img', { src: url, alt: q.label + ' 문제' })); else box.appendChild(h('p', { class: 'small muted', style: 'padding:10px', text: '문제 사진이 없어요.' })); },
              function () { delete imgs[q.key]; box.innerHTML = ''; box.appendChild(h('p', { class: 'small muted', style: 'padding:10px', text: '못 불러왔어요. 다시 눌러 보세요.' })); });
            row.appendChild(peek); pb.setAttribute('aria-expanded', 'true'); pb.classList.add('on');
          });
          tools.appendChild(pb);
        }
        if (cfg.confused) {
          var cb = h('button', { class: 'peek q' + (confused[q.key] ? ' on' : ''), type: 'button', 'aria-label': q.label + ' 헷갈려요', 'aria-pressed': confused[q.key] ? 'true' : 'false', text: '?', onclick: function () {
            confused[q.key] = !confused[q.key]; cb.classList.toggle('on', confused[q.key]); cb.setAttribute('aria-pressed', confused[q.key] ? 'true' : 'false');
          } });
          tools.appendChild(cb);
        }
        row.appendChild(h('div', { class: 'sline' }, h('span', { class: 'sno', text: q.short }), ctl, tools));
        if (q.sub) row.insertBefore(h('div', { class: 'tiny muted', style: 'padding-left:40px', text: q.sub }), row.firstChild);
        rows.push(row);
        return row;
      }));
      drawCount();
      if (anyQ || cfg.confused) stage.appendChild(h('p', { class: 'tiny muted', text: (anyQ ? '문제 사진이 필요하면 번호 옆 "문제"를 눌러 펼쳐 봐요. ' : '') + (cfg.confused ? '"?"는 헷갈린 문제 표시예요.' : '') }));
      stage.appendChild(list);
      stage.appendChild(h('div', { class: 'submitbar' }, count, submitButton()));
    }
    function drawReview() {
      var left = qs.length - answered();
      stage.appendChild(h('section', { class: 'card sec', style: 'gap:12px' },
        h('div', null, h('h2', { text: '답안 확인' }), h('p', { class: 'small muted', style: 'margin-top:2px', text: left ? '안 푼 문항이 ' + left + '개 있어요. 눌러서 풀 수 있어요.' : '모두 풀었어요. 고칠 문항은 눌러서 고쳐요.' })),
        h('div', { class: 'review' }, qs.map(function (q, i) {
          var a = has(q) ? (q.type === 'mcq' ? fmtAns('mcq', answers[q.key]) : String(answers[q.key]).trim()) : '안 품';
          return h('button', { type: 'button', class: has(q) ? '' : 'miss', onclick: function () { go(i); } },
            h('span', { class: 'n', text: q.label + (confused[q.key] ? ' ?' : '') }), h('span', { class: 'a', text: a }));
        }))));
      var btn = submitButton();
      stage.appendChild(h('div', { class: 'submitbar' },
        h('button', { class: 'btn', type: 'button', onclick: function () { go(qs.length - 1); } }, icon('left', 16), '이전'),
        h('span', { class: 'small muted', text: answered() + ' / ' + qs.length + ' 답함' }), btn));
    }
    // PC 키보드: 1~5 고르기, ←→ 문항 이동
    S.keyHandler = function (e) {
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (document.querySelector('.dim')) return;
      if (mode === 'sheet') return;
      var c = stage.querySelector('.q');
      if (/^[1-5]$/.test(e.key) && c && c._choose) { e.preventDefault(); c._choose(Number(e.key)); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(idx + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(idx - 1); }
    };
    document.addEventListener('keydown', S.keyHandler);
    draw();
    return wrap;
  }
  // 정답·해설 목록 (숙제 공개 후 / 테스트 결과)
  function revealList(items, ctx) {
    var wrap = h('section', { class: 'sec' }, h('div', { class: 'sec-h', text: '정답과 해설' }));
    items.forEach(function (it) {
      var kv = h('div', { class: 'kv' },
        h('span', null, '내 답 ', h('b', { text: fmtAns(it.type, it.first) })),
        it.retry ? h('span', null, '재풀이 ', h('b', { text: fmtAns(it.type, it.retry) + (it.retryCorrect ? ' ✓' : it.retryCorrect === false ? ' ✗' : '') })) : null,
        it.answer ? h('span', null, '정답 ', h('b', { style: 'color:var(--mint-ink)', text: fmtAns(it.type, it.answer) })) : null,
        it.essayScore != null && it.type === 'essay' ? h('span', null, '점수 ', h('b', { text: it.essayScore + ' / ' + it.points })) : null);
      var extra = h('div', { class: 'sec' });
      var btns = h('div', { class: 'btns' });
      if (it.hasQ && ctx.src === 'hw') btns.appendChild(imgButton('문제 보기', function () { return call('student.questionImage', { id: ctx.id, no: it.no }); }, extra, it.result === 'X'));
      if (it.hasImage) btns.appendChild(imgButton('해설 그림 보기', function () {
        return ctx.src === 'test' ? call('student.testImage', { id: ctx.id, no: it.no }) : call('student.explanationImage', { id: ctx.id, no: it.no });
      }, extra));
      btns.appendChild(askButton(ctx.src, ctx.id, it.no));
      wrap.appendChild(h('div', { class: 'card res' },
        h('div', { class: 'mark ' + it.result, 'aria-label': it.result === 'O' ? '맞음' : it.result === 'X' ? '틀림' : '채점 중', text: it.result === 'O' ? '○' : it.result === 'X' ? '✕' : '…' }),
        h('div', { class: 'sec', style: 'gap:6px' },
          h('div', { class: 'inline' }, h('b', { text: it.no + '번' }), h('span', { class: 'small muted', text: it.area }),
            it.confused ? h('span', { class: 'chip lav', text: '헷갈림' }) : null, it.manual ? h('span', { class: 'chip', text: '선생님 채점' }) : null),
          kv, it.expText ? h('div', { class: 'exp', text: it.expText }) : null,
          btns.childNodes.length ? btns : null, extra)));
    });
    return wrap;
  }
  // open: 처음부터 펼쳐 둠 (틀린 문제의 문제 사진). 화면에 보일 때 불러옴
  function imgButton(label, fetcher, target, open) {
    var shown = null;
    var b = h('button', { class: 'btn small', type: 'button' }, icon('image', 16), label);
    function setLabel() { b.lastChild.textContent = shown ? label.replace('보기', '접기') : label; }
    if (open) { shown = qImage(fetcher); target.appendChild(shown); setTimeout(setLabel, 0); }
    b.addEventListener('click', function () {
      if (shown) { shown.remove(); shown = null; setLabel(); return; }
      UI.busy(b, async function () {
        var url = await fetcher();
        if (!url) { UI.toast('그림이 없어요.'); return; }
        shown = h('div', { class: 'qimg' }, h('img', { src: url, alt: label }));
        target.appendChild(shown);
      }).then(setLabel, function () { });
    });
    return b;
  }
  function areaCard(areas, title) {
    return h('section', { class: 'card sec', style: 'gap:10px' }, h('h3', { text: title }),
      areas.map(function (a) {
        var p = a.total ? Math.round(a.correct / a.total * 100) : 0;
        return h('div', { class: 'area-row' }, h('span', { text: a.area }),
          h('div', { class: 'bar mint' }, h('i', { style: 'width:' + p + '%' })), h('span', { class: 'pct', text: p + '%' }));
      }));
  }

  // ===================== 자료실 =====================
  // ===================== 영상 플레이어: 진도 기록 + 이름 워터마크 =====================
  var YT_READY = null;
  function loadYT() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (YT_READY) return YT_READY;
    YT_READY = new Promise(function (res, rej) {
      var prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function () { if (prev) try { prev(); } catch (e) { } res(); };
      var sc = document.createElement('script'); sc.src = 'https://www.youtube.com/iframe_api'; sc.async = true;
      sc.onerror = function () { YT_READY = null; rej(new Error('yt')); };
      document.head.appendChild(sc);
      setTimeout(function () { rej(new Error('yt-timeout')); }, 15000);
    });
    return YT_READY;
  }
  function mmss(t) { t = Math.max(0, Math.round(t)); var hh = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return (hh ? hh + ':' + ('0' + m).slice(-2) : m) + ':' + ('0' + s).slice(-2); }
  var STEP = 5;
  function hexToCells(hex) { var c = []; String(hex || '').split('').forEach(function (ch) { var v = parseInt(ch, 16) || 0; for (var b = 0; b < 4; b++) c.push(v & (8 >> b) ? 1 : 0); }); return c; }
  function cellsToHex(c) { var out = ''; for (var i = 0; i < c.length; i += 4) out += (((c[i] ? 8 : 0) | (c[i + 1] ? 4 : 0) | (c[i + 2] ? 2 : 0) | (c[i + 3] ? 1 : 0))).toString(16); return out; }
  function videoPlayer(u, v, wm, onPct, box) {
    var timers = [], closed = false;
    var frame = h('div', { class: 'frame wmframe' });
    var host = h('div', { class: 'ythost' });
    frame.appendChild(host);
    // 워터마크: 이름 · 학교, 18초마다 자리 옮김
    var mark = h('div', { class: 'wm', 'aria-hidden': 'true', text: wm || '' });
    frame.appendChild(mark);
    function moveMark() {
      mark.style.opacity = '0';
      setTimeout(function () { mark.style.left = (12 + Math.random() * 64) + '%'; mark.style.top = (12 + Math.random() * 62) + '%'; mark.style.opacity = ''; }, 600);
    }
    if (wm) { mark.style.left = '50%'; mark.style.top = '30%'; timers.push(setInterval(moveMark, 18000)); }
    var exitBtn = h('button', { class: 'fs-exit', type: 'button', 'aria-label': '전체 화면 닫기' }, '닫기');
    frame.appendChild(exitBtn);
    var status = h('span', { class: 'tiny muted', style: 'flex:1' });
    var fsBtn = h('button', { class: 'btn small', type: 'button' }, '전체 화면');
    var el = h('div', null, frame, h('div', { class: 'inline', style: 'margin-top:6px;gap:8px' }, status, fsBtn));
    function isFs() { return document.fullscreenElement === frame || document.webkitFullscreenElement === frame || frame.classList.contains('pseudo-fs'); }
    function enterFs() {
      var rq = frame.requestFullscreen || frame.webkitRequestFullscreen;
      if (rq) { try { var r = rq.call(frame); if (r && r.catch) r.catch(function () { frame.classList.add('pseudo-fs'); }); return; } catch (e) { } }
      frame.classList.add('pseudo-fs'); document.body.classList.add('noscroll');
    }
    function exitFs() {
      if (frame.classList.contains('pseudo-fs')) { frame.classList.remove('pseudo-fs'); document.body.classList.remove('noscroll'); return; }
      var ex = document.exitFullscreen || document.webkitExitFullscreen; if (ex) try { ex.call(document); } catch (e) { }
    }
    fsBtn.addEventListener('click', function () { isFs() ? exitFs() : enterFs(); });
    exitBtn.addEventListener('click', exitFs);
    if (box) box._busy = (box._busy || 0) + 1;

    var api = { el: el, close: close };
    window.addEventListener('hashchange', function once() { window.removeEventListener('hashchange', once); close(); });
    if (v.kind !== 'youtube' || !v.yt) {
      host.appendChild(h('iframe', { src: v.embed, title: u.title + ' ' + (v.label || '영상'), allow: 'autoplay; encrypted-media; picture-in-picture' }));
      status.textContent = '이 영상은 시청 진도가 기록되지 않아요.';
      return api;
    }
    // 유튜브: 실제로 재생된 5초 칸만 채움
    var w = v.watch || {}, cells = hexToCells(w.bits), dur = w.dur || 0, sent = 0, playSec = 0, lastT = null, dirty = false, yp = null;
    var resume = w.pos && w.pct < 95 && (!dur || w.pos < dur - 10) ? Math.floor(w.pos) : 0;
    function pctNow() { var n = Math.max(1, Math.ceil(dur / STEP)), on = 0; for (var i = 0; i < n; i++) if (cells[i]) on++; return Math.min(100, Math.round(on / n * 100)); }
    function drawStatus() { if (dur) status.textContent = '시청 ' + pctNow() + '% · ' + mmss(dur) + ' 영상' + (resume ? ' · ' + mmss(resume) + '부터 이어 봐요' : ''); }
    function flush(final) {
      if (!dirty || !dur || !yp) return;
      var pos = 0; try { pos = yp.getCurrentTime(); } catch (e) { }
      var data = { unitId: u.id, videoId: v.id, dur: dur, bits: cellsToHex(cells), pos: pos, sec: playSec - sent };
      sent = playSec; dirty = false;
      if (final) { API.beacon('student.watch', data, ROLE); onPct(pctNow()); return; }
      call('student.watch', data).then(function (r) { if (r && r.pct != null) onPct(r.pct); }, function () { dirty = true; });
    }
    function tick() {
      if (!yp || !yp.getPlayerState || yp.getPlayerState() !== 1) { lastT = null; return; }
      var t = 0; try { t = yp.getCurrentTime(); } catch (e) { return; }
      if (!dur) { try { dur = yp.getDuration() || 0; } catch (e) { } }
      if (lastT != null && t >= lastT && t - lastT <= 3) { for (var x = Math.floor(lastT / STEP); x <= Math.floor(t / STEP); x++) cells[x] = 1; }
      else cells[Math.floor(t / STEP)] = 1;
      lastT = t; playSec++; dirty = true;
      drawStatus();
    }
    function onHide() { if (document.visibilityState === 'hidden') flush(true); }
    function onPageHide() { flush(true); }
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    status.textContent = '영상 불러오는 중…';
    loadYT().then(function () {
      if (closed) return;
      var pv = { rel: 0, modestbranding: 1, playsinline: 1, fs: 0 };
      if (resume) pv.start = resume;
      yp = new YT.Player(host, {
        videoId: v.yt, width: '100%', height: '100%', playerVars: pv,
        events: {
          onReady: function () { try { dur = yp.getDuration() || dur; } catch (e) { } drawStatus(); },
          onStateChange: function (e) { if (e.data === 1) { try { dur = yp.getDuration() || dur; } catch (x) { } } if (e.data === 2 || e.data === 0) flush(false); if (e.data === 0) resume = 0; },
          onError: function () { status.textContent = '영상을 재생할 수 없어요. 선생님께 말해 주세요.'; }
        }
      });
      timers.push(setInterval(tick, 1000));
      timers.push(setInterval(function () { flush(false); }, 30000));
    }, function () {
      if (closed) return;
      host.appendChild(h('iframe', { src: v.embed + '&fs=0&playsinline=1', title: u.title + ' ' + (v.label || '영상'), allow: 'autoplay; encrypted-media; picture-in-picture' }));
      status.textContent = '진도 기록 없이 재생 중이에요.';
    });
    function close() {
      if (closed) return; closed = true;
      flush(true);
      timers.forEach(clearInterval);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      if (isFs()) exitFs();
      try { if (yp && yp.destroy) yp.destroy(); } catch (e) { }
      el.remove();
      if (box) box._busy = Math.max(0, (box._busy || 1) - 1);
    }
    return api;
  }
  function viewUnits() {
    var box = h('div', { class: 'sec', style: 'gap:16px' });
    page('units', box);
    box.appendChild(h('h1', { text: '자료실' }));
    var inner = h('div', { class: 'grid2', style: 'align-items:start' });
    box.appendChild(inner);
    live(inner, [['student.units', {}]], function (r) {
      var d = r[0];
      if (!d.list.length) {
        inner.appendChild(h('div', { class: 'card empty', text: d.closed ? '종강하고 1주가 지나서 영상·자료가 닫혔어요.' : d.upcoming ? '아직 열린 수업이 없어요. 날짜가 되면 여기에 열려요.' : '지금 볼 수 있는 영상·자료가 없어요. 선생님이 열어 준 영상·자료가 여기에 보여요.' }));
        return;
      }
      d.list.forEach(function (u) { inner.appendChild(unitCard(u, d.wm || (S.who ? S.who[1] : ''), inner)); });
      if (d.upcoming) inner.appendChild(h('p', { class: 'small muted', style: 'grid-column:1/-1', text: '다음 수업 ' + d.upcoming + '개는 날짜가 되면 열려요.' }));
    });
  }
  function unitCard(u, wm, box) {
    var card = h('section', { class: 'card unit' },
      h('div', null, h('h2', { text: u.title }), h('p', { class: 'small muted', text: UI.fmtDate(u.from) + '부터' + (u.to ? ' ' + UI.fmtDate(u.to) + '까지' : '') })),
      u.memo ? h('p', { class: 'small', style: 'white-space:pre-wrap', text: u.memo }) : null);
    u.videos.forEach(function (v) {
      var player = null;
      var pctEl = h('span', { class: 'tiny' });
      function showPct(p) { pctEl.textContent = p == null ? '보기' : p >= 90 ? '다 봤어요 ' + p + '%' : '시청 ' + p + '%'; pctEl.classList.toggle('done', p != null && p >= 90); }
      showPct(v.watch ? v.watch.pct : null);
      var vb = h('button', { class: 'vid-btn', type: 'button', 'aria-expanded': 'false' }, icon('play', 20), h('span', { style: 'flex:1', text: v.label || '영상' }), pctEl);
      var holder = h('div', { class: 'vid' }, vb);
      vb.addEventListener('click', function () {
        if (player) { player.close(); player = null; vb.setAttribute('aria-expanded', 'false'); return; }
        call('student.viewVideo', { unitId: u.id, videoId: v.id }).catch(function () { });
        player = videoPlayer(u, v, wm, showPct, box);
        holder.appendChild(player.el);
        vb.setAttribute('aria-expanded', 'true');
      });
      card.appendChild(holder);
    });
    u.files.forEach(function (f) {
      var gotEl = h('span', { class: 'tiny muted', text: f.got ? '받음 ' + UI.fmtDate(f.got.slice(0, 10)) : UI.size(f.size) });
      var b = h('button', { class: 'btn small', type: 'button' }, icon('down', 16), f.got ? '다시 받기' : '받기');
      b.addEventListener('click', function () {
        UI.busy(b, async function () {
          b.textContent = '받는 중…';
          var r = await call('student.download', { unitId: u.id, fileId: f.id });
          if (r.stamp) b.textContent = '이름 찍는 중…';
          var stamped = await Stamp.saveDownload(r);
          UI.toast(stamped ? '받았어요. 다운로드 폴더를 확인하세요.' : '받았어요.');
          gotEl.textContent = '받음 ' + UI.fmtDate(UI.todayStr());
        }).catch(function () { });
      });
      card.appendChild(h('div', { class: 'file' }, h('div', { class: 'ic' }, icon('file', 18)),
        h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 'nm', text: f.fileName }), gotEl), b));
    });
    return card;
  }

  // ===================== 내 기록 =====================
  function viewMe() {
    var box = h('div', { class: 'sec', style: 'gap:16px' });
    page('me', box);
    box.appendChild(h('h1', { text: '내 기록' }));
    var inner = h('div');
    box.appendChild(inner);
    live(inner, [['student.records', {}], ['student.me', {}], ['student.exams', {}]], function (r) {
      var rec = r[0], me = r[1], exams = r[2];
      saveWho(me);
      var colA = h('div', { class: 'col-a' });
      var colB = h('div', { class: 'col-b' });
      // 숙제
      colA.appendChild(h('a', { class: 'row tint lav', href: '#/wrong', style: 'border:0' },
        h('div', null, h('div', { class: 't', text: '오답 모음' }), h('div', { class: 's', text: '틀린 문항만 모아서 다시 보기' })), icon('right', 18)));
      colA.appendChild(h('a', { class: 'row', href: '#/questions' },
        h('div', null, h('div', { class: 't', text: '내 질문' }), h('div', { class: 's', text: '선생님께 한 질문과 답변' })), icon('right', 18)));
      colA.appendChild(h('section', { class: 'sec' }, h('div', { class: 'sec-h', text: '숙제 점수' }),
        rec.homework.length ? h('div', { class: 'card tight list' }, rec.homework.map(function (x) {
          return h('a', { class: 'li', href: '#/hw/' + encodeURIComponent(x.id) },
            h('div', null, h('div', { class: 'bold', text: x.title }),
              h('div', { class: 'small muted', text: UI.fmtDate(x.date) + (x.wrongNos.length ? ' · 틀린 문항 ' + x.wrongNos.join(', ') + '번' : ' · 다 맞음') + (x.late ? ' · 늦게 냄' : '') })),
            h('span', { class: 'chip ' + (x.pending ? 'butter' : 'mint'), text: x.pending ? '채점 중' : x.score + '/' + x.max }));
        })) : h('div', { class: 'card empty', text: '아직 낸 숙제가 없어요.' })));
      colA.appendChild(h('section', { class: 'sec' }, h('div', { class: 'sec-h', text: '수업 테스트' }),
        rec.tests.length ? h('div', { class: 'card tight list' }, rec.tests.map(function (x) {
          return h('a', { class: 'li', href: '#/test/' + encodeURIComponent(x.id) },
            h('div', null, h('div', { class: 'bold', text: x.title }), h('div', { class: 'small muted', text: UI.fmtDate(x.date) })),
            h('span', { class: 'chip ' + (x.absent ? '' : 'navy'), text: x.absent ? '결석' : x.score + '/' + x.max }));
        })) : h('div', { class: 'card empty', text: '아직 테스트 기록이 없어요.' })));
      // 오른쪽: 약한 영역, D-day, 내 정보
      if (rec.areas.length) colB.appendChild(areaCard(rec.areas.slice(0, 6), '영역별 정답률 (낮은 순)'));
      colB.appendChild(examCard(exams));
      colB.appendChild(h('section', { class: 'card sec', style: 'gap:10px' },
        h('div', null, h('h3', { text: me.name }), h('p', { class: 'small muted', text: [me.school, me.academy, me.className].filter(Boolean).join(' · ') })),
        h('div', { class: 'tint butter card', style: 'padding:14px' },
          h('div', { class: 'k', style: 'color:var(--butter-ink)', text: '학부모 코드' }),
          h('div', { style: 'font-size:22px;font-weight:800;letter-spacing:.12em;margin:2px 0', text: me.parentCode.slice(0, 4) + '-' + me.parentCode.slice(4) }),
          h('p', { class: 'small', text: '부모님께 알려 드리세요. 교재 뒤 QR을 찍고 이 코드를 넣으면 숙제·점수 리포트를 볼 수 있어요.' }),
          h('button', { class: 'btn small', type: 'button', style: 'margin-top:8px', onclick: function () {
            var t = me.parentCode;
            (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { UI.toast('코드를 복사했어요.'); }, function () { UI.toast(t); });
          } }, '코드 복사')),
        h('div', { class: 'btns grow' },
          h('a', { class: 'btn', href: '#/pin' }, icon('key', 16), '비밀번호 바꾸기'),
          h('button', { class: 'btn', type: 'button', onclick: logout }, icon('out', 16), '로그아웃')),
        h('div', { class: 'inline small muted' }, '화면 밝기', UI.themeButton())));
      inner.appendChild(h('div', { class: 'cols' }, colA, colB));
    });
  }
  function examCard(exams) {
    var card = h('section', { class: 'card sec', style: 'gap:10px' });
    function draw(list) {
      card.innerHTML = '';
      card.appendChild(h('h3', { text: '시험 D-day' }));
      list.forEach(function (x) {
        var past = UI.daysUntil(x.date) < 0;
        card.appendChild(h('div', { class: 'inline', style: 'justify-content:space-between' },
          h('div', null, h('span', { class: 'bold', text: x.title }), h('span', { class: 'small muted', text: ' · ' + UI.fmtDate(x.date) }),
            h('div', { class: 'tiny muted', text: x.rangeTotal ? '범위 숙제 ' + x.rangeTotal + '개 중 ' + x.rangeDone + '개 끝' : '범위를 고르면 진도가 보여요' })),
          h('div', { class: 'inline' }, h('span', { class: 'chip ' + (past ? '' : 'navy'), text: UI.dday(x.date) }),
            h('button', { class: 'btn small', type: 'button', onclick: function () { rangeSheet(x, draw); } }, '범위'),
            h('button', { class: 'iconbtn', type: 'button', 'aria-label': x.title + ' 지우기', style: 'width:30px;height:30px', onclick: function (e) {
              UI.busy(e.currentTarget, async function () { draw(await call('student.deleteExam', { id: x.id })); }).catch(function () { });
            } }, icon('x', 14)))));
      });
      var t = h('input', { class: 'input sm', placeholder: '예: 2학기 기말', 'aria-label': '시험 이름', maxlength: '30' });
      var d = h('input', { class: 'input sm', type: 'date', 'aria-label': '시험 날짜', style: 'flex:0 1 150px' });
      var b = h('button', { class: 'btn small', type: 'submit' }, '추가');
      card.appendChild(h('form', { class: 'inline', onsubmit: function (e) {
        e.preventDefault();
        UI.busy(b, async function () { draw(await call('student.saveExam', { title: t.value, date: d.value })); UI.toast('홈에 D-day가 떠요.'); }).catch(function () { });
      } }, t, d, b));
    }
    draw(exams);
    return card;
  }

  // ===================== 테스트 결과 =====================
  function viewTest(id) {
    var box = h('div', { class: 'sec', style: 'gap:16px' });
    page('me', box);
    loadInto(box, call('student.test', { id: id }), function (v) {
      box.appendChild(back('#/me', '내 기록', v.title));
      box.appendChild(h('h1', { text: v.title }));
      if (v.absent) { box.appendChild(h('div', { class: 'card empty', text: '이 테스트는 결석으로 기록돼 있어요.' })); return; }
      box.appendChild(scoreCard({ score: v.score, max: v.max }));
      box.appendChild(revealList(v.items, { src: 'test', id: v.id }));
      if (v.areas && v.areas.length) box.appendChild(areaCard(v.areas, '영역별 결과'));
    });
  }

  // ===================== 오답 모음 =====================
  function viewWrong() {
    var box = h('div', { class: 'sec', style: 'gap:16px' });
    page('me', box);
    box.appendChild(back('#/me', '내 기록', '오답 모음'));
    box.appendChild(h('div', null, h('h1', { text: '오답 모음' }), h('p', { class: 'small muted', style: 'margin-top:2px', text: '처음 낸 답이 틀린 문항만 모았어요. "다시 풀기"로 3일 뒤, 7일 뒤에 한 번씩 더 맞히면 완벽으로 바뀌어요.' })));
    var inner = h('div', { class: 'sec', style: 'gap:14px' });
    box.appendChild(inner);
    live(inner, [['student.wrongNotes', {}]], function (r) {
      var items = r[0];
      var filter = 'left';
      var due = items.filter(function (x) { return x.due; }).length;
      inner.appendChild(due ? h('a', { class: 'row tint lav', href: '#/review', style: 'border:0' },
        h('div', null, h('div', { class: 't', text: '오늘 다시 풀 문항 ' + due + '개' }), h('div', { class: 's', text: '맞히면 다음 복습 날짜로 넘어가요' })), icon('right', 18))
        : h('p', { class: 'small muted', text: '오늘 다시 풀 문항은 없어요.' }));
      var seg = h('div', { class: 'seg', role: 'tablist' });
      var list = h('div', { class: 'sec', style: 'gap:14px' });
      var opts = [['left', '못 고친 것'], ['hw', '숙제'], ['test', '테스트'], ['all', '전체']];
      function draw() {
        seg.innerHTML = '';
        opts.forEach(function (o) {
          seg.appendChild(h('button', { type: 'button', role: 'tab', class: filter === o[0] ? 'on' : '', 'aria-selected': filter === o[0] ? 'true' : 'false', onclick: function () { filter = o[0]; draw(); } }, o[1]));
        });
        list.innerHTML = '';
        var shown = items.filter(function (x) { return filter === 'all' || (filter === 'left' ? !x.mastered : x.src === filter); });
        if (!shown.length) { list.appendChild(h('div', { class: 'card empty', text: '여기에 보일 문항이 없어요.' })); return; }
        var groups = [], by = {};
        shown.forEach(function (x) { var k = x.src + '|' + x.id; if (!by[k]) { by[k] = { head: x, items: [] }; groups.push(by[k]); } by[k].items.push(x); });
        groups.forEach(function (g) {
          list.appendChild(h('div', { class: 'sec-h' }, h('span', null, g.head.title + ' · ' + UI.fmtDate(g.head.date)),
            h('span', { class: 'chip ' + (g.head.src === 'test' ? 'navy' : ''), text: g.head.src === 'test' ? '테스트' : '숙제' })));
          g.items.forEach(function (x) { list.appendChild(wrongCard(x)); });
        });
      }
      inner.appendChild(seg);
      inner.appendChild(list);
      draw();
    });
  }
  function wrongCard(x) {
    var extra = h('div', { class: 'sec' });
    var btns = h('div', { class: 'btns' });
    if (x.hasQ) btns.appendChild(imgButton('문제 보기', function () { return call('student.questionImage', { id: x.id, no: x.no }); }, extra));
    if (x.revealed && x.hasImage) btns.appendChild(imgButton('해설 그림 보기', function () {
      return x.src === 'test' ? call('student.testImage', { id: x.id, no: x.no }) : call('student.explanationImage', { id: x.id, no: x.no });
    }, extra));
    return h('div', { class: 'card sec', style: 'gap:8px' },
      h('div', { class: 'inline', style: 'justify-content:space-between' },
        h('div', { class: 'inline' }, h('b', { text: x.no + '번' }), h('span', { class: 'small muted', text: x.area })),
        h('div', { class: 'chips' },
          x.mastered ? h('span', { class: 'chip mint', text: '완벽' }) : x.stage ? h('span', { class: 'chip navy', text: '복습 ' + x.stage + '/3' }) : null,
          x.fixed && !x.mastered ? h('span', { class: 'chip mint', text: '재풀이로 고침' }) : null,
          !x.revealed ? h('span', { class: 'chip butter', text: '정답 공개 전' }) : (!x.fixed && !x.stage ? h('span', { class: 'chip coral', text: '다시 보기' }) : null))),
      h('div', { class: 'kv' },
        h('span', null, '내 답 ', h('b', { text: fmtAns(x.type, x.mine) })),
        x.retry ? h('span', null, '재풀이 ', h('b', { text: fmtAns(x.type, x.retry) })) : null,
        x.revealed && x.answer ? h('span', null, '정답 ', h('b', { style: 'color:var(--mint-ink)', text: fmtAns(x.type, x.answer) })) : null),
      !x.revealed ? h('p', { class: 'small muted' }, '재풀이를 마치면 정답과 해설이 보여요. ', h('a', { href: '#/hw/' + encodeURIComponent(x.id), text: '재풀이 하러 가기' })) : null,
      x.revealed && x.expText ? h('div', { class: 'exp', text: x.expText }) : null,
      x.nextAt && !x.mastered ? h('p', { class: 'tiny muted', text: '다음 복습 ' + UI.fmtDate(x.nextAt) }) : null,
      h('div', { class: 'btns' }, btns.childNodes.length ? btns : null, x.revealed ? askButton(x.src, x.id, x.no) : null), extra);
  }

  // ===================== 시험 범위 고르기 =====================
  function rangeSheet(exam, redraw) {
    var box = h('div', { class: 'sec', style: 'gap:10px' }, UI.loading());
    var sh = UI.sheet(exam.title + ' 범위 숙제', box);
    callC('student.home', {}).then(function (d) {
      box.innerHTML = '';
      var picked = {};
      (exam.range || []).forEach(function (id) { picked[id] = true; });
      var list = d.lectures.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      if (!list.length) { box.appendChild(h('p', { class: 'empty', text: '고를 숙제가 아직 없어요.' })); return; }
      box.appendChild(h('p', { class: 'small muted', text: '시험 범위에 들어가는 숙제를 골라 주세요.' }));
      list.forEach(function (l) {
        box.appendChild(h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!picked[l.id], onchange: function (e) { picked[l.id] = e.target.checked; } }),
          h('span', null, l.title, h('span', { class: 'small muted', text: ' · ' + UI.fmtDate(l.date) + (l.status === 'done' ? ' · 끝' : '') }))));
      });
      var b = h('button', { class: 'btn primary', type: 'button' }, '저장');
      b.addEventListener('click', function () {
        UI.busy(b, async function () {
          var ids = Object.keys(picked).filter(function (k) { return picked[k]; });
          var ex = await call('student.saveExamRange', { id: exam.id, lectureIds: ids });
          sh.close(); redraw(ex); UI.toast('범위를 저장했어요.');
        }).catch(function () { });
      });
      box.appendChild(b);
    }, function (e) { box.innerHTML = ''; box.appendChild(h('p', { class: 'err', text: e.message })); });
  }

  // ===================== 질문하기 =====================
  function askButton(src, id, no) {
    return h('button', { class: 'btn small', type: 'button', onclick: function () {
      var ta = h('textarea', { class: 'input', placeholder: '어디가 이해가 안 되는지 써 주세요', maxlength: '500' });
      var b = h('button', { class: 'btn primary', type: 'submit' }, '질문 보내기');
      var sh = UI.sheet(no + '번 질문하기', h('form', { class: 'form', onsubmit: function (e) {
        e.preventDefault();
        UI.busy(b, async function () { await call('student.ask', { src: src, id: id, no: no, text: ta.value }); sh.close(); UI.toast('질문을 보냈어요. 선생님이 답하면 홈에 떠요.'); }).catch(function () { });
      } }, ta, h('p', { class: 'tiny muted', text: '선생님만 볼 수 있어요.' }), b));
    } }, '질문하기');
  }
  function viewQuestions() {
    var box = h('div', { class: 'sec', style: 'gap:16px' });
    page('me', box);
    box.appendChild(back('#/me', '내 기록', '내 질문'));
    box.appendChild(h('h1', { text: '내 질문' }));
    var inner = h('div', { class: 'sec', style: 'gap:12px' });
    box.appendChild(inner);
    live(inner, [['student.questions', {}]], function (r) {
      var list = r[0];
      if (!list.length) { inner.appendChild(h('div', { class: 'card empty', text: '아직 한 질문이 없어요. 해설 아래 "질문하기"로 물어볼 수 있어요.' })); return; }
      list.forEach(function (q) {
        inner.appendChild(h('article', { class: 'card sec', style: 'gap:8px' },
          h('div', { class: 'inline', style: 'justify-content:space-between' },
            h('a', { href: q.src === 'test' ? '#/test/' + encodeURIComponent(q.refId) : '#/hw/' + encodeURIComponent(q.refId), class: 'bold', style: 'color:inherit', text: q.title + ' · ' + q.no + '번' }),
            q.answer ? h('span', { class: 'chip ' + (q.isNew ? 'coral' : 'mint'), text: q.isNew ? '새 답변' : '답변 완료' }) : h('span', { class: 'chip butter', text: '기다리는 중' })),
          h('p', { class: 'small', style: 'white-space:pre-wrap', text: q.text }),
          q.answer ? h('div', { class: 'exp' }, h('b', { text: '선생님 ' }), q.answer) : null,
          h('p', { class: 'tiny muted', text: UI.fmtDT(q.askedAt) })));
      });
      if (list.some(function (q) { return q.isNew; })) call('student.seenAnswers', {}).catch(function () { });
    });
  }

  // ===================== 오답 다시 풀기 =====================
  function viewReview() {
    var box = h('div', { class: 'sec', style: 'gap:16px' });
    page('me', box);
    box.appendChild(back('#/wrong', '오답 모음', '다시 풀기'));
    var inner = h('div', { class: 'sec', style: 'gap:12px' });
    box.appendChild(inner);
    loadInto(inner, call('student.reviewSet'), function (items) {
      if (!items.length) { inner.appendChild(h('div', { class: 'card empty', text: '오늘 다시 풀 문항이 없어요. 복습 날짜가 되면 여기에 나와요.' })); return; }
      inner.appendChild(h('div', null, h('h1', { text: '오답 다시 풀기' }), h('p', { class: 'small muted', style: 'margin-top:2px', text: items.length + '문항 · 맞히면 3일 뒤, 7일 뒤에 한 번씩 더 나오고, 틀리면 내일 다시 나와요.' })));
      inner.appendChild(omr({
        items: items.map(function (x, i) {
          return { key: x.src + '|' + x.id + '|' + x.no, short: String(i + 1), label: x.no + '번', sub: x.title + ' · ' + x.area + (x.stage ? ' · 복습 ' + x.stage + '/3' : ''),
            type: x.type, pick: x.pick || 1, hasQ: x.hasQ, img: function () { return call('student.questionImage', { id: x.id, no: x.no }); } };
        }),
        confused: false,
        forceShow: true,
        submitLabel: '채점하기',
        confirmMsg: function (left) { return left ? '안 푼 문항이 ' + left + '개 있어요. 그래도 채점할까요?' : '채점할까요?'; },
        submit: async function (answers) {
          var list = items.map(function (x) { return { src: x.src, id: x.id, no: x.no, answer: answers[x.src + '|' + x.id + '|' + x.no] || '' }; });
          var res = await call('student.reviewSubmit', { answers: list });
          API.clearCache(ROLE);
          showReviewResult(inner, res);
        }
      }));
    });
  }
  function showReviewResult(box, res) {
    if (S.keyHandler) { document.removeEventListener('keydown', S.keyHandler); S.keyHandler = null; }
    box.innerHTML = '';
    var ok = res.filter(function (x) { return x.correct; }).length;
    box.appendChild(h('section', { class: 'card tint coral', style: 'padding:18px 20px' }, h('div', { class: 'k', text: '다시 풀기 결과' }),
      h('div', { class: 'big', style: 'margin-top:2px', text: res.length + '문항 중 ' + ok + '개 맞힘' })));
    res.forEach(function (x) {
      var extra = h('div', { class: 'sec' });
      box.appendChild(h('div', { class: 'card res' },
        h('div', { class: 'mark ' + (x.correct ? 'O' : 'X'), text: x.correct ? '○' : '✕' }),
        h('div', { class: 'sec', style: 'gap:6px' },
          h('div', { class: 'inline' }, h('b', { text: x.title + ' ' + x.no + '번' }), h('span', { class: 'small muted', text: x.area }),
            x.stage >= 3 ? h('span', { class: 'chip mint', text: '완벽' }) : h('span', { class: 'chip navy', text: '다음 ' + UI.fmtDate(x.nextAt) })),
          h('div', { class: 'kv' }, h('span', null, '내 답 ', h('b', { text: fmtAns(x.type, x.mine) })), h('span', null, '정답 ', h('b', { style: 'color:var(--mint-ink)', text: fmtAns(x.type, x.answer) }))),
          x.expText ? h('div', { class: 'exp', text: x.expText }) : null,
          h('div', { class: 'btns' },
            x.hasImage ? imgButton('해설 그림 보기', function () { return x.src === 'test' ? call('student.testImage', { id: x.id, no: x.no }) : call('student.explanationImage', { id: x.id, no: x.no }); }, extra) : null,
            askButton(x.src, x.id, x.no)), extra)));
    });
    box.appendChild(h('a', { class: 'btn', href: '#/wrong', style: 'align-self:flex-start' }, '오답 모음으로'));
    window.scrollTo(0, 0);
  }

  // ===================== QR 출석 =====================
  function doCheckin(code) {
    var box = h('div', { class: 'sec', style: 'gap:16px;max-width:440px' });
    page('home', box);
    loadInto(box, call('student.checkin', { code: code }), function (r) {
      var late = r.status === 'L';
      box.appendChild(h('section', { class: 'card tint ' + (late ? 'butter' : 'mint'), style: 'padding:28px 20px;text-align:center' },
        h('div', { style: 'font-size:44px;line-height:1', text: late ? '⏰' : '✓' }),
        h('div', { class: 'big', style: 'margin-top:10px', text: r.already ? '이미 ' + r.label + '했어요' : r.label + ' 완료!' }),
        h('p', { class: 'small', style: 'margin-top:4px', text: UI.fmtDate(r.date) + (late ? ' · 지각 기준 시각이 지나서 지각으로 기록됐어요' : '') })));
      box.appendChild(h('a', { class: 'btn primary', href: '#/' }, '홈으로'));
    });
  }

  // ===================== 공지 =====================
  function viewNotices() {
    var box = h('div', { class: 'sec', style: 'gap:16px' });
    page('home', box);
    box.appendChild(back('#/', '홈', '공지'));
    box.appendChild(h('h1', { text: '공지' }));
    var inner = h('div', { class: 'sec', style: 'gap:12px' });
    box.appendChild(inner);
    live(inner, [['student.notices', {}]], function (r) {
      var list = r[0];
      if (!list.length) { inner.appendChild(h('div', { class: 'card empty', text: '지금 걸린 공지가 없어요.' })); return; }
      list.forEach(function (n) {
        var extra = h('div', { class: 'sec' });
        inner.appendChild(h('article', { class: 'card sec', style: 'gap:8px' },
          h('div', { class: 'inline' }, n.pinned ? h('span', { class: 'chip lav', text: '고정' }) : null, h('h2', { text: n.title })),
          h('p', { class: 'small muted', text: UI.fmtDate(n.from) + (n.to ? ' ~ ' + UI.fmtDate(n.to) : '') }),
          n.body ? h('p', { style: 'white-space:pre-wrap', text: n.body }) : null,
          n.hasImage || n.linkUrl ? h('div', { class: 'btns' },
            n.hasImage ? imgButton('사진 보기', function () { return call('student.noticeImage', { id: n.id }); }, extra) : null,
            n.linkUrl ? h('a', { class: 'btn small', href: n.linkUrl, target: '_blank', rel: 'noopener', text: n.linkLabel || '링크 열기' }) : null) : null,
          extra));
      });
    });
  }

  loadWho();
  route();
})();

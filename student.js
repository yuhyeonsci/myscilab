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
    loadInto(box, call('student.home'), function (d) {
      S.home = d;
      saveWho(d.student);
      if (d.mustChange) { S.mustChange = true; return renderPinChange(true); }
      var who = document.querySelector('.topbar .who');
      if (who) who.replaceWith(h('div', { class: 'who' }, S.who[0], h('br'), h('b', { text: S.who[1] })));
      var todo = d.lectures.filter(function (l) { return l.status !== 'done'; })
        .sort(function (a, b) { return (a.deadline || '9') < (b.deadline || '9') ? -1 : 1; });
      var next = todo.filter(function (l) { return l.deadline; })[0];
      var exam = d.exams[0];
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
          h('div', { class: 'small', style: 'color:var(--navy-ink);margin-top:2px', text: UI.fmtDate(exam.date) }))
          : h('a', { class: 'row', href: '#/me' }, h('div', null, h('div', { class: 't', text: '시험 D-day 넣기' }), h('div', { class: 's', text: '내 시험 날짜를 넣으면 홈에 D-day가 떠요' })), icon('right', 18)),
        d.newUnits.length ? h('section', { class: 'sec' }, h('div', { class: 'sec-h', text: '새로 열린 수업' }),
          d.newUnits.map(function (u) {
            return h('a', { class: 'row tint mint', href: '#/units', style: 'border:0' },
              h('div', null, h('div', { class: 't', text: u.title }), h('div', { class: 's', style: 'color:var(--mint-ink)', text: [u.videos ? '영상 ' + u.videos + '개' : '', u.files ? '자료 ' + u.files + '개' : ''].filter(Boolean).join(' · ') })),
              icon('right', 18));
          })) : null,
        h('a', { class: 'card tint lav', href: '#/wrong', style: 'text-decoration:none;color:inherit' },
          h('div', { class: 'k', text: '내 오답 모음' }), h('div', { style: 'font-weight:800;font-size:17px;margin-top:4px', text: d.wrongCount ? '다시 볼 문항 ' + d.wrongCount + '개' : '틀린 문항이 없어요' })));
      box.appendChild(h('div', { class: 'cols' }, colA, colB));
      if (d.upcoming) box.appendChild(h('p', { class: 'small muted', text: '다음 숙제 ' + d.upcoming + '개는 날짜가 되면 열려요.' }));
    });
  }

  // ===================== 숙제 목록 =====================
  function viewHwList() {
    var box = h('div', { class: 'sec', style: 'gap:16px' });
    page('hw', box);
    box.appendChild(h('h1', { text: '숙제' }));
    var inner = h('div', { class: 'sec', style: 'gap:16px' });
    box.appendChild(inner);
    loadInto(inner, call('student.home'), function (d) {
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
  // OMR처럼 한 문항씩: 객관식은 고르면 자동으로 다음, 단답·서술은 "다음"(Enter). 마지막엔 답안 확인 → 제출
  function solver(v, mode, onDone) {
    var qs = mode === 'retry' ? v.questions.filter(function (q) { return v.wrongNos.indexOf(q.no) !== -1; }) : v.questions;
    var answers = {}, confused = {}, idx = 0, imgs = {}, timer = null;
    var wrap = h('div', { class: 'sec', style: 'gap:12px' });
    var strip = h('div', { class: 'strip', role: 'tablist', 'aria-label': '문항 번호' });
    var stage = h('div', { class: 'sec', style: 'gap:12px' });
    wrap.appendChild(strip); wrap.appendChild(stage);
    function has(q) { return answers[q.no] != null && String(answers[q.no]).trim() !== ''; }
    function answered() { return qs.filter(has).length; }
    function img(q) {
      if (!imgs[q.no]) imgs[q.no] = call('student.questionImage', { id: v.id, no: q.no });
      return imgs[q.no];
    }
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
          'aria-label': q.no + '번' + (has(q) ? ' 답함' : ''), text: String(q.no), onclick: function () { go(i); } }));
      });
      strip.appendChild(h('button', { type: 'button', role: 'tab', class: 'check-tab' + (idx === qs.length ? ' cur' : ''), 'aria-selected': idx === qs.length ? 'true' : 'false', onclick: function () { go(qs.length); } }, '확인'));
    }
    function draw() {
      drawStrip();
      stage.innerHTML = '';
      if (idx === qs.length) return drawReview();
      var q = qs[idx], pick = q.pick || 1;
      var typeLabel = q.type === 'mcq' ? '객관식' + (pick > 1 ? ' · ' + pick + '개 고르기' : '') : q.type === 'short' ? '단답형' : '서술형';
      var head = h('div', { class: 'q-h' }, h('div', { class: 'inline' }, h('span', { class: 'q-no', text: q.no + '번' }), h('span', { class: 'small muted', text: (idx + 1) + ' / ' + qs.length }), h('span', { class: 'chip', text: typeLabel })));
      if (mode === 'first') {
        var cbtn = h('button', { class: 'confused' + (confused[q.no] ? ' on' : ''), type: 'button', 'aria-pressed': confused[q.no] ? 'true' : 'false', onclick: function () {
          confused[q.no] = !confused[q.no]; cbtn.classList.toggle('on', confused[q.no]); cbtn.setAttribute('aria-pressed', confused[q.no] ? 'true' : 'false');
        } }, '헷갈려요');
        head.appendChild(cbtn);
      }
      var card = h('section', { class: 'card q', 'aria-label': q.no + '번' }, head);
      if (q.hasQ) {
        var box = h('div', { class: 'qimg' }, h('div', { class: 'loading', style: 'padding:18px 0' }, h('div', { class: 'spin' })));
        img(q).then(function (url) { box.innerHTML = ''; if (url) box.appendChild(h('img', { src: url, alt: q.no + '번 문제' })); },
          function () { delete imgs[q.no]; box.innerHTML = ''; box.appendChild(h('p', { class: 'small muted', style: 'padding:12px', text: '문제 사진을 못 불러왔어요. 번호를 다시 눌러 보세요.' })); });
        card.appendChild(box);
      }
      var isLast = idx === qs.length - 1;
      var next = h('button', { class: 'btn primary', type: 'button', onclick: function () { go(idx + 1); } }, isLast ? '답안 확인' : '다음', icon('right', 16));
      if (q.type === 'mcq') {
        var sel = String(answers[q.no] || '').split('').filter(Boolean).map(Number);
        var btns = [1, 2, 3, 4, 5].map(function (n) {
          return h('button', { type: 'button', class: sel.indexOf(n) !== -1 ? 'on' : '', 'aria-pressed': sel.indexOf(n) !== -1 ? 'true' : 'false', 'aria-label': q.no + '번 ' + n, text: String(n), onclick: function () { choose(n); } });
        });
        var choose = function (n) {
          var k = sel.indexOf(n);
          if (k !== -1) sel.splice(k, 1); else { if (sel.length >= pick) sel.shift(); sel.push(n); }
          btns.forEach(function (b, j) { var on = sel.indexOf(j + 1) !== -1; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
          if (sel.length) answers[q.no] = sel.slice().sort().join(''); else delete answers[q.no];
          drawStrip();
          clearTimeout(timer);
          if (sel.length === pick) timer = setTimeout(function () { go(idx + 1); }, 220);
        };
        card._choose = choose;
        card.appendChild(h('div', { class: 'pad big', role: 'group', 'aria-label': q.no + '번 답' }, btns));
        if (pick > 1) card.appendChild(h('p', { class: 'small muted', style: 'text-align:center', text: pick + '개를 모두 고르면 다음 문항으로 넘어가요.' }));
      } else if (q.type === 'short') {
        var inp = h('input', { class: 'input', 'aria-label': q.no + '번 답', placeholder: '답 입력 후 Enter', autocomplete: 'off', enterkeyhint: 'next', value: answers[q.no] || '',
          oninput: function (e) { answers[q.no] = e.target.value; drawStrip(); },
          onkeydown: function (e) { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); go(idx + 1); } } });
        card.appendChild(inp);
        setTimeout(function () { inp.focus(); }, 30);
      } else {
        var ta = h('textarea', { class: 'input', 'aria-label': q.no + '번 답', placeholder: '답을 써 주세요', text: answers[q.no] || '',
          oninput: function (e) { answers[q.no] = e.target.value; drawStrip(); } });
        card.appendChild(ta);
      }
      stage.appendChild(card);
      stage.appendChild(h('div', { class: 'submitbar' },
        h('button', { class: 'btn', type: 'button', disabled: idx === 0, onclick: function () { go(idx - 1); } }, icon('left', 16), '이전'),
        h('span', { class: 'small muted', text: answered() + ' / ' + qs.length + ' 답함' }), next));
      // 다음 문항 사진 미리 받아 두기
      var nq = qs[idx + 1];
      if (nq && nq.hasQ) img(nq);
    }
    function drawReview() {
      var left = qs.length - answered();
      stage.appendChild(h('section', { class: 'card sec', style: 'gap:12px' },
        h('div', null, h('h2', { text: '답안 확인' }), h('p', { class: 'small muted', style: 'margin-top:2px', text: left ? '안 푼 문항이 ' + left + '개 있어요. 눌러서 풀 수 있어요.' : '모두 풀었어요. 고칠 문항은 눌러서 고쳐요.' })),
        h('div', { class: 'review' }, qs.map(function (q, i) {
          var a = has(q) ? (q.type === 'mcq' ? fmtAns('mcq', answers[q.no]) : String(answers[q.no]).trim()) : '안 품';
          return h('button', { type: 'button', class: has(q) ? '' : 'miss', onclick: function () { go(i); } },
            h('span', { class: 'n', text: q.no + '번' + (confused[q.no] ? ' ?' : '') }), h('span', { class: 'a', text: a }));
        }))));
      var btn = h('button', { class: 'btn primary', type: 'button' }, mode === 'retry' ? '재풀이 내기' : '제출하기');
      btn.addEventListener('click', async function () {
        var msg = left ? '아직 안 푼 문항이 ' + left + '개 있어요. 그래도 낼까요?' : (mode === 'retry' ? '재풀이를 낼까요? 내면 정답과 해설이 열려요.' : '제출할까요?');
        if (mode === 'first') msg += '\n처음 낸 답으로 점수가 매겨지고, 낸 뒤에는 바꿀 수 없어요.';
        if (!(await UI.confirm(msg, '내기'))) return;
        UI.busy(btn, async function () {
          var conf = Object.keys(confused).filter(function (k) { return confused[k]; }).map(Number);
          var nv = mode === 'retry' ? await call('student.submitRetry', { id: v.id, answers: answers })
            : await call('student.submitFirst', { id: v.id, answers: answers, confused: conf });
          UI.toast(mode === 'retry' ? '정답과 해설이 열렸어요.' : '제출했어요!');
          onDone(nv);
        }).catch(function () { });
      });
      stage.appendChild(h('div', { class: 'submitbar' },
        h('button', { class: 'btn', type: 'button', onclick: function () { go(qs.length - 1); } }, icon('left', 16), '이전'),
        h('span', { class: 'small muted', text: answered() + ' / ' + qs.length + ' 답함' }), btn));
    }
    // PC 키보드: 1~5 고르기, ←→ 문항 이동
    S.keyHandler = function (e) {
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (document.querySelector('.dim')) return;
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
      if (it.hasQ && ctx.src === 'hw') btns.appendChild(imgButton('문제 보기', function () { return call('student.questionImage', { id: ctx.id, no: it.no }); }, extra));
      if (it.hasImage) btns.appendChild(imgButton('해설 그림 보기', function () {
        return ctx.src === 'test' ? call('student.testImage', { id: ctx.id, no: it.no }) : call('student.explanationImage', { id: ctx.id, no: it.no });
      }, extra));
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
  function imgButton(label, fetcher, target) {
    var shown = null;
    var b = h('button', { class: 'btn small', type: 'button' }, icon('image', 16), label);
    b.addEventListener('click', function () {
      if (shown) { shown.remove(); shown = null; return; }
      UI.busy(b, async function () {
        var url = await fetcher();
        if (!url) { UI.toast('그림이 없어요.'); return; }
        shown = h('div', { class: 'qimg' }, h('img', { src: url, alt: label }));
        target.appendChild(shown);
      }).catch(function () { });
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
  function viewUnits() {
    var box = h('div', { class: 'sec', style: 'gap:16px' });
    page('units', box);
    box.appendChild(h('h1', { text: '자료실' }));
    var inner = h('div', { class: 'grid2', style: 'align-items:start' });
    box.appendChild(inner);
    loadInto(inner, call('student.units'), function (d) {
      if (!d.list.length) {
        inner.appendChild(h('div', { class: 'card empty', text: d.upcoming ? '아직 열린 수업이 없어요. 날짜가 되면 여기에 열려요.' : '지금 볼 수 있는 수업 자료가 없어요.' }));
        return;
      }
      d.list.forEach(function (u) { inner.appendChild(unitCard(u)); });
      if (d.upcoming) box.appendChild(h('p', { class: 'small muted', text: '다음 수업 ' + d.upcoming + '개는 날짜가 되면 열려요.' }));
    });
  }
  function unitCard(u) {
    var card = h('section', { class: 'card unit' },
      h('div', null, h('h2', { text: u.title }), h('p', { class: 'small muted', text: UI.fmtDate(u.from) + '부터' + (u.to ? ' ' + UI.fmtDate(u.to) + '까지' : '') })),
      u.memo ? h('p', { class: 'small', style: 'white-space:pre-wrap', text: u.memo }) : null);
    u.videos.forEach(function (v) {
      var frame = null;
      var vb = h('button', { class: 'vid-btn', type: 'button', 'aria-expanded': 'false' }, icon('play', 20), h('span', { style: 'flex:1', text: v.label || '영상' }), h('span', { class: 'tiny', text: '보기' }));
      var holder = h('div', { class: 'vid' }, vb);
      vb.addEventListener('click', function () {
        if (frame) { frame.remove(); frame = null; vb.setAttribute('aria-expanded', 'false'); return; }
        frame = h('div', null, h('div', { class: 'frame' }, h('iframe', { src: v.embed, title: u.title + ' ' + (v.label || '영상'), allow: 'autoplay; encrypted-media; fullscreen; picture-in-picture', allowfullscreen: true })),
          h('a', { href: v.open, target: '_blank', rel: 'noopener', class: 'small', style: 'display:inline-block;margin-top:6px', text: '새 창에서 보기' }));
        holder.appendChild(frame);
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
    loadInto(inner, Promise.all([call('student.records'), call('student.me'), call('student.exams')]), function (r) {
      var rec = r[0], me = r[1], exams = r[2];
      saveWho(me);
      var colA = h('div', { class: 'col-a' });
      var colB = h('div', { class: 'col-b' });
      // 숙제
      colA.appendChild(h('a', { class: 'row tint lav', href: '#/wrong', style: 'border:0' },
        h('div', null, h('div', { class: 't', text: '오답 모음' }), h('div', { class: 's', text: '틀린 문항만 모아서 다시 보기' })), icon('right', 18)));
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
          h('div', null, h('span', { class: 'bold', text: x.title }), h('span', { class: 'small muted', text: ' · ' + UI.fmtDate(x.date) })),
          h('div', { class: 'inline' }, h('span', { class: 'chip ' + (past ? '' : 'navy'), text: UI.dday(x.date) }),
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
    box.appendChild(h('div', null, h('h1', { text: '오답 모음' }), h('p', { class: 'small muted', style: 'margin-top:2px', text: '처음 낸 답이 틀린 문항만 모았어요. 재풀이로 맞힌 것은 "고침"으로 표시돼요.' })));
    var inner = h('div', { class: 'sec', style: 'gap:14px' });
    box.appendChild(inner);
    loadInto(inner, call('student.wrongNotes'), function (items) {
      var filter = 'left';
      var seg = h('div', { class: 'seg', role: 'tablist' });
      var list = h('div', { class: 'sec', style: 'gap:14px' });
      var opts = [['left', '못 고친 것'], ['hw', '숙제'], ['test', '테스트'], ['all', '전체']];
      function draw() {
        seg.innerHTML = '';
        opts.forEach(function (o) {
          seg.appendChild(h('button', { type: 'button', role: 'tab', class: filter === o[0] ? 'on' : '', 'aria-selected': filter === o[0] ? 'true' : 'false', onclick: function () { filter = o[0]; draw(); } }, o[1]));
        });
        list.innerHTML = '';
        var shown = items.filter(function (x) { return filter === 'all' || (filter === 'left' ? !x.fixed : x.src === filter); });
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
        x.fixed ? h('span', { class: 'chip mint', text: '고침' }) : x.revealed ? h('span', { class: 'chip coral', text: '다시 보기' }) : h('span', { class: 'chip butter', text: '정답 공개 전' })),
      h('div', { class: 'kv' },
        h('span', null, '내 답 ', h('b', { text: fmtAns(x.type, x.mine) })),
        x.retry ? h('span', null, '재풀이 ', h('b', { text: fmtAns(x.type, x.retry) })) : null,
        x.revealed && x.answer ? h('span', null, '정답 ', h('b', { style: 'color:var(--mint-ink)', text: fmtAns(x.type, x.answer) })) : null),
      !x.revealed ? h('p', { class: 'small muted' }, '재풀이를 마치면 정답과 해설이 보여요. ', h('a', { href: '#/hw/' + encodeURIComponent(x.id), text: '재풀이 하러 가기' })) : null,
      x.revealed && x.expText ? h('div', { class: 'exp', text: x.expText }) : null,
      btns.childNodes.length ? btns : null, extra);
  }

  // ===================== 공지 =====================
  function viewNotices() {
    var box = h('div', { class: 'sec', style: 'gap:16px' });
    page('home', box);
    box.appendChild(back('#/', '홈', '공지'));
    box.appendChild(h('h1', { text: '공지' }));
    var inner = h('div', { class: 'sec', style: 'gap:12px' });
    box.appendChild(inner);
    loadInto(inner, call('student.notices'), function (list) {
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

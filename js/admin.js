// 강사 화면: 홈(학원 → 반) → 반(학생·숙제·테스트·자료실·공지·리포트) → 학생
(function () {
  var h = UI.h, icon = UI.icon, ROLE = 'admin';
  var S = { classes: null, dash: null };
  var NAV = [
    { href: '#/', label: '홈', icon: 'home', key: 'home' },
    { href: '#/questions', label: '질문함', icon: 'chat', key: 'questions' },
    { href: '#/students', label: '학생 찾기', icon: 'users', key: 'students' },
    { href: '#/settings', label: '설정', icon: 'gear', key: 'settings' }
  ];
  var TABS = [['students', '학생'], ['attend', '출석'], ['hw', '숙제'], ['tests', '테스트'], ['units', '자료실'], ['notices', '공지'], ['report', '리포트']];
  function call(a, d) { return API.call(a, d, ROLE); }
  function logout() { API.setToken(ROLE, ''); API.clearCache(ROLE); S = { classes: null, dash: null }; renderLogin(); }
  function page(active, content) { UI.mount(UI.shell({ nav: NAV, active: active, who: ['강사', '유현T'], content: content, onLogout: logout })); window.scrollTo(0, 0); }
  function enc(s) { return encodeURIComponent(s); }
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
  function back(items) {
    var nav = h('nav', { class: 'backrow', 'aria-label': '위치' });
    items.forEach(function (it, i) {
      if (i) nav.appendChild(icon('right', 14));
      nav.appendChild(it[1] ? h('a', { href: it[1], text: it[0] }) : h('span', { class: 'here', text: it[0] }));
    });
    return nav;
  }
  function copyText(t, msg) {
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { UI.toast(msg || '복사했어요.'); },
      function () { UI.sheet('복사하기', h('textarea', { class: 'input', readonly: true, text: t, style: 'min-height:160px' })); });
  }
  async function classes(force) { if (!S.classes || force) S.classes = await call('admin.classes'); return S.classes; }
  function classOf(id) { return (S.classes || []).filter(function (c) { return c.id === id; })[0]; }
  function stateChip(st) { return st === 'open' ? h('span', { class: 'chip mint', text: '공개 중' }) : st === 'upcoming' ? h('span', { class: 'chip navy', text: '공개 예정' }) : h('span', { class: 'chip', text: '끝남' }); }
  function range(from, to) { return UI.fmtDate(from) + ' ~ ' + (to ? UI.fmtDate(to) : '계속'); }

  window.addEventListener('auth-lost', function (e) { if (e.detail.role === ROLE) { UI.toast(e.detail.code === 'EXPIRED' ? '로그인 시간이 지났어요. 다시 로그인해 주세요.' : '다시 로그인해 주세요.'); renderLogin(); } });
  window.addEventListener('hashchange', route);
  function route() {
    if (!API.getToken(ROLE)) return renderLogin();
    var p = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
    switch (p[0]) {
      case 'class': return viewClass(p[1], p[2] || 'students');
      case 'student': return viewStudent(p[1]);
      case 'students': return viewAllStudents();
      case 'settings': return viewSettings();
      case 'lecture': return editLecture(p[1], p[2]);
      case 'status': return viewStatus(p[1], p[2]);
      case 'test': return editTest(p[1], p[2]);
      case 'unit': return editUnit(p[1], p[2]);
      case 'log': return viewLog(p[1], p[2]);
      case 'notice': return editNotice(p[1], p[2]);
      case 'questions': return viewQuestions();
      default: return viewHome();
    }
  }

  // ===================== 로그인 =====================
  function renderLogin() {
    var pw = h('input', { class: 'input', id: 'ad-pw', type: 'password', autocomplete: 'current-password' });
    var err = h('p', { class: 'err', role: 'alert' });
    var btn = h('button', { class: 'btn primary block', type: 'submit' }, '들어가기');
    UI.mount(h('div', { class: 'auth' }, h('div', { class: 'box' },
      h('div', { class: 'brand' }, h('div', { class: 'logo', text: '유' }), window.APP_CONFIG.TITLE),
      h('p', { class: 'lead', text: '강사 관리' }),
      h('form', { class: 'card form', onsubmit: function (e) {
        e.preventDefault(); err.textContent = '';
        UI.busy(btn, async function () {
          var r = await API.call('admin.login', { password: pw.value });
          API.setToken(ROLE, r.token);
          route();
        }).catch(function (e) { err.textContent = e.message; });
      } }, h('div', { class: 'field' }, h('label', { for: 'ad-pw', text: '강사 비밀번호' }), pw), err, btn,
        h('p', { class: 'small muted', text: '로그인은 12시간 동안 유지돼요.' })),
      h('div', { class: 'inline', style: 'justify-content:center' }, h('a', { href: '/', class: 'small muted', text: '학생 화면으로' }), UI.themeButton()))));
    setTimeout(function () { pw.focus(); }, 30);
  }

  // ===================== 홈: 학원 → 반 =====================
  function viewHome() {
    var box = h('div', { class: 'sec', style: 'gap:14px' });
    page('home', box);
    box.appendChild(h('div', { class: 'inline', style: 'justify-content:space-between' }, h('h1', { text: '강사 홈' }), h('span', { class: 'small muted', text: UI.fmtDate(UI.todayStr()) })));
    var inner = h('div', { class: 'sec', style: 'gap:14px' });
    box.appendChild(inner);
    live(inner, [['admin.dashboard', {}], ['admin.classes', {}]], function (r) {
      var d = r[0]; S.dash = d; S.classes = r[1];
      inner.appendChild(todoCard(d));
      if (!d.academies.length) {
        inner.appendChild(h('div', { class: 'card empty' }, h('p', { text: '아직 반이 없어요. 반부터 만들어 주세요.' })));
        inner.appendChild(h('button', { class: 'btn primary', type: 'button', onclick: function () { classSheet(null); } }, '+ 반 만들기'));
        return;
      }
      var cur;
      try { cur = localStorage.getItem('msl_admin_acad'); } catch (e) { }
      if (!d.academies.some(function (a) { return a.name === cur; })) cur = d.academies[0].name;
      var seg = h('div', { class: 'seg', role: 'tablist', 'aria-label': '학원' });
      var body = h('div', { class: 'sec', style: 'gap:12px' });
      function draw() {
        seg.innerHTML = '';
        d.academies.forEach(function (a) {
          seg.appendChild(h('button', { type: 'button', role: 'tab', class: a.name === cur ? 'on' : '', 'aria-selected': a.name === cur ? 'true' : 'false', onclick: function () {
            cur = a.name; try { localStorage.setItem('msl_admin_acad', cur); } catch (e) { } draw();
          } }, a.name));
        });
        var a = d.academies.filter(function (x) { return x.name === cur; })[0];
        body.innerHTML = '';
        var t = a.totals;
        body.appendChild(h('section', { class: 'card tint butter' }, h('div', { class: 'k', text: a.name + ' 전체 · 확인할 것' }),
          h('div', { style: 'font-size:15px;font-weight:700;margin-top:3px', text: '미제출 ' + t.missing + '명 · 서술형 채점 ' + t.essayPending + '건' + (t.dropping ? ' · 점수 하락 ' + t.dropping + '명' : '') }),
          h('div', { class: 'tiny', style: 'margin-top:2px;color:var(--butter-ink)', text: '미제출은 반마다 가장 최근 숙제 기준이에요.' })));
        body.appendChild(h('div', { class: 'sec-h', text: '반 ' + a.classes.length }));
        var grid = h('div', { class: 'grid2' });
        a.classes.forEach(function (c) {
          var chips = [];
          if (c.missing) chips.push(h('span', { class: 'chip butter', text: '미제출 ' + c.missing }));
          if (c.essayPending) chips.push(h('span', { class: 'chip lav', text: '채점 ' + c.essayPending }));
          if (c.dropping) chips.push(h('span', { class: 'chip coral', text: '점수 하락 ' + c.dropping }));
          if (c.absentStreak && c.absentStreak.length) chips.push(h('span', { class: 'chip coral', title: c.absentStreak.join(', '), text: '연속 결석 ' + c.absentStreak.length }));
          if (!chips.length && c.latest) chips.push(h('span', { class: 'chip mint', text: '모두 제출' }));
          grid.appendChild(h('a', { class: 'card', href: '#/class/' + enc(c.id) + '/students', style: 'text-decoration:none;color:inherit;display:flex;flex-direction:column;gap:8px' },
            h('div', { class: 'inline', style: 'justify-content:space-between' },
              h('div', null, h('div', { style: 'font-weight:800;font-size:16px', text: c.name }),
                h('div', { class: 'small muted', text: '학생 ' + c.students + '명' + (c.latest ? ' · 최근 숙제 ' + c.latest.title : '') })), icon('right', 18)),
            chips.length ? h('div', { class: 'chips' }, chips) : null));
        });
        body.appendChild(grid);
      }
      inner.appendChild(seg);
      inner.appendChild(body);
      inner.appendChild(h('div', { class: 'btns grow' },
        h('button', { class: 'btn', type: 'button', onclick: function () { classSheet(null, cur === '기타' ? '' : cur); } }, '+ 반 만들기'),
        h('a', { class: 'btn', href: '#/students' }, icon('search', 16), '학생 찾기')));
      draw();
    });
  }
  function classSheet(c, academy) {
    var acad = h('input', { class: 'input', value: c ? c.academy : (academy || ''), list: 'acad-list', placeholder: '예: 센티움' });
    var name = h('input', { class: 'input', value: c ? c.name : '', placeholder: '예: SPARK 토요반' });
    var list = h('datalist', { id: 'acad-list' }, (S.classes || []).map(function (x) { return x.academy; }).filter(function (v, i, a) { return v && a.indexOf(v) === i; }).map(function (v) { return h('option', { value: v }); }));
    var btn = h('button', { class: 'btn primary', type: 'submit' }, c ? '저장' : '만들기');
    var sh = UI.sheet(c ? '반 고치기' : '반 만들기', h('form', { class: 'form', onsubmit: function (e) {
      e.preventDefault();
      UI.busy(btn, async function () {
        await call('admin.saveClass', { id: c ? c.id : '', academy: acad.value, name: name.value });
        sh.close(); UI.toast('저장했어요.'); S.classes = null; route();
      }).catch(function () { });
    } }, h('div', { class: 'field' }, h('label', { text: '학원' }), acad, list), h('div', { class: 'field' }, h('label', { text: '반 이름' }), name), btn));
  }

  // ===================== 반 =====================
  function viewClass(classId, tab) {
    var box = h('div', { class: 'sec', style: 'gap:14px' });
    page('home', box);
    var inner = h('div', { class: 'sec', style: 'gap:14px' });
    loadInto(box, classes(), function () {
      var c = classOf(classId);
      if (!c) { box.appendChild(h('div', { class: 'card empty', text: '반을 찾을 수 없어요.' })); return; }
      box.appendChild(back([[c.academy || '기타', '#/'], [c.name]]));
      box.appendChild(h('div', { class: 'inline', style: 'justify-content:space-between' },
        h('div', null, h('h1', { text: c.name }), h('p', { class: 'small muted', text: (c.academy ? c.academy + ' · ' : '') + '학생 ' + c.students + '명 · 숙제 ' + c.lectures + '개 · 테스트 ' + c.tests + '개' })),
        h('div', { class: 'btns' }, c.archived ? h('span', { class: 'chip butter', text: UI.fmtDate(c.archived) + ' 종강' }) : null,
          h('button', { class: 'btn small', type: 'button', onclick: function () { classSheet(c); } }, '반 고치기'), archiveButton(c))));
      box.appendChild(h('nav', { class: 'tabs', 'aria-label': '반 메뉴' }, TABS.map(function (t) {
        return h('a', { href: '#/class/' + enc(classId) + '/' + t[0], class: t[0] === tab ? 'on' : '', 'aria-current': t[0] === tab ? 'page' : null, text: t[1] });
      })));
      box.appendChild(inner);
      ({ students: tabStudents, attend: tabAttendance, hw: tabHw, tests: tabTests, units: tabUnits, notices: tabNotices, report: tabReport }[tab] || tabStudents)(inner, c);
    });
  }
  function tabStudents(box, c) {
    live(box, [['admin.students', {}], ['admin.classReport', { classId: c.id }], ['admin.dashboard', {}]], function (r) {
      var list = r[0].filter(function (s) { return s.classId === c.id; });
      var stat = {};
      r[1].rows.forEach(function (x) { stat[x.key] = x; });
      S.dash = r[2];
      var dc = null;
      r[2].academies.forEach(function (a) { a.classes.forEach(function (x) { if (x.id === c.id) dc = x; }); });
      box.appendChild(h('div', { class: 'inline', style: 'justify-content:space-between' },
        h('div', { class: 'small muted', text: dc && dc.latest ? '최근 숙제 ' + dc.latest.title + ' · 미제출 ' + dc.missing + '명' : '' }),
        dc && dc.missingNames.length ? h('button', { class: 'btn small', type: 'button', onclick: function () { copyText(dc.missingNames.join(', '), '미제출 명단을 복사했어요.'); } }, '미제출 명단 복사') : null));
      if (!list.length) box.appendChild(h('div', { class: 'card empty', text: '아직 이 반에 학생이 없어요.' }));
      else box.appendChild(h('section', { class: 'card tight list' }, list.map(function (s) {
        var st = stat[s.key] || {};
        var chip = st.avg == null ? h('span', { class: 'chip', text: '기록 없음' })
          : h('span', { class: 'chip ' + (st.missing ? 'butter' : 'mint'), text: '평균 ' + st.avg + (st.missing ? ' · 미제출 ' + st.missing : '') });
        return h('a', { class: 'li', href: '#/student/' + enc(s.key) },
          h('div', null, h('div', { class: 'bold' }, s.name, s.joinedAt ? h('span', { class: 'chip navy', style: 'margin-left:6px;font-size:11px', text: UI.fmtDate(s.joinedAt) + ' 입반' }) : null),
            h('div', { class: 'small muted', text: s.school + ' ' + s.grade + ' · ' + (s.pinSet ? '비밀번호 학생이 정함' : '임시 비밀번호 ' + s.pin) })),
          h('div', { class: 'inline', style: 'gap:6px;flex-wrap:nowrap' },
            s.receive && s.receive.indexOf('v') !== -1 ? h('span', { class: 'chip navy', text: '영상' }) : null,
            s.receive && s.receive.indexOf('f') !== -1 ? h('span', { class: 'chip butter', text: '자료' }) : null, chip, memoButton(s)));
      })));
      box.appendChild(h('div', { class: 'btns grow' },
        h('button', { class: 'btn primary', type: 'button', onclick: function () { rosterSheet(c); } }, '+ 학생 등록'),
        h('a', { class: 'btn', href: '#/class/' + enc(c.id) + '/report' }, '반 리포트')));
    });
  }
  function rosterSheet(c) {
    var school = h('input', { class: 'input', placeholder: '예: 청담고' });
    var grade = h('input', { class: 'input', placeholder: '예: 1' });
    var names = h('textarea', { class: 'input', placeholder: '한 줄에 한 명씩\n김철수\n이영희' });
    var out = h('div');
    var btn = h('button', { class: 'btn primary', type: 'submit' }, '등록');
    UI.sheet(c.name + ' 학생 등록', h('form', { class: 'form', onsubmit: function (e) {
      e.preventDefault();
      var rows = names.value.split(/\n/).map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
        var parts = l.split(/\s+/), pin = /^\d{4}(\d{2})?$/.test(parts[parts.length - 1]) && parts.length > 1 ? parts.pop() : '';
        return { name: parts.join(' '), pin: pin };
      });
      if (!rows.length) { UI.toast('이름을 넣어 주세요.'); return; }
      UI.busy(btn, async function () {
        var r = await call('admin.addRoster', { classId: c.id, school: school.value, grade: grade.value, rows: rows });
        out.innerHTML = '';
        out.appendChild(h('div', { class: 'card tight list' }, r.rows.map(function (x) {
          return h('div', { class: 'li' }, h('span', { class: 'bold', text: x.name }),
            h('span', { class: 'chip ' + (x.status === 'added' ? 'mint' : 'navy'), text: (x.status === 'added' ? '새로 등록' : x.status === 'moved' ? '반 옮김' : '그대로') + ' · ' + x.pin }));
        })));
        names.value = ''; S.classes = null; S.dash = null;
        UI.toast(r.rows.length + '명 처리했어요.');
      }).catch(function () { });
    } },
      h('div', { class: 'inline' }, h('div', { class: 'field', style: 'flex:2' }, h('label', { text: '학교' }), school), h('div', { class: 'field', style: 'flex:1' }, h('label', { text: '학년' }), grade)),
      h('div', { class: 'field' }, h('label', { text: '이름' }), names),
      h('p', { class: 'small muted', text: '임시 비밀번호는 1111이에요. 다르게 주려면 이름 뒤에 띄어 쓰고 숫자를 써요(예: 김철수 2580). 이미 있는 학생(같은 학교·학년·이름)은 반만 옮겨요.' }),
      btn, out), { onClose: function () { route(); } });
  }

  // ---------- 학생 한 명 ----------
  function viewStudent(key) {
    var box = h('div', { class: 'sec', style: 'gap:14px' });
    page('students', box);
    var month = '';
    function load() {
      box.innerHTML = '';
      loadInto(box, Promise.all([call('admin.studentReport', { key: key, month: month }), classes(), call('admin.students')]), function (r) {
        var rep = r[0], ad = rep.admin, st = r[2].filter(function (x) { return x.key === key; })[0];
        if (!st) { box.appendChild(h('div', { class: 'card empty', text: '학생을 찾을 수 없어요.' })); return; }
        var c = classOf(st.classId);
        box.appendChild(back(c ? [[c.academy || '기타', '#/'], [c.name, '#/class/' + enc(c.id) + '/students'], [st.name]] : [['학생 찾기', '#/students'], [st.name]]));
        var sel = h('select', { class: 'input sm', style: 'width:auto;flex:0 0 auto', 'aria-label': '월', onchange: function (e) { month = e.target.value; load(); } },
          rep.months.map(function (m) { return h('option', { value: m, selected: m === rep.month, text: m.replace('-', '년 ') + '월' }); }));
        box.appendChild(h('div', { class: 'inline', style: 'justify-content:space-between' },
          h('div', null, h('h1', { text: st.name }), h('p', { class: 'small muted', text: st.school + ' ' + st.grade + ' · ' + st.classLabel + (st.joinedAt ? ' · ' + UI.fmtDate(st.joinedAt) + ' 입반' : '') })), sel));
        var m = rep.summary.month;
        box.appendChild(h('div', { class: 'grid2', style: 'grid-template-columns:repeat(auto-fill,minmax(min(100%,150px),1fr))' },
          tile('coral', '숙제 제출률', m.rate == null ? '–' : m.rate + '%', m.due ? m.done + ' / ' + m.due + '개' : '마감된 숙제 없음'),
          tile('mint', '숙제 평균', m.avg == null ? '–' : m.avg + '점', '전체 ' + (rep.summary.overall.avg == null ? '–' : rep.summary.overall.avg + '점')),
          tile('navy', '진도', rep.progress.lecturesOpened + ' / ' + rep.progress.lecturesTotal, '자료 받은 횟수 ' + ad.downloads),
          tile('butter', '미제출', m.missing + '개', '전체 ' + rep.summary.overall.missing + '개')));
        var colA = h('div', { class: 'col-a' }), colB = h('div', { class: 'col-b' });
        // 코멘트
        var cm = h('textarea', { class: 'input', text: rep.comment, placeholder: '학부모 리포트에 보일 이번 달 한마디' });
        var cmBtn = h('button', { class: 'btn small', type: 'button' }, '코멘트 저장');
        cmBtn.addEventListener('click', function () { UI.busy(cmBtn, async function () { await call('admin.saveComment', { key: key, month: rep.month, text: cm.value }); UI.toast('저장했어요. 학부모 리포트에 보여요.'); }).catch(function () { }); });
        colA.appendChild(h('section', { class: 'card sec', style: 'gap:8px' }, h('h3', { text: rep.month.replace('-', '년 ') + '월 선생님 코멘트' }), cm, h('div', null, cmBtn)));
        colA.appendChild(h('section', { class: 'sec' }, h('div', { class: 'sec-h', text: '이번 달 숙제' }),
          rep.homework.length ? h('div', { class: 'card tight list' }, rep.homework.map(function (x) {
            return h('div', { class: 'li' }, h('div', null, h('div', { class: 'bold', text: x.title }), h('div', { class: 'small muted', text: UI.fmtDate(x.date) })),
              h('span', { class: 'chip ' + (x.status === 'missing' ? 'coral' : x.status === 'todo' ? '' : x.status === 'late' ? 'butter' : 'mint'),
                text: x.status === 'missing' ? '미제출' : x.status === 'todo' ? '진행 중' : (x.pct != null ? x.pct + '점' : '제출') + (x.status === 'late' ? ' · 늦게' : '') }));
          })) : h('div', { class: 'card empty', text: '이번 달 숙제가 없어요.' })));
        colA.appendChild(h('section', { class: 'sec' }, h('div', { class: 'sec-h', text: '이번 달 테스트' }),
          rep.testsInMonth.length ? h('div', { class: 'card tight list' }, rep.testsInMonth.map(function (t) {
            return h('div', { class: 'li' }, h('div', null, h('div', { class: 'bold', text: t.title }), h('div', { class: 'small muted', text: UI.fmtDate(t.date) })),
              h('span', { class: 'chip navy', text: t.absent ? '결석' : t.score + ' / ' + t.max }));
          })) : h('div', { class: 'card empty', text: '이번 달 테스트가 없어요.' })));
        if (ad.areasAll.length) colB.appendChild(h('section', { class: 'card sec', style: 'gap:10px' }, h('h3', { text: '영역별 정답률 (낮은 순)' }),
          ad.areasAll.slice(0, 8).map(function (a) {
            var p = a.total ? Math.round(a.correct / a.total * 100) : 0;
            return h('div', { class: 'area-row' }, h('span', { text: a.area }), h('div', { class: 'bar mint' }, h('i', { style: 'width:' + p + '%' })), h('span', { class: 'pct', text: p + '%' }));
          })));
        colB.appendChild(attendanceCard(rep.attendance));
        colB.appendChild(notesCard(st, ad.notes));
        colB.appendChild(manageCard(st, ad));
        box.appendChild(h('div', { class: 'cols' }, colA, colB));
      });
    }
    load();
  }
  function tile(color, k, v, s) {
    return h('div', { class: 'card tint ' + color, style: 'padding:14px 16px' }, h('div', { class: 'k', text: k }),
      h('div', { class: 'big', style: 'margin-top:2px', text: v }), h('div', { class: 'tiny', style: 'margin-top:2px;opacity:.85', text: s }));
  }
  function manageCard(st, ad) {
    var card = h('section', { class: 'card sec', style: 'gap:12px' }, h('h3', { text: '학생 관리' }));
    // 비밀번호
    var pinLine = h('p', { class: 'small', text: ad.pinSet ? '비밀번호: 학생이 정함 (선생님도 모름)' : '비밀번호: 임시 ' + ad.tempPin });
    var resetBtn = h('button', { class: 'btn small', type: 'button' }, '1111로 되돌리기');
    resetBtn.addEventListener('click', async function () {
      if (!(await UI.confirm(st.name + ' 학생의 비밀번호를 1111로 되돌릴까요?\n학생이 다음에 들어올 때 새 비밀번호를 정하게 돼요.', '되돌리기'))) return;
      UI.busy(resetBtn, async function () { await call('admin.resetPin', { key: st.key }); pinLine.textContent = '비밀번호: 임시 1111'; UI.toast('1111로 되돌렸어요.'); }).catch(function () { });
    });
    card.appendChild(h('div', { class: 'inline', style: 'justify-content:space-between' }, pinLine, resetBtn));
    // 늘 받는 것 (고른 학생만 차시)
    var rcv = st.receive || '';
    function rcvBox(kind, label) {
      return h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: rcv.indexOf(kind) !== -1, onchange: function (e) {
        rcv = (kind === 'v' ? (e.target.checked ? 'v' : '') + (rcv.indexOf('f') !== -1 ? 'f' : '') : (rcv.indexOf('v') !== -1 ? 'v' : '') + (e.target.checked ? 'f' : ''));
        call('admin.setReceive', { key: st.key, receive: rcv }).then(function () { UI.toast('저장했어요. 선택 공개 차시에 적용돼요.'); }, function (er) { UI.toast(er.message); });
      } }), label);
    }
    card.appendChild(h('div', { class: 'sec', style: 'gap:4px' }, h('span', { class: 'lbl', text: '상시 공개 (요청한 학생)' }),
      h('div', { class: 'inline' }, rcvBox('v', '영상'), rcvBox('f', '자료')),
      h('p', { class: 'tiny muted', text: '켜 두면 선택 공개 차시의 영상·자료가 이 학생에게 항상 공개돼요. 결석한 날은 켜지 않아도 자동으로 공개돼요.' })));
    // 학부모 코드
    var codeEl = h('b', { style: 'letter-spacing:.1em', text: ad.parentCode.slice(0, 4) + '-' + ad.parentCode.slice(4) });
    var re = h('button', { class: 'btn small', type: 'button' }, '재발급');
    re.addEventListener('click', async function () {
      if (!(await UI.confirm('학부모 코드를 새로 만들까요?\n예전 코드로 보던 학부모는 다시 로그인해야 해요.', '재발급'))) return;
      UI.busy(re, async function () { var r = await call('admin.parentCode', { key: st.key, reissue: true }); codeEl.textContent = r.code.slice(0, 4) + '-' + r.code.slice(4); ad.parentCode = r.code; UI.toast('새 코드를 만들었어요.'); }).catch(function () { });
    });
    card.appendChild(h('div', { class: 'inline', style: 'justify-content:space-between' }, h('span', { class: 'small' }, '학부모 코드 ', codeEl),
      h('div', { class: 'inline' }, h('button', { class: 'btn small', type: 'button', onclick: function () { copyText(ad.parentCode, '학부모 코드를 복사했어요.'); } }, '복사'), re)));
    // 정보 고치기
    var name = h('input', { class: 'input sm', value: st.name, 'aria-label': '이름' });
    var school = h('input', { class: 'input sm', value: st.school, 'aria-label': '학교' });
    var grade = h('input', { class: 'input sm', value: st.grade, 'aria-label': '학년', style: 'flex:0 1 70px' });
    var cls = h('select', { class: 'input sm', 'aria-label': '반' }, h('option', { value: '', text: '(반 없음)' }),
      (S.classes || []).map(function (c) { return h('option', { value: c.id, selected: c.id === st.classId, text: c.label }); }));
    var joined = h('input', { class: 'input sm', type: 'date', value: st.joinedAt || '', 'aria-label': '입반일' });
    var save = h('button', { class: 'btn small primary', type: 'button' }, '정보 저장');
    save.addEventListener('click', function () {
      UI.busy(save, async function () {
        var r = await call('admin.updateStudent', { key: st.key, name: name.value, school: school.value, grade: grade.value, classId: cls.value, joinedAt: joined.value });
        UI.toast('저장했어요.'); S.classes = null; S.dash = null;
        if (r.key !== st.key) location.hash = '#/student/' + enc(r.key); else route();
      }).catch(function () { });
    });
    var del = h('button', { class: 'btn small danger', type: 'button' }, '학생 삭제');
    del.addEventListener('click', async function () {
      if (!(await UI.confirm(st.name + ' 학생을 명단에서 지울까요?\n제출 기록은 시트에 남지만 화면에서는 안 보여요.', '삭제', true))) return;
      UI.busy(del, async function () { await call('admin.deleteStudent', { key: st.key }); S.classes = null; S.dash = null; UI.toast('지웠어요.'); location.hash = st.classId ? '#/class/' + enc(st.classId) + '/students' : '#/students'; }).catch(function () { });
    });
    card.appendChild(h('div', { class: 'sec', style: 'gap:8px;border-top:1px solid var(--line2);padding-top:12px' },
      h('div', { class: 'inline' }, name, grade), school,
      h('div', { class: 'inline' }, h('span', { class: 'lbl', text: '반' }), cls),
      h('div', { class: 'inline' }, h('span', { class: 'lbl', text: '입반일' }), joined),
      h('p', { class: 'tiny muted', text: '입반일보다 먼저 공개된 영상·자료는 이 학생에게 안 보여요(차시마다 학생별로 바꿀 수 있어요).' }),
      h('div', { class: 'inline', style: 'justify-content:space-between' }, del, save)));
    return card;
  }
  function viewAllStudents() {
    var box = h('div', { class: 'sec', style: 'gap:14px' });
    page('students', box);
    box.appendChild(h('h1', { text: '학생 찾기' }));
    var q = h('input', { class: 'input', type: 'search', placeholder: '이름·학교·메모 내용으로 찾기', 'aria-label': '학생 찾기' });
    var list = h('div');
    box.appendChild(q); box.appendChild(list);
    live(list, [['admin.students', {}]], function (r) {
      var all = r[0];
      function draw() {
        list.innerHTML = '';
        var t = q.value.trim().replace(/\s+/g, '');
        var shown = all.filter(function (s) { return !t || (s.name + s.school + s.classLabel).replace(/\s+/g, '').indexOf(t) !== -1; });
        list.appendChild(h('p', { class: 'small muted', style: 'margin-bottom:8px', text: shown.length + '명' }));
        list.appendChild(h('div', { class: 'card tight list' }, shown.slice(0, 300).map(function (s) {
          return h('a', { class: 'li', href: '#/student/' + enc(s.key) }, h('div', null, h('div', { class: 'bold', text: s.name }), h('div', { class: 'small muted', text: s.school + ' ' + s.grade })),
            h('span', { class: 'chip', text: s.classLabel }));
        })));
      }
      var noteBox = h('div', { class: 'sec', style: 'gap:8px;margin-top:14px' }), timer = null;
      list.parentNode.appendChild(noteBox);
      q.addEventListener('input', function () {
        draw();
        clearTimeout(timer);
        noteBox.innerHTML = '';
        var t = q.value.trim();
        if (t.length < 2) return;
        timer = setTimeout(function () {
          call('admin.searchNotes', { q: t }).then(function (hits) {
            noteBox.innerHTML = '';
            if (!hits.length) return;
            noteBox.appendChild(h('div', { class: 'sec-h', text: '메모에서 찾음 ' + hits.length }));
            noteBox.appendChild(h('div', { class: 'card tight list' }, hits.map(function (n) {
              return h('a', { class: 'li', href: '#/student/' + enc(n.key) }, h('div', null, h('div', { class: 'bold', text: n.name + ' · ' + n.classLabel }),
                h('div', { class: 'small muted', text: UI.fmtDate(n.date) + ' · ' + n.text })));
            })));
          }, function () { });
        }, 400);
      });
      draw();
    });
  }

  // ===================== 공개 대상(반·날짜) 고르기 =====================
  // kind: lecture(date,startTime) | test(date) | unit(from,to,students) | notice(from,to)
  function targetEditor(kind, initial, defaultClassId, opts) {
    opts = opts || {};
    var wrap = h('div', { class: 'sec', style: 'gap:8px' });
    var state = {};
    (initial || []).forEach(function (t) { state[t.classId] = JSON.parse(JSON.stringify(t)); });
    if (!initial || !initial.length) {
      var today = UI.todayStr();
      if (defaultClassId) state[defaultClassId] = kind === 'lecture' ? { classId: defaultClassId, date: today, startTime: '' } : kind === 'test' ? { classId: defaultClassId, date: today } : { classId: defaultClassId, from: today, to: '', students: {} };
    }
    var groups = {}, order = [];
    (S.classes || []).filter(function (c) { return !c.archived || (initial || []).some(function (t) { return t.classId === c.id; }); }).forEach(function (c) { var k = c.academy || '기타'; if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(c); });
    order.forEach(function (acad) {
      wrap.appendChild(h('div', { class: 'lbl', text: acad }));
      groups[acad].forEach(function (c) { wrap.appendChild(row(c)); });
    });
    function row(c) {
      var box = h('div', { class: 'target' + (state[c.id] ? ' on' : '') });
      var fields = h('div', { class: 'inline' });
      var cb = h('input', { type: 'checkbox', checked: !!state[c.id] });
      function drawFields() {
        fields.innerHTML = '';
        var t = state[c.id];
        if (!t) return;
        function inp(field, type, label, req) {
          return h('label', { class: 'small muted inline', style: 'gap:6px;flex:1 1 140px' }, label,
            h('input', { class: 'input sm', type: type, value: t[field] || '', required: req, oninput: function (e) { t[field] = e.target.value; } }));
        }
        if (kind === 'lecture') { fields.appendChild(inp('date', 'date', '날짜', true)); fields.appendChild(inp('startTime', 'time', '수업 시작')); }
        else if (kind === 'test') fields.appendChild(inp('date', 'date', '날짜', true));
        else { fields.appendChild(inp('from', 'date', '시작', true)); fields.appendChild(inp('to', 'date', '끝(비우면 계속)')); }
        if (kind === 'unit') fields.appendChild(overridePanel(c, t));
      }
      cb.addEventListener('change', function () {
        if (cb.checked) {
          var today = UI.todayStr();
          state[c.id] = kind === 'lecture' ? { classId: c.id, date: today, startTime: '' } : kind === 'test' ? { classId: c.id, date: today } : { classId: c.id, from: today, to: '', students: {} };
        } else delete state[c.id];
        box.classList.toggle('on', cb.checked);
        drawFields();
      });
      box.appendChild(h('label', { class: 'check' }, cb, h('span', { class: 'bold', text: c.name }), h('span', { class: 'small muted', text: '학생 ' + c.students + '명' })));
      box.appendChild(fields);
      drawFields();
      return box;
    }
    // 차시: 학생마다 영상·자료를 따로 보이기·숨기기 (열 때마다 지금 규칙으로 기본값을 새로 계산)
    var WHY = { all: '전체 공개', setting: '상시 공개 학생', absent: '그날 결석', video: '그날 영상 수강', joined: '입반 전 차시', '': '' };
    function overridePanel(c, t) {
      t.students = t.students || {};
      var panel = h('div', { class: 'sec hidden', style: 'gap:6px;width:100%' });
      var btn = h('button', { class: 'btn small', type: 'button' });
      function label() { var k = Object.keys(t.students).length; btn.textContent = '학생별 설정' + (k ? ' (예외 ' + k + '명)' : ''); }
      label();
      btn.addEventListener('click', function () {
        if (!panel.classList.contains('hidden')) { panel.classList.add('hidden'); return; }
        panel.classList.remove('hidden');
        panel.innerHTML = '';
        panel.appendChild(UI.loading());
        var aud = opts.audience ? opts.audience() : 'all';
        call('admin.unitAudience', { classId: c.id, from: t.from, audience: aud }).then(function (list) {
          panel.innerHTML = '';
          panel.appendChild(h('p', { class: 'tiny muted', text: aud === 'all'
            ? '전체 공개 차시예요. 중도 입반생은 입반 전 차시가 비공개예요. 학생마다 영상·자료를 따로 바꿀 수 있어요.'
            : '선택 공개 차시예요. 그날(시작 날짜) 결석·영상 수강으로 체크한 학생과 상시 공개 학생에게 자동으로 공개돼요. 요청한 학생은 여기서 공개해 주세요.' }));
          list.forEach(function (s) {
            var cur = t.students[s.key];
            if (typeof cur === 'boolean') cur = { v: cur, f: cur };
            cur = cur || {};
            function sel(kind, def, name) {
              var v = cur[kind];
              return h('select', { class: 'input sm', style: 'width:auto', 'aria-label': s.name + ' ' + name, onchange: function (e) {
                var o = t.students[s.key];
                o = typeof o === 'boolean' ? { v: o, f: o } : (o || {});
                if (e.target.value === '') delete o[kind]; else o[kind] = e.target.value === '1';
                if (o.v === undefined && o.f === undefined) delete t.students[s.key]; else t.students[s.key] = o;
                label();
              } },
                h('option', { value: '', selected: v === undefined, text: name + ' 기본(' + (def ? '공개' : '비공개') + ')' }),
                h('option', { value: '1', selected: v === true, text: name + ' 공개' }),
                h('option', { value: '0', selected: v === false, text: name + ' 비공개' }));
            }
            panel.appendChild(h('div', { class: 'inline', style: 'justify-content:space-between;border-bottom:1px solid var(--line2);padding-bottom:6px' },
              h('span', { class: 'small' }, h('b', { text: s.name }), s.why ? h('span', { class: 'muted', text: ' · ' + WHY[s.why] }) : null),
              h('div', { class: 'inline', style: 'gap:6px' }, sel('v', s.defV, '영상'), sel('f', s.defF, '자료'))));
          });
          if (!list.length) panel.appendChild(h('p', { class: 'small muted', text: '학생이 없어요.' }));
        }, function (e) { panel.innerHTML = ''; panel.appendChild(h('p', { class: 'err', text: e.message })); });
      });
      return h('div', { style: 'width:100%' }, btn, panel);
    }
    return { el: wrap, get: function () { return Object.keys(state).map(function (k) { return state[k]; }); } };
  }
  function editorPage(classId, backTab, title) {
    var box = h('div', { class: 'sec', style: 'gap:14px;max-width:860px' });
    var c = classOf(classId);
    box.appendChild(back(c ? [[c.name, '#/class/' + enc(classId) + '/' + backTab], [title]] : [['홈', '#/'], [title]]));
    return box;
  }
  function field(label, el, hint) { return h('div', { class: 'field' }, h('label', { text: label }), el, hint ? h('p', { class: 'tiny muted', text: hint }) : null); }

  // ===================== 숙제 =====================
  function tabHw(box, c) {
    live(box, [['admin.lectures', { classId: c.id }]], function (r) {
      var d = r[0];
      box.appendChild(h('div', { class: 'inline', style: 'justify-content:space-between' }, h('span', { class: 'small muted', text: '숙제 ' + d.list.length + '개 · 날짜순' }),
        h('a', { class: 'btn small primary', href: '#/lecture/new/' + enc(c.id) }, '+ 숙제 만들기')));
      if (!d.list.length) { box.appendChild(h('div', { class: 'card empty', text: '아직 숙제가 없어요.' })); return; }
      box.appendChild(h('div', { class: 'sec' }, d.list.slice().reverse().map(function (l) {
        var future = l.date > UI.todayStr();
        return h('a', { class: 'row', href: '#/status/' + enc(l.id) + '/' + enc(c.id) },
          h('div', null, h('div', { class: 't', text: l.title }),
            h('div', { class: 's', text: UI.fmtDate(l.date) + (l.startTime ? ' ' + l.startTime : '') + ' · ' + l.count + '문항' + (l.deadline ? ' · 마감 ' + UI.fmtDT(l.deadline) : '') + (l.sharedWith.length ? ' · 같이: ' + l.sharedWith.join(', ') : '') })),
          h('div', { class: 'chips', style: 'justify-content:flex-end' },
            future ? h('span', { class: 'chip navy', text: '공개 전' }) : h('span', { class: 'chip ' + (l.submitted >= d.studentCount ? 'mint' : 'butter'), text: '제출 ' + l.submitted + '/' + d.studentCount }),
            l.pendingEssay ? h('span', { class: 'chip lav', text: '채점 ' + l.pendingEssay }) : null));
      })));
    });
  }
  function viewStatus(id, classId) {
    var box = h('div', { class: 'sec', style: 'gap:14px' });
    page('home', box);
    loadInto(box, Promise.all([call('admin.lectureStatus', { id: id, classId: classId }), classes()]), function (r) {
      var d = r[0];
      if (!d) { box.appendChild(h('div', { class: 'card empty', text: '숙제를 찾을 수 없어요.' })); return; }
      var c = classOf(classId), L = d.lecture;
      box.appendChild(back([[c ? c.name : '반', '#/class/' + enc(classId) + '/hw'], [L.title]]));
      var sub = d.rows.filter(function (x) { return x.submitted; }), miss = d.rows.filter(function (x) { return !x.submitted; });
      var regrade = h('button', { class: 'btn small', type: 'button' }, '다시 채점');
      regrade.addEventListener('click', async function () {
        if (!(await UI.confirm('지금 정답 기준으로 이미 낸 답안을 다시 채점할까요?\n서술형 점수는 그대로예요.', '다시 채점'))) return;
        UI.busy(regrade, async function () { var x = await call('admin.regradeLecture', { id: id }); UI.toast(x.total + '개 중 ' + x.changed + '개가 바뀌었어요.'); route(); }).catch(function () { });
      });
      var del = h('button', { class: 'btn small danger', type: 'button' }, '삭제');
      del.addEventListener('click', async function () {
        if (!(await UI.confirm('이 숙제와 모든 반의 제출 기록을 지울까요? 되돌릴 수 없어요.', '삭제', true))) return;
        UI.busy(del, async function () { await call('admin.deleteLecture', { id: id }); UI.toast('지웠어요.'); location.hash = '#/class/' + enc(classId) + '/hw'; }).catch(function () { });
      });
      box.appendChild(h('div', { class: 'inline', style: 'justify-content:space-between' },
        h('div', null, h('h1', { text: L.title }), h('p', { class: 'small muted', text: UI.fmtDate(L.date) + (L.deadline ? ' · 마감 ' + UI.fmtDT(L.deadline) : '') + ' · ' + L.classLabel })),
        h('div', { class: 'btns' }, h('a', { class: 'btn small', href: '#/lecture/' + enc(id) + '/' + enc(classId) }, '수정'),
          h('button', { class: 'btn small', type: 'button', onclick: function () { copySheet('lecture', id, L.title, classId); } }, '다른 반에 복사'), regrade, del)));
      box.appendChild(h('div', { class: 'grid2', style: 'grid-template-columns:repeat(auto-fill,minmax(min(100%,150px),1fr))' },
        tile('mint', '제출', sub.length + ' / ' + d.rows.length, miss.length ? '미제출 ' + miss.length + '명' : '모두 냈어요'),
        tile('coral', '평균', sub.length ? Math.round(sub.reduce(function (a, x) { return a + (x.max ? x.score / x.max * 100 : 0); }, 0) / sub.length) + '점' : '–', '처음 낸 답 기준'),
        tile('lav', '서술형 채점', d.essays.reduce(function (a, e) { return a + e.entries.filter(function (x) { return x.score === ''; }).length; }, 0) + '건', '아래에서 점수 입력')));
      if (miss.length) box.appendChild(h('div', { class: 'card inline', style: 'justify-content:space-between' }, h('span', { class: 'small' }, h('b', { text: '미제출 ' }), miss.map(function (x) { return x.name; }).join(', ')),
        h('button', { class: 'btn small', type: 'button', onclick: function () { copyText(miss.map(function (x) { return x.name; }).join(', '), '미제출 명단을 복사했어요.'); } }, '복사')));
      box.appendChild(h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
        h('thead', null, h('tr', null, ['이름', '점수', '틀린 문항', '헷갈림', '낸 때'].map(function (t, i) { return h('th', { class: i === 0 ? 'sticky' : i === 1 ? 'num' : '', text: t }); }))),
        h('tbody', null, d.rows.map(function (x) {
          return h('tr', null, h('td', { class: 'sticky bold' }, h('a', { href: '#/student/' + enc(x.key), text: x.name, style: 'color:inherit' })),
            h('td', { class: 'num', text: x.submitted ? x.score + '/' + x.max + (x.pending ? ' (+' + x.pending + ')' : '') : '–' }),
            h('td', { text: x.submitted ? (x.wrongNos.join(', ') || '없음') : '미제출' }),
            h('td', { text: x.submitted ? (x.confused.join(', ') || '') : '' }),
            h('td', { class: 'small', text: x.submitted ? UI.fmtDT(x.submittedAt) + (x.late ? ' · 늦게' : '') + (x.phase === 'retry' ? ' · 재풀이 전' : '') : '' }));
        })))));
      if (sub.length) box.appendChild(h('section', { class: 'card sec', style: 'gap:8px' }, h('h3', { text: '문항별 오답률' }),
        d.qStats.map(function (q) {
          var p = q.answered ? Math.round(q.wrong / q.answered * 100) : 0;
          return h('div', { class: 'area-row', style: 'grid-template-columns:110px minmax(0,1fr) 92px' }, h('span', { text: q.no + '번 · ' + q.area }),
            h('div', { class: 'bar' }, h('i', { style: 'width:' + p + '%' })), h('span', { class: 'pct small', text: q.wrong + '명' + (q.confused ? ' · 헷갈림 ' + q.confused : '') }));
        })));
      d.essays.forEach(function (e) {
        box.appendChild(h('section', { class: 'card sec', style: 'gap:10px' }, h('h3', { text: e.no + '번 서술형 (' + e.points + '점)' }),
          e.answer ? h('p', { class: 'small muted', text: '모범 답안: ' + e.answer }) : null,
          e.entries.length ? e.entries.map(function (x) {
            var sc = h('input', { class: 'input sm', type: 'number', min: '0', max: String(e.points), step: '0.5', value: x.score, style: 'width:80px', 'aria-label': x.name + ' 점수' });
            var b = h('button', { class: 'btn small', type: 'button' }, '저장');
            b.addEventListener('click', function () { UI.busy(b, async function () { await call('admin.gradeEssay', { lectureId: id, studentKey: x.key, no: e.no, score: sc.value }); UI.toast(x.name + ' 점수를 저장했어요.'); }).catch(function () { }); });
            return h('div', { class: 'sec', style: 'gap:6px;border-top:1px solid var(--line2);padding-top:10px' }, h('b', { text: x.name }),
              h('div', { class: 'exp', text: x.text || '(빈 답)' }), h('div', { class: 'inline' }, sc, h('span', { class: 'small muted', text: '/ ' + e.points }), b));
          }) : h('p', { class: 'small muted', text: '아직 낸 학생이 없어요.' })));
      });
    });
  }
  function editLecture(id, classId) {
    var isNew = id === 'new';
    var box = h('div');
    page('home', box);
    loadInto(box, Promise.all([isNew ? Promise.resolve(null) : call('admin.getLecture', { id: id }), classes()]), function (r) {
      var L = r[0] || { title: '', memo: '', questions: [], targets: [] };
      var root = editorPage(classId, 'hw', isNew ? '새 숙제' : '숙제 수정');
      var qs = L.questions.map(function (q) { return { type: q.type, answer: q.answer, area: q.area || '', points: q.points || 1, expText: q.expText || '', expImage: q.expImage || '', qImage: q.qImage || '' }; });
      var title = h('input', { class: 'input', value: L.title, placeholder: '예: 3차시 · 전자기 유도' });
      var memo = h('textarea', { class: 'input', text: L.memo, placeholder: '학생에게 보일 안내 (선택)', style: 'min-height:60px' });
      var targets = targetEditor('lecture', L.targets, classId);
      var qbox = h('div', { class: 'card tight' });
      var countIn = h('input', { class: 'input sm', type: 'number', min: '1', max: '100', value: String(qs.length || 10), style: 'width:80px', 'aria-label': '문항 수' });
      var quick = h('textarea', { class: 'input', placeholder: '정답을 순서대로 띄어 써서 붙여 넣기\n예: 3 4+5 렌츠 2 1', style: 'min-height:56px' });
      function drawQs() {
        qbox.innerHTML = '';
        if (!qs.length) { qbox.appendChild(h('p', { class: 'empty', text: '문항 수를 정하고 "적용"을 눌러 주세요.' })); return; }
        qs.forEach(function (q, i) { qbox.appendChild(qRow(q, i)); });
      }
      function qRow(q, i) {
        var more = h('div', { class: 'sec hidden q-more', style: 'gap:8px;padding:4px 0 8px' });
        var row = h('div', { class: 'qedit' },
          h('b', { class: 'q-no', text: (i + 1) + '' }),
          h('select', { class: 'input sm q-type', 'aria-label': (i + 1) + '번 유형', onchange: function (e) { q.type = e.target.value; } },
            [['mcq', '객관식'], ['short', '단답형'], ['essay', '서술형']].map(function (o) { return h('option', { value: o[0], selected: q.type === o[0], text: o[1] }); })),
          h('input', { class: 'input sm q-ans', value: q.answer, placeholder: q.type === 'mcq' ? '예: 3 또는 4+5' : '정답 (여러 개면 /)', 'aria-label': (i + 1) + '번 정답', oninput: function (e) { q.answer = e.target.value; } }),
          h('input', { class: 'input sm q-area', value: q.area, placeholder: '영역', 'aria-label': (i + 1) + '번 영역', oninput: function (e) { q.area = e.target.value; } }),
          h('input', { class: 'input sm q-pts', type: 'number', min: '0.5', step: '0.5', value: String(q.points), 'aria-label': (i + 1) + '번 배점', oninput: function (e) { q.points = Number(e.target.value) || 1; } }),
          h('div', { class: 'inline q-act', style: 'gap:4px;flex-wrap:nowrap' },
            q.qImage ? h('span', { class: 'chip mint', title: '문제 사진 있음', text: '문제' }) : null,
            q.expImage || q.expText ? h('span', { class: 'chip lav', text: '해설' }) : null,
            h('button', { class: 'iconbtn', type: 'button', style: 'width:32px;height:32px', 'aria-label': (i + 1) + '번 더 보기', onclick: function () { more.classList.toggle('hidden'); } }, icon('plus', 14))),
          more);
        more.appendChild(h('textarea', { class: 'input', text: q.expText, placeholder: '해설 글 (재풀이 뒤 학생에게 보여요)', style: 'min-height:56px', oninput: function (e) { q.expText = e.target.value; } }));
        more.appendChild(h('div', { class: 'inline' }, imageSlot('문제 사진', q, 'qImage', drawQs), imageSlot('해설 그림', q, 'expImage', drawQs)));
        return row;
      }
      var applyBtn = h('button', { class: 'btn small', type: 'button', onclick: function () {
        var n = Math.max(1, Math.min(100, Number(countIn.value) || 1));
        while (qs.length < n) qs.push({ type: 'mcq', answer: '', area: qs.length ? qs[qs.length - 1].area : '', points: 1, expText: '', expImage: '', qImage: '' });
        if (qs.length > n) qs.length = n;
        drawQs();
      } }, '적용');
      var quickBtn = h('button', { class: 'btn small', type: 'button', onclick: function () {
        var parts = quick.value.trim().split(/[\s,]+/).filter(Boolean);
        if (!parts.length) return;
        while (qs.length < parts.length) qs.push({ type: 'mcq', answer: '', area: '', points: 1, expText: '', expImage: '', qImage: '' });
        parts.forEach(function (p, i) { qs[i].answer = p; qs[i].type = /^[1-5](\+[1-5])*$/.test(p) ? 'mcq' : (qs[i].type === 'essay' ? 'essay' : 'short'); });
        countIn.value = String(qs.length); quick.value = '';
        drawQs(); UI.toast(parts.length + '문항 정답을 넣었어요.');
      } }, '정답 채우기');
      var cropBtn = h('button', { class: 'btn small', type: 'button', onclick: function () {
        if (!qs.length) { UI.toast('문항 수부터 정해 주세요.'); return; }
        Crop.open({ count: qs.length, onSave: async function (list, progress) {
          for (var i = 0; i < list.length; i++) {
            progress(i, list.length);
            var x = await call('admin.uploadImage', { dataUrl: list[i].dataUrl, filename: 'q' + list[i].no + '.jpg' });
            if (qs[list[i].no - 1]) qs[list[i].no - 1].qImage = x.fileId;
          }
          drawQs(); UI.toast(list.length + '문항 사진을 붙였어요. 저장을 눌러야 반영돼요.');
        } });
      } }, icon('image', 16), 'PDF에서 문제 사진 자르기');
      var bulkIn = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'hidden' });
      bulkIn.addEventListener('change', function () {
        var files = Array.prototype.slice.call(bulkIn.files);
        if (!files.length) return;
        UI.busy(bulkBtn, async function () {
          var done = 0;
          for (var i = 0; i < files.length; i++) {
            var m = files[i].name.match(/\d+/);
            var no = m ? Number(m[0]) : i + 1;
            if (!qs[no - 1]) continue;
            bulkBtn.textContent = '올리는 중 ' + (i + 1) + '/' + files.length;
            var url = await UI.shrinkImage(files[i], 1200, 0.85);
            var x = await call('admin.uploadImage', { dataUrl: url, filename: files[i].name });
            qs[no - 1].qImage = x.fileId; done++;
          }
          drawQs(); UI.toast(done + '장을 파일 이름 번호대로 붙였어요. 저장을 눌러야 반영돼요.');
        }).catch(function () { }).finally(function () { bulkIn.value = ''; });
      });
      var bulkBtn = h('button', { class: 'btn small', type: 'button', onclick: function () { bulkIn.click(); } }, '문제 사진 한꺼번에 올리기');
      var save = h('button', { class: 'btn primary', type: 'button' }, '저장');
      save.addEventListener('click', function () {
        UI.busy(save, async function () {
          var r = await call('admin.saveLecture', { id: isNew ? '' : id, title: title.value, memo: memo.value, targets: targets.get(),
            questions: qs.map(function (q) { return { type: q.type, answer: q.answer, area: q.area, points: q.points, expText: q.expText, expImage: q.expImage, qImage: q.qImage }; }) });
          UI.toast('저장했어요.'); S.classes = null;
          location.hash = '#/status/' + enc(r.id) + '/' + enc(classId);
        }).catch(function () { });
      });
      root.appendChild(h('h1', { text: isNew ? '새 숙제' : '숙제 수정' }));
      root.appendChild(h('section', { class: 'card form' }, field('제목', title), field('안내', memo)));
      root.appendChild(h('section', { class: 'card sec', style: 'gap:10px' }, h('h3', { text: '대상 반 · 날짜' }),
        h('p', { class: 'tiny muted', text: '날짜가 되면 학생에게 열리고, 같은 반의 다음 숙제 수업 시작 시각이 마감이에요.' }), targets.el));
      root.appendChild(h('section', { class: 'sec', style: 'gap:10px' }, h('div', { class: 'sec-h', text: '문항' }),
        h('div', { class: 'card sec', style: 'gap:10px' },
          h('div', { class: 'inline' }, h('span', { class: 'small' }, '문항 수'), countIn, applyBtn),
          h('div', { class: 'inline', style: 'align-items:flex-start' }, quick, quickBtn),
          h('p', { class: 'tiny muted', text: '객관식 정답이 두 개 이상이면 4+5처럼 써요. 학생도 모두 골라야 정답이에요.' }),
          h('div', { class: 'btns' }, h('button', { class: 'btn small primary', type: 'button', onclick: function () {
            fillSheet(qs, function () { countIn.value = String(qs.length); drawQs(); });
          } }, '정답·영역·해설 한꺼번에 넣기')),
          h('div', { class: 'btns' }, cropBtn, bulkBtn, bulkIn, h('button', { class: 'btn small', type: 'button', onclick: function () {
            if (!qs.length) { UI.toast('문항 수부터 정해 주세요.'); return; }
            Crop.open({ title: '해설 그림 자르기', hint: '해설지 PDF', count: qs.length, onSave: async function (list, progress) {
              for (var i = 0; i < list.length; i++) {
                progress(i, list.length);
                var x = await call('admin.uploadImage', { dataUrl: list[i].dataUrl, filename: 'exp' + list[i].no + '.jpg' });
                if (qs[list[i].no - 1]) qs[list[i].no - 1].expImage = x.fileId;
              }
              drawQs(); UI.toast(list.length + '문항 해설 그림을 붙였어요. 저장을 눌러야 반영돼요.');
            } });
          } }, icon('image', 16), '해설지 PDF에서 해설 그림 자르기')),
          h('p', { class: 'tiny muted', text: '한꺼번에 올릴 때는 파일 이름에 문항 번호를 넣어 주세요(예: 01.jpg, 02.jpg).' })),
        qbox));
      root.appendChild(h('div', { class: 'submitbar' }, h('span', { class: 'small muted', text: '저장해야 학생 화면에 반영돼요.' }), save));
      box.innerHTML = ''; box.appendChild(root);
      drawQs();
    });
  }
  // 이미지 칸 (문제 사진·해설 그림): 올리기·보기·지우기
  function imageSlot(label, obj, key, redraw) {
    var inp = h('input', { type: 'file', accept: 'image/*', class: 'hidden' });
    var thumb = h('span');
    if (obj[key]) {
      var tb = h('button', { class: 'btn small', type: 'button' }, '보기');
      tb.addEventListener('click', function () {
        UI.busy(tb, async function () { var url = await call('admin.getImage', { fileId: obj[key] }); UI.sheet(label, h('img', { src: url, alt: label, style: 'border-radius:12px;background:#fff' })); }).catch(function () { });
      });
      thumb.appendChild(tb);
    }
    var up = h('button', { class: 'btn small', type: 'button', onclick: function () { inp.click(); } }, obj[key] ? '바꾸기' : '+ ' + label);
    inp.addEventListener('change', function () {
      var f = inp.files[0]; if (!f) return;
      UI.busy(up, async function () {
        up.textContent = '올리는 중…';
        var url = await UI.shrinkImage(f, 1400, 0.86);
        var x = await call('admin.uploadImage', { dataUrl: url, filename: f.name });
        obj[key] = x.fileId; UI.toast(label + '을 붙였어요. 저장을 눌러야 반영돼요.'); redraw();
      }).catch(function () { });
    });
    return h('div', { class: 'inline', style: 'gap:6px' }, h('span', { class: 'small muted', text: label }), thumb, up,
      obj[key] ? h('button', { class: 'btn small danger', type: 'button', onclick: function () { obj[key] = ''; redraw(); } }, '지우기') : null, inp);
  }

  // ===================== 테스트 =====================
  function tabTests(box, c) {
    live(box, [['admin.tests', { classId: c.id }]], function (r) {
      var list = r[0];
      box.appendChild(h('div', { class: 'inline', style: 'justify-content:space-between' }, h('span', { class: 'small muted', text: '테스트 ' + list.length + '개' }),
        h('a', { class: 'btn small primary', href: '#/test/new/' + enc(c.id) }, '+ 새 테스트')));
      if (!list.length) { box.appendChild(h('div', { class: 'card empty', text: '아직 테스트가 없어요.' })); return; }
      box.appendChild(h('div', { class: 'sec' }, list.map(function (t) {
        return h('a', { class: 'row', href: '#/test/' + enc(t.id) + '/' + enc(c.id) },
          h('div', null, h('div', { class: 't', text: t.title }), h('div', { class: 's', text: UI.fmtDate(t.date) + ' · ' + t.count + '문항' + (t.sharedWith.length ? ' · 같이: ' + t.sharedWith.join(', ') : '') })),
          h('span', { class: 'chip ' + (t.entered ? 'navy' : 'butter'), text: '입력 ' + t.entered + '명' }));
      })));
    });
  }
  function editTest(id, classId) {
    var isNew = id === 'new';
    var box = h('div');
    page('home', box);
    loadInto(box, Promise.all([isNew ? Promise.resolve(null) : call('admin.getTest', { id: id }), call('admin.classStudents', { classId: classId }), classes()]), function (r) {
      var T = r[0] || { title: '', questions: [], targets: [], results: {} };
      var students = r[1];
      var root = editorPage(classId, 'tests', isNew ? '새 테스트' : '테스트');
      var qs = T.questions.map(function (q) { return { type: q.type, answer: q.answer || '', area: q.area || '', points: q.points || 1, expText: q.expText || '', expImage: q.expImage || '' }; });
      var results = JSON.parse(JSON.stringify(T.results || {}));
      var title = h('input', { class: 'input', value: T.title, placeholder: '예: 1차 개념 테스트' });
      var targets = targetEditor('test', T.targets, classId);
      var countIn = h('input', { class: 'input sm', type: 'number', min: '1', max: '60', value: String(qs.length || 10), style: 'width:80px', 'aria-label': '문항 수' });
      var qbox = h('div', { class: 'card tight' });
      var grid = h('div');
      function auto(q) { return (q.type === 'mcq' || q.type === 'short') && String(q.answer).trim() !== ''; }
      function drawQs() {
        qbox.innerHTML = '';
        qs.forEach(function (q, i) {
          var more = h('div', { class: 'sec hidden q-more', style: 'gap:8px;padding:4px 0 8px' },
            h('textarea', { class: 'input', text: q.expText, placeholder: '해설 글 (학생 내 기록에 보여요)', style: 'min-height:56px', oninput: function (e) { q.expText = e.target.value; } }),
            imageSlot('해설 그림', q, 'expImage', drawQs));
          qbox.appendChild(h('div', { class: 'qedit' }, h('b', { class: 'q-no', text: String(i + 1) }),
            h('select', { class: 'input sm q-type', 'aria-label': (i + 1) + '번 유형', onchange: function (e) { q.type = e.target.value; drawGrid(); } },
              [['mcq', '객관식'], ['short', '단답형'], ['manual', 'O/X 직접']].map(function (o) { return h('option', { value: o[0], selected: q.type === o[0], text: o[1] }); })),
            h('input', { class: 'input sm q-ans', value: q.answer, placeholder: q.type === 'manual' ? '(정답 없음)' : '정답 (넣으면 자동 채점)', 'aria-label': (i + 1) + '번 정답', oninput: function (e) { q.answer = e.target.value; }, onchange: drawGrid }),
            h('input', { class: 'input sm q-area', value: q.area, placeholder: '영역', 'aria-label': (i + 1) + '번 영역', oninput: function (e) { q.area = e.target.value; } }),
            h('input', { class: 'input sm q-pts', type: 'number', min: '0.5', step: '0.5', value: String(q.points), 'aria-label': (i + 1) + '번 배점', oninput: function (e) { q.points = Number(e.target.value) || 1; } }),
            h('button', { class: 'iconbtn q-act', type: 'button', style: 'width:32px;height:32px', 'aria-label': (i + 1) + '번 해설', onclick: function () { more.classList.toggle('hidden'); } }, icon('plus', 14)),
            more));
        });
        drawGrid();
      }
      // 결과 입력 표: 정답이 있는 문항은 학생 답, 없는 문항은 O/X 누르기
      function drawGrid() {
        grid.innerHTML = '';
        if (!qs.length || !students.length) { grid.appendChild(h('p', { class: 'small muted', text: students.length ? '문항을 먼저 정해 주세요.' : '이 반에 학생이 없어요.' })); return; }
        var thead = h('tr', null, h('th', { class: 'sticky', text: '이름' }), h('th', { text: '결석' }), qs.map(function (q, i) { return h('th', { text: (i + 1) + (auto(q) ? '' : ' O/X') }); }));
        var rows = students.map(function (s) {
          var res = results[s.key] = results[s.key] || { absent: false, marks: {}, answers: {} };
          res.marks = res.marks || {}; res.answers = res.answers || {};
          var cells = qs.map(function (q, i) {
            var no = i + 1;
            if (auto(q)) return h('td', null, h('input', { class: 'input sm', style: 'width:64px;padding:5px 6px', value: res.answers[no] == null ? '' : res.answers[no], 'aria-label': s.name + ' ' + no + '번 답', disabled: res.absent,
              oninput: function (e) { if (e.target.value.trim()) res.answers[no] = e.target.value.trim(); else delete res.answers[no]; } }));
            var b = h('button', { class: 'btn small', type: 'button', style: 'width:44px;padding:5px 0', disabled: res.absent, 'aria-label': s.name + ' ' + no + '번 O/X' });
            function paint() { var m = res.marks[no]; b.textContent = m === 1 ? 'O' : m === 0 ? 'X' : '·'; b.style.color = m === 1 ? 'var(--mint-ink)' : m === 0 ? 'var(--coral-ink)' : ''; }
            b.addEventListener('click', function () { var m = res.marks[no]; if (m === undefined) res.marks[no] = 1; else if (m === 1) res.marks[no] = 0; else delete res.marks[no]; paint(); });
            paint();
            return h('td', null, b);
          });
          return h('tr', null, h('td', { class: 'sticky bold', text: s.name }),
            h('td', null, h('input', { type: 'checkbox', checked: !!res.absent, 'aria-label': s.name + ' 결석', onchange: function (e) { res.absent = e.target.checked; drawGrid(); } })), cells);
        });
        grid.appendChild(h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' }, h('thead', null, thead), h('tbody', null, rows))));
      }
      var applyBtn = h('button', { class: 'btn small', type: 'button', onclick: function () {
        var n = Math.max(1, Math.min(60, Number(countIn.value) || 1));
        while (qs.length < n) qs.push({ type: 'mcq', answer: '', area: '', points: 1, expText: '', expImage: '' });
        if (qs.length > n) qs.length = n;
        drawQs();
      } }, '적용');
      var save = h('button', { class: 'btn primary', type: 'button' }, '저장');
      save.addEventListener('click', function () {
        UI.busy(save, async function () {
          var clean = {};
          Object.keys(results).forEach(function (k) {
            var x = results[k];
            if (x.absent || Object.keys(x.answers || {}).length || Object.keys(x.marks || {}).length) clean[k] = x;
          });
          var r = await call('admin.saveTest', { id: isNew ? '' : id, title: title.value, targets: targets.get(), questions: qs, results: clean });
          UI.toast('저장했어요.'); S.classes = null;
          if (isNew) location.hash = '#/test/' + enc(r.id) + '/' + enc(classId); else route();
        }).catch(function () { });
      });
      var del = isNew ? null : h('button', { class: 'btn danger', type: 'button' }, '삭제');
      if (del) del.addEventListener('click', async function () {
        if (!(await UI.confirm('이 테스트와 결과를 지울까요?', '삭제', true))) return;
        UI.busy(del, async function () { await call('admin.deleteTest', { id: id }); location.hash = '#/class/' + enc(classId) + '/tests'; }).catch(function () { });
      });
      root.appendChild(h('h1', { text: isNew ? '새 테스트' : T.title }));
      root.appendChild(h('section', { class: 'card form' }, field('제목', title)));
      root.appendChild(h('section', { class: 'card sec', style: 'gap:10px' }, h('h3', { text: '대상 반 · 날짜' }), targets.el));
      root.appendChild(h('section', { class: 'sec', style: 'gap:10px' }, h('div', { class: 'sec-h', text: '문항' }),
        h('div', { class: 'card inline' }, h('span', { class: 'small' }, '문항 수'), countIn, applyBtn,
          h('span', { class: 'tiny muted', text: '정답을 넣은 문항은 학생 답 번호만 입력하면 자동으로 O/X가 매겨져요.' })), qbox));
      root.appendChild(h('section', { class: 'sec', style: 'gap:10px' }, h('div', { class: 'sec-h', text: '결과 입력 (이 반 학생)' }), grid));
      root.appendChild(h('div', { class: 'submitbar' }, del || h('span'), save));
      box.innerHTML = ''; box.appendChild(root);
      drawQs();
    });
  }

  // ===================== 자료실 (차시) =====================
  function tabUnits(box, c) {
    live(box, [['admin.units', { classId: c.id }]], function (r) {
      var list = r[0];
      box.appendChild(h('div', { class: 'inline', style: 'justify-content:space-between' }, h('span', { class: 'small muted', text: '차시 ' + list.length + '개 · 영상과 자료를 차시로 묶어 한 번에 공개해요' }),
        h('a', { class: 'btn small primary', href: '#/unit/new/' + enc(c.id) }, '+ 차시 만들기')));
      if (!list.length) { box.appendChild(h('div', { class: 'card empty', text: '아직 차시가 없어요.' })); return; }
      box.appendChild(h('div', { class: 'sec' }, list.map(function (u) {
        return h('a', { class: 'row', href: '#/unit/' + enc(u.id) + '/' + enc(c.id) },
          h('div', null, h('div', { class: 't', text: u.title }),
            h('div', { class: 's', text: range(u.from, u.to) + ' · 영상 ' + u.videos + ' · 파일 ' + u.files + (u.overrides ? ' · 학생별 예외 ' + u.overrides + '명' : '') + (u.sharedWith.length ? ' · 같이: ' + u.sharedWith.join(', ') : '') })),
          h('div', { class: 'chips', style: 'justify-content:flex-end' }, stateChip(u.state), u.audience === 'all' ? h('span', { class: 'chip lav', text: '전체 공개' }) : h('span', { class: 'chip', text: '선택 공개' }),
            u.files ? h('span', { class: 'chip', text: '자료 ' + u.got + '/' + (u.allowedF == null ? u.allowed : u.allowedF) + '명' }) : null,
            u.videos ? h('span', { class: 'chip', text: '영상 ' + (u.viewed || 0) + '/' + (u.allowedV == null ? u.allowed : u.allowedV) + '명' }) : null));
      })));
    });
  }
  function editUnit(id, classId) {
    var isNew = id === 'new';
    var box = h('div');
    page('home', box);
    loadInto(box, Promise.all([isNew ? Promise.resolve(null) : call('admin.getUnit', { id: id }), classes()]), function (r) {
      var U = r[0] || { title: '', memo: '', videos: [], files: [], targets: [] };
      var root = editorPage(classId, 'units', isNew ? '새 차시' : '차시 수정');
      var videos = U.videos.map(function (v) { return { id: v.id, label: v.label, url: v.url }; });
      var files = U.files.map(function (f) { return { id: f.id, fileId: f.fileId, fileName: f.fileName, size: f.size, stamp: f.stamp }; });
      var title = h('input', { class: 'input', value: U.title, placeholder: '예: 3차시 · 전자기 유도' });
      var memo = h('textarea', { class: 'input', text: U.memo, placeholder: '학생에게 보일 설명 (선택)', style: 'min-height:56px' });
      var audience = isNew ? 'pick' : (U.audience || 'all');
      var targets = targetEditor('unit', U.targets, classId, { audience: function () { return audience; } });
      var audBox = h('div', { class: 'sec', style: 'gap:6px' }, [['pick', '선택 공개', '기본은 비공개예요. 그날 결석·영상 수강으로 체크한 학생은 영상+자료가 자동 공개되고, 상시 공개 학생과 학생별 설정에서 공개한 학생에게만 보여요.'],
        ['all', '전체 공개', '반 학생 모두에게 영상과 자료를 공개해요.']].map(function (o) {
        return h('label', { class: 'check', style: 'align-items:flex-start' }, h('input', { type: 'radio', name: 'aud', value: o[0], checked: audience === o[0], onchange: function () { audience = o[0]; } }),
          h('span', null, h('b', { text: o[1] }), h('span', { class: 'tiny muted', style: 'display:block', text: o[2] })));
      }));
      var vbox = h('div', { class: 'sec', style: 'gap:8px' }), fbox = h('div', { class: 'sec', style: 'gap:8px' });
      function drawV() {
        vbox.innerHTML = '';
        videos.forEach(function (v, i) {
          vbox.appendChild(h('div', { class: 'inline' },
            h('input', { class: 'input sm', style: 'flex:0 1 110px', value: v.label, placeholder: (i + 1) + '교시', 'aria-label': '영상 이름', oninput: function (e) { v.label = e.target.value; } }),
            h('input', { class: 'input sm', style: 'flex:1 1 220px', value: v.url, placeholder: '유튜브(일부 공개)나 구글 드라이브 링크', 'aria-label': '영상 링크', oninput: function (e) { v.url = e.target.value; } }),
            h('button', { class: 'iconbtn', type: 'button', 'aria-label': '영상 빼기', onclick: function () { videos.splice(i, 1); drawV(); } }, icon('x', 16))));
        });
        vbox.appendChild(h('button', { class: 'btn small', type: 'button', style: 'align-self:flex-start', onclick: function () { videos.push({ label: (videos.length + 1) + '교시', url: '' }); drawV(); } }, '+ 영상 추가'));
      }
      var fileIn = h('input', { type: 'file', multiple: true, class: 'hidden' });
      var upBtn = h('button', { class: 'btn small', type: 'button', onclick: function () { fileIn.click(); } }, icon('file', 16), '파일 올리기 (여러 개)');
      var linkIn = h('input', { class: 'input sm', placeholder: '또는 내 드라이브 파일 링크', 'aria-label': '드라이브 링크' });
      var linkBtn = h('button', { class: 'btn small', type: 'button' }, '링크 추가');
      fileIn.addEventListener('change', function () {
        var list = Array.prototype.slice.call(fileIn.files);
        UI.busy(upBtn, async function () {
          for (var i = 0; i < list.length; i++) {
            if (list[i].size > 20 * 1024 * 1024) { UI.toast(list[i].name + ': 20MB가 넘어서 건너뛰었어요.'); continue; }
            upBtn.textContent = '올리는 중 ' + (i + 1) + '/' + list.length;
            var x = await call('admin.uploadFile', { dataUrl: await UI.readDataUrl(list[i]), filename: list[i].name });
            files.push({ fileId: x.fileId, fileName: x.fileName, size: x.size, stamp: true });
            drawF();
          }
        }).catch(function () { }).finally(function () { fileIn.value = ''; });
      });
      linkBtn.addEventListener('click', function () {
        UI.busy(linkBtn, async function () { var x = await call('admin.checkLink', { link: linkIn.value }); files.push({ fileId: x.fileId, fileName: x.fileName, size: x.size, stamp: true }); linkIn.value = ''; drawF(); }).catch(function () { });
      });
      function drawF() {
        fbox.innerHTML = '';
        files.forEach(function (f, i) {
          fbox.appendChild(h('div', { class: 'file' }, h('div', { class: 'ic' }, icon('file', 18)),
            h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 'nm', text: f.fileName }), h('div', { class: 'tiny muted', text: UI.size(f.size) })),
            h('label', { class: 'check small' }, h('input', { type: 'checkbox', checked: f.stamp, onchange: function (e) { f.stamp = e.target.checked; } }), '이름 찍기'),
            h('button', { class: 'iconbtn', type: 'button', 'aria-label': f.fileName + ' 빼기', onclick: function () { files.splice(i, 1); drawF(); } }, icon('x', 16))));
        });
        fbox.appendChild(h('div', { class: 'inline' }, upBtn, fileIn, linkIn, linkBtn));
        fbox.appendChild(h('p', { class: 'tiny muted', text: '파일은 내 드라이브에 비공개로 저장되고, 로그인한 학생만 받을 수 있어요. PDF는 받을 때 아래 여백에 "이름 · 학교 · 날짜"가 찍혀요. 한 파일 20MB까지.' }));
      }
      var save = h('button', { class: 'btn primary', type: 'button' }, '저장');
      save.addEventListener('click', function () {
        UI.busy(save, async function () {
          var r = await call('admin.saveUnit', { id: isNew ? '' : id, title: title.value, memo: memo.value, videos: videos, files: files, targets: targets.get(), audience: audience });
          UI.toast('저장했어요.');
          location.hash = '#/class/' + enc(classId) + '/units';
        }).catch(function () { });
      });
      var del = isNew ? null : h('button', { class: 'btn danger', type: 'button' }, '삭제');
      if (del) del.addEventListener('click', async function () {
        if (!(await UI.confirm('이 차시를 지울까요? 드라이브 파일은 그대로 남아요.', '삭제', true))) return;
        UI.busy(del, async function () { await call('admin.deleteUnit', { id: id }); location.hash = '#/class/' + enc(classId) + '/units'; }).catch(function () { });
      });
      root.appendChild(h('div', { class: 'inline', style: 'justify-content:space-between' }, h('h1', { text: isNew ? '새 차시' : '차시 수정' }),
        isNew ? null : h('div', { class: 'btns' }, h('a', { class: 'btn small', href: '#/log/' + enc(id) + '/' + enc(classId) }, '받은·시청 기록'),
          h('button', { class: 'btn small', type: 'button', onclick: function () { copySheet('unit', id, U.title, classId); } }, '다른 반에 복사'))));
      root.appendChild(h('section', { class: 'card form' }, field('제목', title), field('설명', memo)));
      root.appendChild(h('section', { class: 'card sec', style: 'gap:10px' }, h('h3', { text: '영상' }), vbox));
      root.appendChild(h('section', { class: 'card sec', style: 'gap:10px' }, h('h3', { text: '수업 자료 파일' }), fbox));
      root.appendChild(h('section', { class: 'card sec', style: 'gap:10px' }, h('h3', { text: '공개 대상' }), audBox));
      root.appendChild(h('section', { class: 'card sec', style: 'gap:10px' }, h('h3', { text: '공개 반 · 날짜' }),
        h('p', { class: 'tiny muted', text: '시작 날짜를 그 수업 날짜로 맞춰 주세요. 그날 출석부에서 결석·영상으로 체크한 학생에게 자동으로 열려요.' }), targets.el));
      root.appendChild(h('div', { class: 'submitbar' }, del || h('span'), save));
      box.innerHTML = ''; box.appendChild(root);
      drawV(); drawF();
    });
  }
  function viewLog(unitId, classId) {
    var box = h('div', { class: 'sec', style: 'gap:14px' });
    page('home', box);
    loadInto(box, Promise.all([call('admin.downloadLog', { unitId: unitId, classId: classId }), classes()]), function (r) {
      var d = r[0], c = classOf(classId);
      if (!d) { box.appendChild(h('div', { class: 'card empty', text: '차시를 찾을 수 없어요.' })); return; }
      box.appendChild(back([[c ? c.name : '반', '#/class/' + enc(classId) + '/units'], [d.title, '#/unit/' + enc(unitId) + '/' + enc(classId)], ['받은 기록']]));
      box.appendChild(h('h1', { text: d.title + ' 받은 기록' }));
      if (!d.files.length && !d.videos.length) { box.appendChild(h('div', { class: 'card empty', text: '이 차시에는 영상·파일이 없어요.' })); return; }
      box.appendChild(h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
        h('thead', null, h('tr', null, h('th', { class: 'sticky', text: '이름' }), h('th', { text: '공개' }), d.videos.map(function (v) { return h('th', { text: '▶ ' + v.label }); }), d.files.map(function (f) { return h('th', { text: f.fileName }); }))),
        h('tbody', null, d.rows.map(function (x) {
          return h('tr', null, h('td', { class: 'sticky bold', text: x.name }), h('td', { text: x.canV === undefined ? (x.allowed ? '예' : '아니요') : ([x.canV ? '영상' : '', x.canF ? '자료' : ''].filter(Boolean).join('·') || '없음') }),
            x.videos.map(function (v) { return h('td', { class: 'small', text: v.count ? UI.fmtDT(v.first) + (v.count > 1 ? ' 외 ' + (v.count - 1) + '번' : '') : '–' }); }),
            x.files.map(function (f) { return h('td', { class: 'small', text: f.count ? UI.fmtDT(f.first) + (f.count > 1 ? ' 외 ' + (f.count - 1) + '번' : '') : '–' }); }));
        })))));
    });
  }

  // ===================== 공지 =====================
  function tabNotices(box, c) {
    live(box, [['admin.notices', { classId: c.id }]], function (r) {
      var list = r[0];
      box.appendChild(h('div', { class: 'inline', style: 'justify-content:space-between' }, h('span', { class: 'small muted', text: '공지 ' + list.length + '개 · 학생 홈 맨 위에 떠요' }),
        h('a', { class: 'btn small primary', href: '#/notice/new/' + enc(c.id) }, '+ 공지 쓰기')));
      if (!list.length) { box.appendChild(h('div', { class: 'card empty', text: '아직 공지가 없어요.' })); return; }
      box.appendChild(h('div', { class: 'sec' }, list.map(function (n) {
        return h('a', { class: 'row', href: '#/notice/' + enc(n.id) + '/' + enc(c.id) },
          h('div', null, h('div', { class: 't', text: n.title }), h('div', { class: 's', text: range(n.from, n.to) + (n.hasImage ? ' · 사진' : '') + (n.hasLink ? ' · 링크' : '') })),
          h('div', { class: 'chips', style: 'justify-content:flex-end' }, n.pinned ? h('span', { class: 'chip lav', text: '고정' }) : null, stateChip(n.state)));
      })));
    });
  }
  function editNotice(id, classId) {
    var isNew = id === 'new';
    var box = h('div');
    page('home', box);
    loadInto(box, Promise.all([isNew ? Promise.resolve(null) : call('admin.getNotice', { id: id }), classes()]), function (r) {
      var N = r[0] || { title: '', body: '', image: '', linkUrl: '', linkLabel: '', pinned: false, targets: [] };
      var root = editorPage(classId, 'notices', isNew ? '새 공지' : '공지 수정');
      var title = h('input', { class: 'input', value: N.title });
      var body = h('textarea', { class: 'input', text: N.body });
      var link = h('input', { class: 'input', value: N.linkUrl, placeholder: 'https://' });
      var linkLabel = h('input', { class: 'input', value: N.linkLabel, placeholder: '예: 신청서 열기' });
      var pinned = h('input', { type: 'checkbox', checked: N.pinned });
      var targets = targetEditor('notice', N.targets, classId);
      var img = h('div');
      function drawImg() { img.innerHTML = ''; img.appendChild(imageSlot('사진', N, 'image', drawImg)); }
      var save = h('button', { class: 'btn primary', type: 'button' }, '저장');
      save.addEventListener('click', function () {
        UI.busy(save, async function () {
          await call('admin.saveNotice', { id: isNew ? '' : id, title: title.value, body: body.value, image: N.image, linkUrl: link.value, linkLabel: linkLabel.value, pinned: pinned.checked, targets: targets.get() });
          UI.toast('저장했어요.'); location.hash = '#/class/' + enc(classId) + '/notices';
        }).catch(function () { });
      });
      var del = isNew ? null : h('button', { class: 'btn danger', type: 'button' }, '삭제');
      if (del) del.addEventListener('click', async function () {
        if (!(await UI.confirm('이 공지를 지울까요?', '삭제', true))) return;
        UI.busy(del, async function () { await call('admin.deleteNotice', { id: id }); location.hash = '#/class/' + enc(classId) + '/notices'; }).catch(function () { });
      });
      root.appendChild(h('h1', { text: isNew ? '새 공지' : '공지 수정' }));
      root.appendChild(h('section', { class: 'card form' }, field('제목', title, '학생 홈 맨 위 띠에 이 제목이 보여요.'), field('내용', body), img,
        h('div', { class: 'inline' }, h('div', { class: 'field', style: 'flex:2 1 200px' }, h('label', { text: '링크' }), link), h('div', { class: 'field', style: 'flex:1 1 140px' }, h('label', { text: '링크 글자' }), linkLabel)),
        h('label', { class: 'check' }, pinned, '맨 위에 고정')));
      root.appendChild(h('section', { class: 'card sec', style: 'gap:10px' }, h('h3', { text: '공개 반 · 기간' }), targets.el));
      root.appendChild(h('div', { class: 'submitbar' }, del || h('span'), save));
      box.innerHTML = ''; box.appendChild(root);
      drawImg();
    });
  }

  // ===================== 반 리포트 =====================
  function tabReport(box, c) {
    live(box, [['admin.classReport', { classId: c.id }]], function (r) {
      var d = r[0];
      box.appendChild(h('div', { class: 'sec-h', text: '학생별 (평균 높은 순)' }));
      box.appendChild(h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
        h('thead', null, h('tr', null, [['이름', 'sticky'], ['출석률', 'num'], ['낸 숙제', 'num'], ['미제출', 'num'], ['평균', 'num'], ['최근', 'num']].map(function (t) { return h('th', { class: t[1], text: t[0] }); }))),
        h('tbody', null, d.rows.map(function (x) {
          return h('tr', null, h('td', { class: 'sticky bold' }, h('a', { href: '#/student/' + enc(x.key), text: x.name, style: 'color:inherit' })),
            h('td', { class: 'num', text: x.att == null ? '–' : x.att + '%' }),
            h('td', { class: 'num', text: String(x.done) }), h('td', { class: 'num', text: x.missing ? String(x.missing) : '–', style: x.missing ? 'color:var(--coral-ink);font-weight:700' : '' }),
            h('td', { class: 'num', text: x.avg == null ? '–' : x.avg + '점' }), h('td', { class: 'num', text: x.last == null ? '–' : x.last + '점' }));
        })))));
      box.appendChild(h('div', { class: 'sec-h', text: '숙제별 (최근 순)' }));
      box.appendChild(d.lectures.length ? h('div', { class: 'card tight list' }, d.lectures.map(function (l) {
        return h('a', { class: 'li', href: '#/status/' + enc(l.id) + '/' + enc(c.id) },
          h('div', null, h('div', { class: 'bold', text: l.title }), h('div', { class: 'small muted', text: UI.fmtDate(l.date) + ' · 제출 ' + l.submitted + '/' + l.eligible })),
          h('span', { class: 'chip ' + (l.avg == null ? '' : 'mint'), text: l.avg == null ? '–' : '평균 ' + l.avg + '점' }));
      })) : h('div', { class: 'card empty', text: '아직 열린 숙제가 없어요.' }));
    });
  }

  // ===================== 설정 =====================
  function viewSettings() {
    var box = h('div', { class: 'sec', style: 'gap:14px;max-width:760px' });
    page('settings', box);
    box.appendChild(h('h1', { text: '설정' }));
    var inner = h('div', { class: 'sec', style: 'gap:14px' });
    box.appendChild(inner);
    loadInto(inner, Promise.all([classes(true), call('admin.siteSettings', {})]), function (r) {
      var cl = r[0], site = r[1];
      // 반 관리
      var groups = {}, order = [];
      var archived = cl.filter(function (c) { return c.archived; });
      cl.filter(function (c) { return !c.archived; }).forEach(function (c) { var k = c.academy || '기타'; if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(c); });
      var cbox = h('section', { class: 'card sec', style: 'gap:10px' }, h('div', { class: 'inline', style: 'justify-content:space-between' }, h('h3', { text: '학원 · 반' }),
        h('button', { class: 'btn small', type: 'button', onclick: function () { classSheet(null); } }, '+ 반 만들기')));
      order.forEach(function (a) {
        cbox.appendChild(h('div', { class: 'lbl', text: a }));
        groups[a].forEach(function (c) {
          var del = h('button', { class: 'btn small danger', type: 'button' }, '삭제');
          del.addEventListener('click', async function () {
            if (!(await UI.confirm(c.name + ' 반을 지울까요?\n학생이 있으면 지울 수 없어요.', '삭제', true))) return;
            UI.busy(del, async function () { await call('admin.deleteClass', { id: c.id }); UI.toast('지웠어요.'); S.classes = null; route(); }).catch(function () { });
          });
          cbox.appendChild(h('div', { class: 'inline', style: 'justify-content:space-between;border-bottom:1px solid var(--line2);padding-bottom:8px' },
            h('span', null, h('b', { text: c.name }), h('span', { class: 'small muted', text: ' · 학생 ' + c.students + ' · 숙제 ' + c.lectures + ' · 테스트 ' + c.tests })),
            h('div', { class: 'inline' }, h('a', { class: 'btn small', href: '#/class/' + enc(c.id) + '/students' }, '열기'),
              h('button', { class: 'btn small', type: 'button', onclick: function () { classSheet(c); } }, '고치기'), archiveButton(c), del)));
        });
      });
      inner.appendChild(cbox);
      if (archived.length) inner.appendChild(h('section', { class: 'card sec', style: 'gap:10px' }, h('h3', { text: '종강한 반 ' + archived.length }),
        h('p', { class: 'tiny muted', text: '기록은 모두 남아 있어요. 종강 후 1주가 지나면 학생 화면의 영상·자료가 닫혀요.' }),
        archived.map(function (c) {
          return h('div', { class: 'inline', style: 'justify-content:space-between;border-bottom:1px solid var(--line2);padding-bottom:8px' },
            h('span', null, h('b', { text: c.label }), h('span', { class: 'small muted', text: ' · ' + UI.fmtDate(c.archived) + ' 종강 · 학생 ' + c.students })),
            h('div', { class: 'inline' }, h('a', { class: 'btn small', href: '#/class/' + enc(c.id) + '/students' }, '열기'), archiveButton(c)));
        })));
      inner.appendChild(h('section', { class: 'card sec', style: 'gap:6px' }, h('h3', { text: '자동 백업' }),
        h('p', { class: 'small', text: site.lastBackup ? '마지막 백업: ' + UI.fmtDT(site.lastBackup) + ' · 매주 월요일 새벽에 드라이브 "백업" 폴더에 시트 사본이 생겨요(최근 8주).' : '아직 백업 기록이 없어요. Apps Script 편집기에서 setupBackup을 한 번 실행하면 매주 자동으로 백업돼요.' })));
      // 비밀번호
      var cur = h('input', { class: 'input', type: 'password', autocomplete: 'current-password' });
      var n1 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password' });
      var n2 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password' });
      var pwBtn = h('button', { class: 'btn', type: 'submit' }, '비밀번호 바꾸기');
      inner.appendChild(h('form', { class: 'card form', onsubmit: function (e) {
        e.preventDefault();
        if (n1.value !== n2.value) { UI.toast('새 비밀번호 두 개가 달라요.'); return; }
        UI.busy(pwBtn, async function () { var x = await call('admin.changePassword', { current: cur.value, next: n1.value }); API.setToken(ROLE, x.token); cur.value = n1.value = n2.value = ''; UI.toast('바꿨어요. 다른 기기의 강사 로그인은 끊겨요.'); }).catch(function () { });
      } }, h('h3', { text: '강사 비밀번호' }), field('지금 비밀번호', cur), field('새 비밀번호 (8자 이상)', n1), field('새 비밀번호 확인', n2),
        h('p', { class: 'tiny muted', text: '바꾸면 예전 화면(긴 주소)에서도 새 비밀번호를 써요.' }), h('div', null, pwBtn)));
      // 전환
      var url = h('input', { class: 'input', value: site.siteUrl });
      var sw = h('input', { type: 'checkbox', checked: site.switched });
      var swBtn = h('button', { class: 'btn primary', type: 'button' }, '저장');
      swBtn.addEventListener('click', async function () {
        if (sw.checked && !site.switched && !(await UI.confirm('옛 주소(긴 주소·기존 QR)로 들어오는 사람을 새 사이트로 보낼까요?\n예전 화면은 더 이상 쓰지 않게 돼요.', '전환하기'))) return;
        UI.busy(swBtn, async function () { site = await call('admin.siteSettings', { save: true, siteUrl: url.value, switched: sw.checked }); UI.toast(site.switched ? '전환했어요.' : '저장했어요.'); }).catch(function () { });
      });
      inner.appendChild(h('section', { class: 'card form' }, h('h3', { text: '새 사이트로 전환' }), field('새 사이트 주소', url),
        h('label', { class: 'check' }, sw, '옛 주소로 들어오면 새 사이트로 보내기'),
        h('p', { class: 'tiny muted', text: '서버 ' + site.version + ' · 비밀번호 해시 ' + (site.pinsHashed ? '완료' : '전') + ' · 영상·자료 차시 복사 ' + (site.unitsMigrated ? '완료(옛 화면 추가 잠김)' : '전') }),
        h('div', null, swBtn)));
      inner.appendChild(h('div', { class: 'btns' }, h('button', { class: 'btn', type: 'button', onclick: logout }, icon('out', 16), '로그아웃'), UI.themeButton()));
    });
  }

  // ===================== 2차: 오늘 할 일 · 종강 · 메모 · 출석 · 복사 · 한꺼번에 넣기 · 질문함 =====================
  function todoCard(d) {
    var t = d.todo || { lectures: [], reminders: [], absent: [], questions: 0, essay: 0 };
    var rows = [];
    t.lectures.forEach(function (l) {
      rows.push(h('a', { class: 'li', href: '#/class/' + enc(l.classId) + '/attend' },
        h('div', null, h('div', { class: 'bold', text: (l.startTime ? l.startTime + ' ' : '') + l.className }), h('div', { class: 'small muted', text: '오늘 수업 · ' + l.title })),
        h('span', { class: 'chip', text: '출석 체크' })));
    });
    if (t.absent.length) rows.push(h('div', { class: 'li' }, h('div', null, h('div', { class: 'bold', text: '오늘 결석 ' + t.absent.length + '명' }),
      h('div', { class: 'small muted', text: t.absent.map(function (a) { return a.name; }).join(', ') })),
      h('button', { class: 'btn small', type: 'button', onclick: function () { copyText(t.absent.map(function (a) { return a.name + '(' + a.classLabel + ')'; }).join(', '), '결석 명단을 복사했어요.'); } }, '복사')));
    t.reminders.forEach(function (r) {
      rows.push(h('a', { class: 'li', href: '#/student/' + enc(r.key) }, h('div', null, h('div', { class: 'bold', text: '상담 · ' + r.name }), h('div', { class: 'small muted', text: r.text })),
        h('span', { class: 'chip coral', text: UI.fmtDate(r.remindAt) })));
    });
    if (t.questions) rows.push(h('a', { class: 'li', href: '#/questions' }, h('div', { class: 'bold', text: '답 기다리는 질문 ' + t.questions + '개' }), icon('right', 16)));
    if (t.essay) rows.push(h('div', { class: 'li' }, h('div', { class: 'bold', text: '서술형 채점 ' + t.essay + '건' }), h('span', { class: 'small muted', text: '반 카드에서 확인' })));
    return h('section', { class: 'card sec', style: 'gap:4px' }, h('div', { class: 'inline', style: 'justify-content:space-between' }, h('h3', { text: '오늘 할 일' }), h('span', { class: 'small muted', text: UI.fmtDate(d.today) })),
      rows.length ? h('div', { class: 'list' }, rows) : h('p', { class: 'small muted', style: 'padding:6px 0', text: '오늘 챙길 일이 없어요.' }));
  }
  function archiveButton(c) {
    var b = h('button', { class: 'btn small', type: 'button' }, c.archived ? '다시 열기' : '종강');
    b.addEventListener('click', async function (e) {
      e.preventDefault();
      var msg = c.archived ? c.name + ' 반을 다시 열까요? 강사 홈과 반 목록에 다시 보여요.'
        : c.name + ' 반을 종강할까요?\n· 강사 홈과 반 고르는 목록에서 빠져요.\n· 숙제·점수·출석·메모 기록은 모두 남아요.\n· 학생은 종강 후 1주 동안만 영상·자료를 볼 수 있어요.\n· 설정에서 언제든 다시 열 수 있어요.';
      if (!(await UI.confirm(msg, c.archived ? '다시 열기' : '종강'))) return;
      UI.busy(b, async function () { await call('admin.archiveClass', { id: c.id, archived: !c.archived }); S.classes = null; API.clearCache(ROLE); UI.toast(c.archived ? '다시 열었어요.' : '종강했어요.'); route(); }).catch(function () { });
    });
    return b;
  }

  // ---------- 강사 전용 메모 ----------
  var TAGS = ['상담', '학부모 통화', '수업 태도', '진도', '기타'];
  function noteSheet(key, name, note, onSaved) {
    note = note || {};
    var date = h('input', { class: 'input sm', type: 'date', value: note.date || UI.todayStr(), 'aria-label': '날짜' });
    var tag = h('select', { class: 'input sm', 'aria-label': '종류' }, TAGS.map(function (t) { return h('option', { value: t, selected: (note.tag || '상담') === t, text: t }); }));
    var text = h('textarea', { class: 'input', text: note.text || '', placeholder: '상담 내용, 기억할 점 (선생님만 볼 수 있어요)' });
    var pinned = h('input', { type: 'checkbox', checked: !!note.pinned });
    var remind = h('input', { class: 'input sm', type: 'date', value: note.remindAt || '', 'aria-label': '다음 상담일' });
    var done = h('input', { type: 'checkbox', checked: !!note.done });
    var save = h('button', { class: 'btn primary', type: 'submit' }, '저장');
    var del = note.id ? h('button', { class: 'btn danger', type: 'button' }, '삭제') : null;
    var sh = UI.sheet(name + ' 메모', h('form', { class: 'form', onsubmit: function (e) {
      e.preventDefault();
      UI.busy(save, async function () {
        var list = await call('admin.saveNote', { id: note.id || '', key: key, date: date.value, tag: tag.value, text: text.value, pinned: pinned.checked, remindAt: remind.value, done: done.checked });
        sh.close(); UI.toast('메모를 저장했어요.'); if (onSaved) onSaved(list);
      }).catch(function () { });
    } },
      h('div', { class: 'inline' }, date, tag), text,
      h('label', { class: 'check' }, pinned, '맨 위에 고정 (늘 기억할 내용)'),
      h('div', { class: 'inline' }, h('span', { class: 'lbl', text: '다음 상담일' }), remind, note.id ? h('label', { class: 'check small' }, done, '상담 끝남') : null),
      h('p', { class: 'tiny muted', text: '다음 상담일을 넣으면 그날 강사 홈 "오늘 할 일"에 떠요. 학생·학부모 화면에는 절대 안 보여요.' }),
      h('div', { class: 'btns grow' }, del, save)));
    if (del) del.addEventListener('click', async function () {
      if (!(await UI.confirm('이 메모를 지울까요?', '삭제', true))) return;
      UI.busy(del, async function () { var list = await call('admin.deleteNote', { id: note.id }); sh.close(); if (onSaved) onSaved(list); }).catch(function () { });
    });
  }
  function memoButton(s) {
    return h('button', { class: 'iconbtn', type: 'button', style: 'width:32px;height:32px', 'aria-label': s.name + ' 메모 쓰기', title: '빠른 메모', onclick: function (e) {
      e.preventDefault(); e.stopPropagation(); noteSheet(s.key, s.name, null, null);
    } }, icon('note', 16));
  }
  function notesCard(st, notes) {
    var card = h('section', { class: 'card sec', style: 'gap:10px' });
    function draw(list) {
      card.innerHTML = '';
      card.appendChild(h('div', { class: 'inline', style: 'justify-content:space-between' }, h('h3', { text: '상담·메모 (선생님만)' }),
        h('button', { class: 'btn small', type: 'button', onclick: function () { noteSheet(st.key, st.name, null, draw); } }, '+ 메모')));
      if (!list.length) { card.appendChild(h('p', { class: 'small muted', text: '아직 메모가 없어요.' })); return; }
      list.forEach(function (n) {
        card.appendChild(h('button', { type: 'button', class: 'notebox' + (n.pinned ? ' pinned' : ''), onclick: function () { noteSheet(st.key, st.name, n, draw); } },
          h('div', { class: 'chips' }, n.pinned ? h('span', { class: 'chip butter', text: '고정' }) : null, h('span', { class: 'chip', text: n.tag }),
            h('span', { class: 'tiny muted', text: UI.fmtDate(n.date) }),
            n.remindAt && !n.done ? h('span', { class: 'chip coral', text: '상담 예정 ' + UI.fmtDate(n.remindAt) }) : null),
          h('p', { class: 'small', style: 'white-space:pre-wrap;margin-top:4px', text: n.text })));
      });
    }
    draw(notes || []);
    return card;
  }
  function attendanceCard(a) {
    if (!a) return null;
    return h('section', { class: 'card sec', style: 'gap:8px' }, h('h3', { text: '이번 달 출석' }),
      a.total ? h('div', { class: 'chips' }, h('span', { class: 'chip mint', text: '출석 ' + a.present }), h('span', { class: 'chip butter', text: '지각 ' + a.late }),
        h('span', { class: 'chip coral', text: '결석 ' + a.absent }), h('span', { class: 'chip lav', text: '조퇴 ' + a.early }), a.video ? h('span', { class: 'chip navy', text: '영상 ' + a.video }) : null, h('span', { class: 'chip', text: '출석률 ' + a.rate + '%' }))
        : h('p', { class: 'small muted', text: '이번 달 출석 기록이 없어요.' }),
      a.list.map(function (x) { return h('p', { class: 'small', text: UI.fmtDate(x.date) + ' ' + x.label + (x.note ? ' · ' + x.note : '') }); }));
  }

  // ---------- 다른 반·다음 기수로 복사 ----------
  function copySheet(kind, id, title, classId) {
    var t = h('input', { class: 'input', value: title });
    var targets = targetEditor(kind === 'lecture' ? 'lecture' : 'unit', [], null);
    var b = h('button', { class: 'btn primary', type: 'button' }, '복사하기');
    var sh = UI.sheet(kind === 'lecture' ? '숙제 복사' : '차시 복사', h('div', { class: 'form' },
      h('p', { class: 'small muted', text: kind === 'lecture' ? '정답·영역·해설·문제 사진이 모두 복사돼요. 제출 기록은 새로 시작해요.' : '영상·파일·설명이 모두 복사돼요.' }),
      field('제목', t), h('div', { class: 'lbl', text: '대상 반 · 날짜' }), targets.el, b));
    b.addEventListener('click', function () {
      UI.busy(b, async function () {
        var tg = targets.get();
        if (!tg.length) throw new Error('복사할 반을 골라 주세요.');
        var r = await call(kind === 'lecture' ? 'admin.copyLecture' : 'admin.copyUnit', { id: id, title: t.value, targets: tg });
        sh.close(); UI.toast('복사했어요.'); S.classes = null;
        location.hash = kind === 'lecture' ? '#/status/' + enc(r.id) + '/' + enc(tg[0].classId) : '#/unit/' + enc(r.id) + '/' + enc(tg[0].classId);
      }).catch(function (e) { if (e && e.message && !e.code) UI.toast(e.message); });
    });
  }

  // ---------- 정답·영역·해설 한꺼번에 넣기 ----------
  function parseAreas(text) {
    var parts = text.split(/\n|;|\/|,(?=\s*\d)/).map(function (x) { return x.trim(); }).filter(Boolean), out = {}, ranged = false;
    parts.forEach(function (l) {
      var m = l.match(/^(\d{1,3})\s*(?:[-~–]\s*(\d{1,3}))?\s*번?\s*[.:)]?\s+(.+)$/);
      if (m) { ranged = true; for (var i = Number(m[1]); i <= Number(m[2] || m[1]); i++) out[i] = m[3].trim(); }
    });
    if (!ranged) parts.forEach(function (l, i) { out[i + 1] = l; });
    return out;
  }
  function parseExps(text) {
    var out = {}, cur = null, found = false;
    text.split(/\n/).forEach(function (line) {
      var m = line.match(/^\s*(\d{1,3})\s*(?:번|[.)]|:)\s*(.*)$/);
      if (m) { found = true; cur = Number(m[1]); out[cur] = m[2]; }
      else if (cur != null) out[cur] += (out[cur] ? '\n' : '') + line;
    });
    if (!found) text.split(/\n\s*\n/).map(function (x) { return x.trim(); }).filter(Boolean).forEach(function (x, i) { out[i + 1] = x; });
    Object.keys(out).forEach(function (k) { out[k] = String(out[k]).trim(); });
    return out;
  }
  function fillSheet(qs, done) {
    var ans = h('textarea', { class: 'input', placeholder: '순서대로 띄어 쓰기\n예: 3 4+5 렌츠 2 1', style: 'min-height:60px' });
    var area = h('textarea', { class: 'input', placeholder: '번호 범위로: 1-4 산화적 인산화, 5-8 ATP 수지\n또는 한 줄에 하나씩 순서대로', style: 'min-height:70px' });
    var exp = h('textarea', { class: 'input', placeholder: '번호를 붙여 통째로 붙여 넣기\n1. 해설 내용…\n2. 해설 내용…', style: 'min-height:110px' });
    var table = h('textarea', { class: 'input', placeholder: '엑셀·한글 표를 복사해 붙여 넣기\n(번호 · 정답 · 영역 · 해설 순서, 번호 칸은 없어도 돼요)', style: 'min-height:80px' });
    var b = h('button', { class: 'btn primary', type: 'button' }, '채우기');
    function q(i) { while (qs.length < i) qs.push({ type: 'mcq', answer: '', area: '', points: 1, expText: '', expImage: '', qImage: '' }); return qs[i - 1]; }
    function setAns(x, a) { a = String(a).trim(); if (!a) return; x.answer = a; x.type = /^[1-5]([+,][1-5])*$/.test(a) ? 'mcq' : (x.type === 'essay' ? 'essay' : 'short'); if (x.type === 'mcq') x.answer = a.replace(/,/g, '+'); }
    var sh = UI.sheet('정답·영역·해설 한꺼번에 넣기', h('div', { class: 'form' },
      field('정답', ans), field('출제 영역', area, '같은 영역이 이어지면 "1-4 산화적 인산화"처럼 범위로 쓰면 편해요.'),
      field('해설 글', exp, '한글 해설지에서 번호 붙은 해설을 통째로 복사해 붙이면 번호대로 나눠 들어가요.'),
      field('표로 한 번에', table), h('p', { class: 'tiny muted', text: '빈 칸은 건드리지 않아요. 넣은 것만 바뀌어요.' }), b));
    b.addEventListener('click', function () {
      var n = 0;
      ans.value.trim().split(/[\s,]+/).filter(Boolean).forEach(function (a, i) { setAns(q(i + 1), a); n++; });
      var ar = parseAreas(area.value); Object.keys(ar).forEach(function (k) { q(Number(k)).area = ar[k]; n++; });
      var ex = parseExps(exp.value); Object.keys(ex).forEach(function (k) { if (ex[k]) { q(Number(k)).expText = ex[k]; n++; } });
      var idx = 0;
      table.value.split(/\n/).forEach(function (line) {
        if (!line.trim()) return;
        var cells = line.split('\t').map(function (c) { return c.trim(); });
        if (cells.some(function (c) { return /^(번호|문항|정답|영역|해설)$/.test(c); })) return; // 머리글 줄 건너뛰기
        var no;
        if (/^\d{1,3}$/.test(cells[0]) && cells.length > 1) no = Number(cells.shift()); else no = ++idx;
        idx = no;
        var x = q(no);
        if (cells[0]) setAns(x, cells[0]);
        if (cells[1]) x.area = cells[1];
        if (cells[2]) x.expText = cells.slice(2).join(' ');
        n++;
      });
      sh.close(); done(); UI.toast(n ? '채웠어요. 저장을 눌러야 반영돼요.' : '넣은 내용이 없어요.');
    });
  }

  // ---------- 출석부 ----------
  var ATT = [['O', '출석', 'mint'], ['V', '영상', 'navy'], ['L', '지각', 'butter'], ['A', '결석', 'coral'], ['E', '조퇴', 'lav']];
  function tabAttendance(box, c) {
    S.attDate = S.attDate || {};
    var date = S.attDate[c.id] || UI.todayStr();
    function load() {
      box.innerHTML = '';
      loadInto(box, call('admin.attendance', { classId: c.id, date: date }), function (d) {
        date = d.date; S.attDate[c.id] = date;
        var rows = d.students.map(function (s) { return { key: s.key, name: s.name, status: s.status, note: s.note, by: s.by, joinedAt: s.joinedAt, viewedAt: s.viewedAt }; });
        var dsel = h('select', { class: 'input sm', style: 'width:auto;flex:0 0 auto', 'aria-label': '날짜', onchange: function (e) { date = e.target.value; load(); } },
          d.dates.map(function (x) { return h('option', { value: x, selected: x === date, text: UI.fmtDate(x) + (x === UI.todayStr() ? ' 오늘' : '') }); }));
        var dpick = h('input', { class: 'input sm', type: 'date', value: date, style: 'width:auto;flex:0 0 auto', 'aria-label': '다른 날짜', onchange: function (e) { if (e.target.value) { date = e.target.value; load(); } } });
        var qrBtn = h('button', { class: 'btn small', type: 'button', onclick: function () { checkinModal(c, load); } }, icon('qr', 16), 'QR 출석 띄우기');
        var summary = h('div', { class: 'chips' });
        function drawSummary() {
          summary.innerHTML = '';
          ATT.forEach(function (a) { summary.appendChild(h('span', { class: 'chip ' + a[2], text: a[1] + ' ' + rows.filter(function (r) { return r.status === a[0]; }).length })); });
          var none = rows.filter(function (r) { return !r.status; }).length;
          if (none) summary.appendChild(h('span', { class: 'chip', text: '미체크 ' + none }));
        }
        var list = h('section', { class: 'card tight list' });
        function drawRows() {
          list.innerHTML = '';
          if (!rows.length) { list.appendChild(h('p', { class: 'empty', text: '이 반에 학생이 없어요.' })); return; }
          rows.forEach(function (r) {
            var note = h('input', { class: 'input sm', value: r.note || '', placeholder: '사유 (선생님만 봐요)', 'aria-label': r.name + ' 사유', oninput: function (e) { r.note = e.target.value; } });
            var btns = h('div', { class: 'att', role: 'group', 'aria-label': r.name + ' 출결' }, ATT.map(function (a) {
              return h('button', { type: 'button', class: (r.status === a[0] ? 'on ' + a[2] : ''), 'aria-pressed': r.status === a[0] ? 'true' : 'false', text: a[1], onclick: function () {
                r.status = r.status === a[0] ? '' : a[0]; drawRows(); drawSummary();
              } });
            }));
            var extra = [];
            if (r.status && r.status !== 'O' && r.status !== 'V') extra.push(note);
            if (r.status === 'A' || r.status === 'V') extra.push(h('span', { class: 'tiny', style: 'color:var(--navy-ink)', text: '이날 차시 영상·자료가 자동 공개돼요' }));
            if (r.status === 'A' && d.units.length) {
              var us = h('select', { class: 'input sm', style: 'width:auto;max-width:200px', 'aria-label': r.name + ' 보강 차시' }, h('option', { value: '', text: '보강 영상 열기…' }),
                d.units.map(function (u) { return h('option', { value: u.id, text: u.title }); }));
              us.addEventListener('change', function () {
                if (!us.value) return;
                call('admin.makeup', { unitId: us.value, classId: c.id, key: r.key }).then(function () { UI.toast(r.name + '에게 열었어요.'); }, function (e) { UI.toast(e.message); });
              });
              extra.push(us);
            }
            list.appendChild(h('div', { class: 'li', style: 'flex-wrap:wrap' },
              h('div', { style: 'min-width:90px' }, h('div', { class: 'bold' }, r.name, r.by === 'qr' ? h('span', { class: 'chip navy', style: 'margin-left:6px;font-size:10.5px', text: 'QR' }) : null),
                r.viewedAt ? h('div', { class: 'tiny', style: 'color:var(--navy-ink)', text: '영상 봄 ' + UI.fmtDT(r.viewedAt) }) : null),
              h('div', { class: 'inline', style: 'gap:6px;justify-content:flex-end;flex:1' }, btns, memoButton(r)),
              extra.length ? h('div', { class: 'inline', style: 'width:100%;justify-content:flex-end' }, extra) : null));
          });
        }
        var journal = h('textarea', { class: 'input', text: d.journal, placeholder: '오늘 수업에서 한 것 (학생·학부모에게 보여요)\n예: 산화적 인산화 개념, 교재 12~18쪽', style: 'min-height:70px' });
        var save = h('button', { class: 'btn primary', type: 'button' }, '저장');
        save.addEventListener('click', function () {
          UI.busy(save, async function () {
            await call('admin.saveAttendance', { classId: c.id, date: date, rows: rows.map(function (r) { return { key: r.key, status: r.status, note: r.note }; }), journal: journal.value });
            UI.toast('출석과 수업 일지를 저장했어요.');
          }).catch(function () { });
        });
        box.appendChild(h('div', { class: 'inline', style: 'justify-content:space-between' }, h('div', { class: 'inline' }, dsel, dpick), qrBtn));
        if (d.lecture) box.appendChild(h('p', { class: 'small muted', text: '이날 숙제: ' + d.lecture.title + (d.lecture.startTime ? ' · 수업 시작 ' + d.lecture.startTime : '') }));
        box.appendChild(h('div', { class: 'inline', style: 'justify-content:space-between' }, summary,
          h('button', { class: 'btn small', type: 'button', onclick: function () { rows.forEach(function (r) { if (!r.status) r.status = 'O'; }); drawRows(); drawSummary(); } }, '나머지 모두 출석')));
        box.appendChild(list);
        box.appendChild(h('section', { class: 'card sec', style: 'gap:8px' }, h('h3', { text: '수업 일지' }), journal));
        box.appendChild(h('div', { class: 'submitbar' },
          h('button', { class: 'btn small', type: 'button', onclick: function () {
            var abs = rows.filter(function (r) { return r.status === 'A'; }).map(function (r) { return r.name; });
            if (!abs.length) { UI.toast('결석한 학생이 없어요.'); return; }
            copyText(UI.fmtDate(date) + ' ' + c.name + ' 결석: ' + abs.join(', '), '결석 명단을 복사했어요.');
          } }, '결석 명단 복사'), save));
        drawRows(); drawSummary();
      });
    }
    load();
  }
  async function checkinModal(c, onClose) {
    var body = h('div', { class: 'sec', style: 'gap:12px;align-items:center;text-align:center' }, UI.loading('QR을 만드는 중…'));
    var timers = [];
    var sh = UI.sheet(c.name + ' QR 출석', body, { wide: true, sticky: true, noFocus: true, onClose: function () { timers.forEach(clearInterval); onClose(); } });
    try {
      var info = await call('admin.startCheckin', { classId: c.id });
      await UI.loadScript('/js/qrcode.js?v=6');
      var url = location.origin + '/#/checkin/' + info.code;
      var qr = window.qrcode(0, 'M');
      qr.addData(url); qr.make();
      var qrBox = h('div', { class: 'qrbox', 'aria-label': '출석 QR 코드' }, h('img', { src: qr.createDataURL(10, 2), alt: '출석 QR 코드' }));
      body.innerHTML = '';
      body.appendChild(qrBox);
      var left = h('span', { class: 'bold' });
      var who = h('p', { class: 'small muted' });
      body.appendChild(h('div', null, h('div', { style: 'font-size:28px;font-weight:800;letter-spacing:.2em', text: info.code }),
        h('p', { class: 'small muted', text: '카메라로 QR을 찍으면 로그인된 학생은 바로 출석돼요.' + (info.startTime ? ' ' + info.startTime + ' 5분 뒤부터는 지각이에요.' : '') })));
      var countEl = h('div', { class: 'big' });
      body.appendChild(countEl); body.appendChild(who); body.appendChild(left);
      var stop = h('button', { class: 'btn', type: 'button' }, 'QR 닫기');
      stop.addEventListener('click', function () { call('admin.stopCheckin', { classId: c.id }).catch(function () { }); sh.close(); });
      body.appendChild(stop);
      function tick() { var s = Math.max(0, Math.round((info.exp - Date.now()) / 1000)); left.textContent = '남은 시간 ' + Math.floor(s / 60) + '분 ' + (s % 60) + '초'; if (!s) sh.close(); }
      function poll() {
        call('admin.attendance', { classId: c.id, date: info.date }).then(function (d) {
          var inn = d.students.filter(function (s) { return s.status === 'O' || s.status === 'L'; });
          countEl.textContent = inn.length + ' / ' + d.students.length + '명 출석';
          who.textContent = inn.map(function (s) { return s.name + (s.status === 'L' ? '(지각)' : ''); }).join(', ');
        }, function () { });
      }
      tick(); poll();
      timers.push(setInterval(tick, 1000), setInterval(poll, 8000));
    } catch (e) { body.innerHTML = ''; body.appendChild(h('p', { class: 'err', text: e.message })); }
  }

  // ---------- 질문함 ----------
  function viewQuestions() {
    var box = h('div', { class: 'sec', style: 'gap:14px;max-width:860px' });
    page('questions', box);
    var all = false;
    box.appendChild(h('div', { class: 'inline', style: 'justify-content:space-between' }, h('h1', { text: '질문함' }),
      h('label', { class: 'check small' }, h('input', { type: 'checkbox', onchange: function (e) { all = e.target.checked; load(); } }), '답한 질문도 보기')));
    var inner = h('div', { class: 'sec', style: 'gap:12px' });
    box.appendChild(inner);
    function load() {
      inner.innerHTML = '';
      loadInto(inner, call('admin.questions', { all: all }), function (list) {
        if (!list.length) { inner.appendChild(h('div', { class: 'card empty', text: all ? '아직 질문이 없어요.' : '답을 기다리는 질문이 없어요.' })); return; }
        list.forEach(function (q) {
          var ta = h('textarea', { class: 'input', text: q.answer, placeholder: '답변 (학생에게 보여요)', style: 'min-height:70px' });
          var b = h('button', { class: 'btn small primary', type: 'button' }, q.answer ? '답변 고치기' : '답변 보내기');
          b.addEventListener('click', function () { UI.busy(b, async function () { await call('admin.answerQuestion', { id: q.id, answer: ta.value }); UI.toast(q.name + '에게 답했어요.'); load(); }).catch(function () { }); });
          var close = h('button', { class: 'btn small', type: 'button' }, '답 없이 닫기');
          close.addEventListener('click', function () { UI.busy(close, async function () { await call('admin.answerQuestion', { id: q.id, answer: '', close: true }); load(); }).catch(function () { }); });
          inner.appendChild(h('article', { class: 'card sec', style: 'gap:8px' },
            h('div', { class: 'inline', style: 'justify-content:space-between' },
              h('div', null, h('a', { href: '#/student/' + enc(q.key), class: 'bold', style: 'color:inherit', text: q.name }), h('span', { class: 'small muted', text: ' · ' + q.classLabel })),
              h('span', { class: 'chip ' + (q.status === 'open' ? 'butter' : q.status === 'answered' ? 'mint' : ''), text: q.status === 'open' ? '기다리는 중' : q.status === 'answered' ? '답함' : '닫음' })),
            h('p', { class: 'small muted', text: (q.src === 'test' ? '테스트 · ' : '숙제 · ') + q.title + ' · ' + q.no + '번 · ' + UI.fmtDT(q.askedAt) }),
            h('div', { class: 'exp', text: q.text }), ta, h('div', { class: 'btns' }, b, q.status === 'open' ? close : null)));
        });
      });
    }
    load();
  }

  route();
})();

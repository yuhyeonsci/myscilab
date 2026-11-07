// 강사 화면: 홈(학원 → 반) → 반(학생·숙제·테스트·자료실·공지·리포트) → 학생
(function () {
  var h = UI.h, icon = UI.icon, ROLE = 'admin';
  var S = { classes: null, dash: null };
  var NAV = [
    { href: '#/', label: '홈', icon: 'home', key: 'home' },
    { href: '#/students', label: '학생 찾기', icon: 'users', key: 'students' },
    { href: '#/settings', label: '설정', icon: 'gear', key: 'settings' }
  ];
  var TABS = [['students', '학생'], ['hw', '숙제'], ['tests', '테스트'], ['units', '자료실'], ['notices', '공지'], ['report', '리포트']];
  function call(a, d) { return API.call(a, d, ROLE); }
  function logout() { API.setToken(ROLE, ''); S = { classes: null, dash: null }; renderLogin(); }
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
    loadInto(inner, Promise.all([call('admin.dashboard'), classes(true)]), function (r) {
      var d = r[0]; S.dash = d;
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
        h('button', { class: 'btn small', type: 'button', onclick: function () { classSheet(c); } }, '반 고치기')));
      box.appendChild(h('nav', { class: 'tabs', 'aria-label': '반 메뉴' }, TABS.map(function (t) {
        return h('a', { href: '#/class/' + enc(classId) + '/' + t[0], class: t[0] === tab ? 'on' : '', 'aria-current': t[0] === tab ? 'page' : null, text: t[1] });
      })));
      box.appendChild(inner);
      ({ students: tabStudents, hw: tabHw, tests: tabTests, units: tabUnits, notices: tabNotices, report: tabReport }[tab] || tabStudents)(inner, c);
    });
  }
  function tabStudents(box, c) {
    loadInto(box, Promise.all([call('admin.students'), call('admin.classReport', { classId: c.id }), S.dash ? Promise.resolve(S.dash) : call('admin.dashboard')]), function (r) {
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
            h('div', { class: 'small muted', text: s.school + ' ' + s.grade + ' · ' + (s.pinSet ? '비밀번호 학생이 정함' : '임시 비밀번호 ' + s.pin) })), chip);
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
    var q = h('input', { class: 'input', type: 'search', placeholder: '이름이나 학교로 찾기', 'aria-label': '학생 찾기' });
    var list = h('div');
    box.appendChild(q); box.appendChild(list);
    loadInto(list, call('admin.students'), function (all) {
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
      q.addEventListener('input', draw);
      draw();
    });
  }

  // ===================== 공개 대상(반·날짜) 고르기 =====================
  // kind: lecture(date,startTime) | test(date) | unit(from,to,students) | notice(from,to)
  function targetEditor(kind, initial, defaultClassId) {
    var wrap = h('div', { class: 'sec', style: 'gap:8px' });
    var state = {};
    (initial || []).forEach(function (t) { state[t.classId] = JSON.parse(JSON.stringify(t)); });
    if (!initial || !initial.length) {
      var today = UI.todayStr();
      if (defaultClassId) state[defaultClassId] = kind === 'lecture' ? { classId: defaultClassId, date: today, startTime: '' } : kind === 'test' ? { classId: defaultClassId, date: today } : { classId: defaultClassId, from: today, to: '', students: {} };
    }
    var groups = {}, order = [];
    (S.classes || []).forEach(function (c) { var k = c.academy || '기타'; if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(c); });
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
    // 차시: 학생별로 보이기·숨기기 (기본은 입반일 기준)
    function overridePanel(c, t) {
      t.students = t.students || {};
      var n = Object.keys(t.students).length;
      var panel = h('div', { class: 'sec hidden', style: 'gap:6px;width:100%' });
      var btn = h('button', { class: 'btn small', type: 'button' }, '학생별 설정' + (n ? ' (예외 ' + n + '명)' : ''));
      btn.addEventListener('click', function () {
        panel.classList.toggle('hidden');
        if (panel.dataset.loaded) return;
        panel.dataset.loaded = '1';
        panel.appendChild(UI.loading());
        call('admin.classStudents', { classId: c.id }).then(function (list) {
          panel.innerHTML = '';
          panel.appendChild(h('p', { class: 'tiny muted', text: '기본: 시작 날짜보다 늦게 들어온 학생(중도 입반)은 안 보여요. 학생마다 바꿀 수 있어요.' }));
          list.forEach(function (s) {
            var def = !s.joinedAt || !t.from || s.joinedAt <= t.from;
            var cur = t.students[s.key];
            var sel = h('select', { class: 'input sm', style: 'width:auto', 'aria-label': s.name + ' 공개 설정', onchange: function (e) {
              if (e.target.value === '') delete t.students[s.key]; else t.students[s.key] = e.target.value === '1';
              var k = Object.keys(t.students).length; btn.textContent = '학생별 설정' + (k ? ' (예외 ' + k + '명)' : '');
            } },
              h('option', { value: '', selected: cur === undefined, text: '기본 (' + (def ? '보임' : '안 보임') + ')' }),
              h('option', { value: '1', selected: cur === true, text: '보이기' }),
              h('option', { value: '0', selected: cur === false, text: '숨기기' }));
            panel.appendChild(h('div', { class: 'inline', style: 'justify-content:space-between' },
              h('span', { class: 'small' }, s.name, s.joinedAt ? h('span', { class: 'muted', text: ' · ' + UI.fmtDate(s.joinedAt) + ' 입반' }) : null), sel));
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
    loadInto(box, call('admin.lectures', { classId: c.id }), function (d) {
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
        h('div', { class: 'btns' }, h('a', { class: 'btn small', href: '#/lecture/' + enc(id) + '/' + enc(classId) }, '수정'), regrade, del)));
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
      root.appendChild(h('section', { class: 'card sec', style: 'gap:10px' }, h('h3', { text: '어느 반에, 언제' }),
        h('p', { class: 'tiny muted', text: '날짜가 되면 학생에게 열리고, 같은 반의 다음 숙제 수업 시작 시각이 마감이에요.' }), targets.el));
      root.appendChild(h('section', { class: 'sec', style: 'gap:10px' }, h('div', { class: 'sec-h', text: '문항' }),
        h('div', { class: 'card sec', style: 'gap:10px' },
          h('div', { class: 'inline' }, h('span', { class: 'small' }, '문항 수'), countIn, applyBtn),
          h('div', { class: 'inline', style: 'align-items:flex-start' }, quick, quickBtn),
          h('p', { class: 'tiny muted', text: '객관식 정답이 두 개 이상이면 4+5처럼 써요. 학생도 모두 골라야 정답이에요.' }),
          h('div', { class: 'btns' }, cropBtn, bulkBtn, bulkIn),
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
    loadInto(box, call('admin.tests', { classId: c.id }), function (list) {
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
      root.appendChild(h('section', { class: 'card sec', style: 'gap:10px' }, h('h3', { text: '어느 반에, 언제' }), targets.el));
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
    loadInto(box, call('admin.units', { classId: c.id }), function (list) {
      box.appendChild(h('div', { class: 'inline', style: 'justify-content:space-between' }, h('span', { class: 'small muted', text: '차시 ' + list.length + '개 · 영상과 자료를 차시로 묶어 한 번에 공개해요' }),
        h('a', { class: 'btn small primary', href: '#/unit/new/' + enc(c.id) }, '+ 차시 만들기')));
      if (!list.length) { box.appendChild(h('div', { class: 'card empty', text: '아직 차시가 없어요.' })); return; }
      box.appendChild(h('div', { class: 'sec' }, list.map(function (u) {
        return h('a', { class: 'row', href: '#/unit/' + enc(u.id) + '/' + enc(c.id) },
          h('div', null, h('div', { class: 't', text: u.title }),
            h('div', { class: 's', text: range(u.from, u.to) + ' · 영상 ' + u.videos + ' · 파일 ' + u.files + (u.overrides ? ' · 학생별 예외 ' + u.overrides + '명' : '') + (u.sharedWith.length ? ' · 같이: ' + u.sharedWith.join(', ') : '') })),
          h('div', { class: 'chips', style: 'justify-content:flex-end' }, stateChip(u.state), u.files ? h('span', { class: 'chip', text: '받음 ' + u.got + '/' + u.allowed }) : null));
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
      var targets = targetEditor('unit', U.targets, classId);
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
          var r = await call('admin.saveUnit', { id: isNew ? '' : id, title: title.value, memo: memo.value, videos: videos, files: files, targets: targets.get() });
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
        isNew ? null : h('a', { class: 'btn small', href: '#/log/' + enc(id) + '/' + enc(classId) }, '받은 기록')));
      root.appendChild(h('section', { class: 'card form' }, field('제목', title), field('설명', memo)));
      root.appendChild(h('section', { class: 'card sec', style: 'gap:10px' }, h('h3', { text: '영상' }), vbox));
      root.appendChild(h('section', { class: 'card sec', style: 'gap:10px' }, h('h3', { text: '수업 자료 파일' }), fbox));
      root.appendChild(h('section', { class: 'card sec', style: 'gap:10px' }, h('h3', { text: '어느 반에, 언제부터' }), targets.el));
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
      if (!d.files.length) { box.appendChild(h('div', { class: 'card empty', text: '이 차시에는 파일이 없어요.' })); return; }
      box.appendChild(h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
        h('thead', null, h('tr', null, h('th', { class: 'sticky', text: '이름' }), h('th', { text: '볼 수 있음' }), d.files.map(function (f) { return h('th', { text: f.fileName }); }))),
        h('tbody', null, d.rows.map(function (x) {
          return h('tr', null, h('td', { class: 'sticky bold', text: x.name }), h('td', { text: x.allowed ? '예' : '아니요' }),
            x.files.map(function (f) { return h('td', { class: 'small', text: f.count ? UI.fmtDT(f.first) + (f.count > 1 ? ' 외 ' + (f.count - 1) + '번' : '') : '–' }); }));
        })))));
    });
  }

  // ===================== 공지 =====================
  function tabNotices(box, c) {
    loadInto(box, call('admin.notices', { classId: c.id }), function (list) {
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
      root.appendChild(h('section', { class: 'card sec', style: 'gap:10px' }, h('h3', { text: '어느 반에, 언제까지' }), targets.el));
      root.appendChild(h('div', { class: 'submitbar' }, del || h('span'), save));
      box.innerHTML = ''; box.appendChild(root);
      drawImg();
    });
  }

  // ===================== 반 리포트 =====================
  function tabReport(box, c) {
    loadInto(box, call('admin.classReport', { classId: c.id }), function (d) {
      box.appendChild(h('div', { class: 'sec-h', text: '학생별 (평균 높은 순)' }));
      box.appendChild(h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
        h('thead', null, h('tr', null, [['이름', 'sticky'], ['낸 숙제', 'num'], ['미제출', 'num'], ['평균', 'num'], ['최근', 'num']].map(function (t) { return h('th', { class: t[1], text: t[0] }); }))),
        h('tbody', null, d.rows.map(function (x) {
          return h('tr', null, h('td', { class: 'sticky bold' }, h('a', { href: '#/student/' + enc(x.key), text: x.name, style: 'color:inherit' })),
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
      cl.forEach(function (c) { var k = c.academy || '기타'; if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(c); });
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
            h('div', { class: 'inline' }, h('button', { class: 'btn small', type: 'button', onclick: function () { classSheet(c); } }, '고치기'), del)));
        });
      });
      inner.appendChild(cbox);
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

  route();
})();

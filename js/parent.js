// 학부모 화면: 교재 뒤 QR → 학부모 코드 입력 → 우리 아이 월별 리포트 (읽기 전용)
(function () {
  var h = UI.h, icon = UI.icon, ROLE = 'parent';
  var S = { who: null, month: '' };
  var NAV = [
    { href: '#/', label: '리포트', icon: 'chart', key: 'report' },
    { href: '#/notices', label: '공지', icon: 'bell', key: 'notices' }
  ];
  function call(a, d) { return API.call(a, d, ROLE); }
  function loadWho() { try { S.who = JSON.parse(localStorage.getItem('msl_parent_who') || 'null'); } catch (e) { S.who = null; } }
  function saveWho(st) {
    S.who = [(st.academy ? st.academy + ' · ' : '') + (st.className || ''), st.name + ' 학부모님'];
    try { localStorage.setItem('msl_parent_who', JSON.stringify(S.who)); } catch (e) { }
  }
  function logout() {
    API.setToken(ROLE, '');
    try { localStorage.removeItem('msl_parent_who'); } catch (e) { }
    S.who = null;
    renderLogin();
  }
  function page(active, content) { UI.mount(UI.shell({ nav: NAV, active: active, who: S.who, content: content, onLogout: logout, brandHref: '#/' })); window.scrollTo(0, 0); }
  window.addEventListener('auth-lost', function (e) { if (e.detail.role === ROLE) { UI.toast('다시 로그인해 주세요.'); renderLogin(); } });
  window.addEventListener('hashchange', route);
  function route() {
    if (!API.getToken(ROLE)) return renderLogin();
    var p = location.hash.replace(/^#\/?/, '').split('/');
    if (p[0] === 'notices') return viewNotices();
    return viewReport();
  }

  function renderLogin() {
    var code = h('input', { class: 'input pin', id: 'pc', autocomplete: 'off', autocapitalize: 'characters', maxlength: '9', placeholder: 'ABCD-1234', style: 'text-transform:uppercase;letter-spacing:.2em' });
    var err = h('p', { class: 'err', role: 'alert' });
    var btn = h('button', { class: 'btn primary block', type: 'submit' }, '리포트 보기');
    UI.mount(h('div', { class: 'auth' }, h('div', { class: 'box' },
      h('div', { class: 'brand' }, h('div', { class: 'logo', text: '유' }), window.APP_CONFIG.TITLE),
      h('p', { class: 'lead', text: '학부모 리포트' }),
      h('form', { class: 'card form', onsubmit: function (e) {
        e.preventDefault(); err.textContent = '';
        UI.busy(btn, async function () {
          var r = await API.call('parent.login', { code: code.value });
          API.setToken(ROLE, r.token);
          saveWho(r.student);
          location.hash = '#/';
          route();
        }).catch(function (e) { err.textContent = e.message; });
      } },
        h('div', { class: 'field' }, h('label', { for: 'pc', text: '학부모 코드 (8자리)' }), code),
        err, btn,
        h('p', { class: 'small muted', text: '코드는 자녀의 학생 화면 → 내 기록 → 학부모 코드에 있어요. 한 번 넣으면 이 기기에서 30일 동안 다시 묻지 않아요.' })),
      h('div', { class: 'inline', style: 'justify-content:center' }, UI.themeButton()))));
    setTimeout(function () { code.focus(); }, 30);
  }

  function monthLabel(m) { var p = m.split('-'); return p[0] + '년 ' + Number(p[1]) + '월'; }
  function statusChip(x) {
    if (x.status === 'missing') return h('span', { class: 'chip coral', text: '미제출' });
    if (x.status === 'todo') return h('span', { class: 'chip', text: '진행 중' });
    if (x.pending && x.pct == null) return h('span', { class: 'chip butter', text: '채점 중' });
    return h('span', { class: 'chip ' + (x.status === 'late' ? 'butter' : 'mint'), text: (x.pct != null ? x.pct + '점' : '제출') + (x.status === 'late' ? ' · 늦게' : '') });
  }
  function viewReport() {
    var box = h('div', { class: 'sec', style: 'gap:16px' });
    page('report', box);
    draw();
    function draw() {
      box.innerHTML = '';
      box.appendChild(UI.loading());
      call('parent.report', { month: S.month }).then(function (r) {
        box.innerHTML = '';
        saveWho(r.student);
        S.month = r.month;
        var sel = h('select', { class: 'input sm', 'aria-label': '월 고르기', style: 'width:auto;flex:0 0 auto', onchange: function (e) { S.month = e.target.value; draw(); } },
          r.months.map(function (m) { return h('option', { value: m, selected: m === r.month, text: monthLabel(m) }); }));
        box.appendChild(h('div', { class: 'inline', style: 'justify-content:space-between' },
          h('div', null, h('h1', { text: r.student.name + ' 리포트' }), h('p', { class: 'small muted', text: [r.student.school, r.student.academy, r.student.className].filter(Boolean).join(' · ') })), sel));
        var m = r.summary.month, o = r.summary.overall;
        var tiles = h('div', { class: 'grid2', style: 'grid-template-columns:repeat(auto-fill,minmax(min(100%,150px),1fr))' },
          tile('coral', '숙제 제출률', m.rate == null ? '–' : m.rate + '%', m.due ? m.done + ' / ' + m.due + '개 제출' : '이번 달 마감된 숙제 없음'),
          tile('mint', '숙제 평균', m.avg == null ? '–' : m.avg + '점', '전체 평균 ' + (o.avg == null ? '–' : o.avg + '점')),
          tile('navy', '진도', r.progress.lecturesOpened + ' / ' + r.progress.lecturesTotal, '숙제 기준' + (r.progress.unitsTotal ? ' · 수업 ' + r.progress.unitsOpened + '/' + r.progress.unitsTotal : '')),
          tile('butter', '출석률', r.attendance.rate == null ? '–' : r.attendance.rate + '%', r.attendance.total ? '출석 ' + r.attendance.present + ' · 지각 ' + r.attendance.late + ' · 결석 ' + r.attendance.absent : '이번 달 출석 기록 없음'));
        box.appendChild(tiles);
        var colA = h('div', { class: 'col-a' }), colB = h('div', { class: 'col-b' });
        if (r.comment) colA.appendChild(h('section', { class: 'card tint lav' }, h('div', { class: 'k', text: '선생님 한마디' }), h('p', { style: 'margin-top:6px;white-space:pre-wrap', text: r.comment })));
        colA.appendChild(h('section', { class: 'sec' }, h('div', { class: 'sec-h', text: monthLabel(r.month) + ' 숙제' + (m.missing ? ' · 미제출 ' + m.missing + '개' : '') }),
          r.homework.length ? h('div', { class: 'card tight list' }, r.homework.map(function (x) {
            return h('div', { class: 'li' }, h('div', null, h('div', { class: 'bold', text: x.title }), h('div', { class: 'small muted', text: UI.fmtDate(x.date) + (x.deadline ? ' · 마감 ' + UI.fmtDT(x.deadline) : '') })), statusChip(x));
          })) : h('div', { class: 'card empty', text: '이번 달 숙제가 없어요.' })));
        colA.appendChild(h('section', { class: 'sec' }, h('div', { class: 'sec-h', text: monthLabel(r.month) + ' 수업 테스트' }),
          r.testsInMonth.length ? h('div', { class: 'card tight list' }, r.testsInMonth.map(function (t) {
            return h('div', { class: 'li' }, h('div', null, h('div', { class: 'bold', text: t.title }), h('div', { class: 'small muted', text: UI.fmtDate(t.date) })),
              h('span', { class: 'chip ' + (t.absent ? '' : 'navy'), text: t.absent ? '결석' : t.score + ' / ' + t.max }));
          })) : h('div', { class: 'card empty', text: '이번 달 테스트 기록이 없어요.' })));
        if (r.trend.length > 1) colB.appendChild(spark('숙제 점수 흐름', r.trend));
        if (r.tests.length > 1) colB.appendChild(spark('테스트 점수 흐름', r.tests));
        if (r.areas.length) colB.appendChild(h('section', { class: 'card sec', style: 'gap:10px' }, h('h3', { text: '보완하면 좋은 영역' }),
          r.areas.map(function (a) {
            return h('div', { class: 'area-row' }, h('span', { text: a.area }), h('div', { class: 'bar mint' }, h('i', { style: 'width:' + (a.pct || 0) + '%' })), h('span', { class: 'pct', text: (a.pct || 0) + '%' }));
          })));
        if (r.attendance.list.length) colB.appendChild(h('section', { class: 'card sec', style: 'gap:6px' }, h('h3', { text: '지각·결석·조퇴' }),
          r.attendance.list.map(function (x) { return h('p', { class: 'small', text: UI.fmtDate(x.date) + ' ' + x.label }); })));
        if (r.journals.length) colA.appendChild(h('section', { class: 'sec' }, h('div', { class: 'sec-h', text: monthLabel(r.month) + ' 수업 일지' }),
          h('div', { class: 'card tight list' }, r.journals.slice().reverse().map(function (j) {
            return h('div', { class: 'li', style: 'align-items:flex-start' }, h('div', null, h('div', { class: 'small muted', text: UI.fmtDate(j.date) }), h('div', { class: 'small', style: 'white-space:pre-wrap', text: j.text })));
          }))));
        if (r.recentMissing.length) colB.appendChild(h('section', { class: 'card sec', style: 'gap:6px' }, h('h3', { text: '최근 미제출' }),
          r.recentMissing.map(function (x) { return h('p', { class: 'small', text: UI.fmtDate(x.date) + ' · ' + x.title }); })));
        box.appendChild(h('div', { class: 'cols' }, colA, colB));
      }, function (e) { box.innerHTML = ''; if (!(e && (e.code === 'AUTH' || e.code === 'EXPIRED'))) box.appendChild(UI.errorBox(e, draw)); });
    }
  }
  function tile(color, k, v, s) {
    return h('div', { class: 'card tint ' + color, style: 'padding:14px 16px' }, h('div', { class: 'k', text: k }),
      h('div', { class: 'big', style: 'margin-top:2px', text: v }), h('div', { class: 'tiny', style: 'margin-top:2px;opacity:.85', text: s }));
  }
  function spark(title, rows) {
    var last = rows[rows.length - 1];
    return h('section', { class: 'card sec', style: 'gap:8px' },
      h('div', { class: 'inline', style: 'justify-content:space-between' }, h('h3', { text: title }), h('span', { class: 'small muted', text: '최근 ' + (last.pct || 0) + '점' })),
      h('div', { class: 'spark', role: 'img', 'aria-label': title + ': ' + rows.map(function (x) { return (x.pct || 0) + '점'; }).join(', ') },
        rows.map(function (x, i) { return h('div', { class: i === rows.length - 1 ? 'last' : '', title: UI.fmtDate(x.date) + ' ' + x.title + ' ' + (x.pct || 0) + '점', style: 'height:' + Math.max(4, x.pct || 0) + '%' }); })),
      h('div', { class: 'inline tiny muted', style: 'justify-content:space-between' }, h('span', { text: UI.fmtDate(rows[0].date) }), h('span', { text: UI.fmtDate(last.date) })));
  }
  function viewNotices() {
    var box = h('div', { class: 'sec', style: 'gap:12px' });
    page('notices', box);
    box.appendChild(h('h1', { text: '공지' }));
    var inner = h('div', { class: 'sec', style: 'gap:12px' });
    box.appendChild(inner);
    inner.appendChild(UI.loading());
    call('parent.notices').then(function (list) {
      inner.innerHTML = '';
      if (!list.length) { inner.appendChild(h('div', { class: 'card empty', text: '지금 걸린 공지가 없어요.' })); return; }
      list.forEach(function (n) {
        inner.appendChild(h('article', { class: 'card sec', style: 'gap:8px' },
          h('div', { class: 'inline' }, n.pinned ? h('span', { class: 'chip lav', text: '고정' }) : null, h('h2', { text: n.title })),
          h('p', { class: 'small muted', text: UI.fmtDate(n.from) + (n.to ? ' ~ ' + UI.fmtDate(n.to) : '') }),
          n.body ? h('p', { style: 'white-space:pre-wrap', text: n.body }) : null,
          n.linkUrl ? h('a', { class: 'btn small', href: n.linkUrl, target: '_blank', rel: 'noopener', text: n.linkLabel || '링크 열기', style: 'align-self:flex-start' }) : null));
      });
    }, function (e) { inner.innerHTML = ''; inner.appendChild(UI.errorBox(e, viewNotices)); });
  }
  loadWho();
  route();
})();

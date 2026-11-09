// 화면 공통 도구: 요소 만들기, 아이콘, 틀(왼쪽 메뉴·아래 탭), 팝업, 알림, 날짜, 다크 모드
(function () {
  function h(tag, props) {
    var el = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v; // 아이콘 같은 고정 문자열에만 사용
      else if (k === 'style') el.setAttribute('style', v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'multiple') el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); return; }
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }

  var P = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  var ICONS = {
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    hw: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
    folder: '<path d="M4 5a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    bell: '<path d="M4 11v2a1 1 0 0 0 1 1h2l5 4V6L7 10H5a1 1 0 0 0-1 1z"/><path d="M16 9a4 4 0 0 1 0 6"/>',
    right: '<path d="M9 6l6 6-6 6"/>', left: '<path d="M15 6l-6 6 6 6"/>',
    moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    auto: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
    out: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"/>',
    down: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z" fill="currentColor"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M14 9l2 2"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    note: '<path d="M5 4h10l4 4v12H5z"/><path d="M9 12h6M9 16h4"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v7h-7"/>'
  };
  function icon(name, size) {
    var s = h('span', { 'aria-hidden': 'true', style: 'display:inline-flex' });
    s.innerHTML = '<svg width="' + (size || 20) + '" height="' + (size || 20) + '" viewBox="0 0 24 24" ' + P + '>' + (ICONS[name] || '') + '</svg>';
    return s;
  }

  // ---------- 다크 모드: 자동(기기 설정) → 라이트 → 다크 ----------
  var THEME_KEY = 'msl_theme';
  function themeGet() { try { return localStorage.getItem(THEME_KEY) || ''; } catch (e) { return ''; } }
  function themeApply() {
    var t = themeGet();
    if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
  }
  function themeCycle() {
    var order = ['', 'light', 'dark'], t = themeGet();
    var next = order[(order.indexOf(t) + 1) % 3];
    try { if (next) localStorage.setItem(THEME_KEY, next); else localStorage.removeItem(THEME_KEY); } catch (e) { }
    themeApply();
    toast(next === 'light' ? '밝은 화면' : next === 'dark' ? '어두운 화면' : '기기 설정 따라가기');
    document.querySelectorAll('[data-theme-btn]').forEach(function (b) { b.replaceWith(themeButton()); });
  }
  function themeButton() {
    var t = themeGet();
    return h('button', { class: 'iconbtn', type: 'button', 'data-theme-btn': '1', 'aria-label': '화면 밝기: ' + (t === 'light' ? '밝게' : t === 'dark' ? '어둡게' : '자동'), onclick: themeCycle },
      icon(t === 'light' ? 'sun' : t === 'dark' ? 'moon' : 'auto', 18));
  }
  themeApply();

  // ---------- 틀 ----------
  // opts: { nav:[{href,label,icon,key}], active, who:[작은줄, 굵은줄], brandHref, content, onLogout, extraFoot }
  function shell(opts) {
    var navLinks = function (cls) {
      return opts.nav.map(function (n) {
        return h('a', { href: n.href, class: n.key === opts.active ? 'on' : '', 'aria-current': n.key === opts.active ? 'page' : null }, icon(n.icon, 22), n.label);
      });
    };
    var who = opts.who ? h('div', { class: 'who' }, opts.who[0], h('br'), h('b', { text: opts.who[1] })) : null;
    var side = h('aside', { class: 'side' },
      h('a', { class: 'brand', href: opts.brandHref || '#/' }, h('div', { class: 'logo', text: '유' }), window.APP_CONFIG.TITLE),
      h('nav', { 'aria-label': '메뉴' }, navLinks()),
      h('div', { class: 'foot' },
        opts.who ? h('div', null, opts.who[0], h('br'), h('b', { text: opts.who[1] })) : null,
        h('div', { class: 'inline' }, themeButton(),
          opts.onLogout ? h('button', { class: 'btn small', type: 'button', onclick: opts.onLogout }, icon('out', 16), '로그아웃') : null)));
    var top = h('header', { class: 'topbar' },
      h('a', { class: 'brand', href: opts.brandHref || '#/' }, h('div', { class: 'logo', text: '유' }), window.APP_CONFIG.TITLE),
      who);
    var main = h('main', { class: 'main', id: 'main' }, top, opts.content);
    var tab = h('nav', { class: 'tabbar', 'aria-label': '메뉴', style: '--tabs:' + opts.nav.length }, navLinks());
    return h('div', { class: 'layout' }, side, main, tab);
  }

  function mount(node) {
    var root = document.getElementById('app');
    root.innerHTML = '';
    root.appendChild(node);
  }

  // ---------- 알림·팝업 ----------
  var toastTimer;
  function toast(msg, ms) {
    var old = document.querySelector('.toast');
    if (old) old.remove();
    var t = h('div', { class: 'toast', role: 'status', text: msg });
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.remove(); }, ms || 2600);
  }
  function sheet(title, body, opts) {
    opts = opts || {};
    var prevFocus = document.activeElement;
    var close = function () { dim.remove(); document.removeEventListener('keydown', onKey); if (prevFocus && prevFocus.focus) prevFocus.focus(); if (opts.onClose) opts.onClose(); };
    var onKey = function (e) { if (e.key === 'Escape') close(); };
    var box = h('div', { class: 'sheet' + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'sheet-h' }, h('h2', { text: title }),
        h('button', { class: 'iconbtn', type: 'button', 'aria-label': '닫기', onclick: close }, icon('x', 18))),
      body);
    var dim = h('div', { class: 'dim', onclick: function (e) { if (e.target === dim && !opts.sticky) close(); } }, box);
    document.body.appendChild(dim);
    document.addEventListener('keydown', onKey);
    setTimeout(function () { var f = box.querySelector('input,textarea,select'); if (f && !opts.noFocus) f.focus(); }, 30);
    return { close: close, el: box };
  }
  function confirmBox(msg, okLabel, danger) {
    return new Promise(function (resolve) {
      var done = false;
      var s = sheet('확인', h('div', { class: 'form' },
        h('p', { text: msg, style: 'white-space:pre-wrap' }),
        h('div', { class: 'btns grow' },
          h('button', { class: 'btn', type: 'button', onclick: function () { done = true; s.close(); resolve(false); } }, '취소'),
          h('button', { class: 'btn primary' + (danger ? ' danger' : ''), type: 'button', onclick: function () { done = true; s.close(); resolve(true); } }, okLabel || '확인'))),
      { onClose: function () { if (!done) resolve(false); } });
    });
  }
  function loading(text) { return h('div', { class: 'loading' }, h('div', { class: 'spin' }), text || '불러오는 중…'); }
  function errorBox(e, retry) {
    return h('div', { class: 'card empty' }, h('p', { text: (e && e.message) || '문제가 생겼어요.' }),
      retry ? h('button', { class: 'btn small', type: 'button', style: 'margin-top:12px', onclick: retry }, '다시 시도') : null);
  }
  // 버튼을 누르는 동안 막아 두고, 오류는 알림으로
  async function busy(btn, fn) {
    if (btn && btn.disabled) return;
    var label = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; }
    try { return await fn(); }
    catch (e) { if (!(e && (e.code === 'AUTH' || e.code === 'EXPIRED'))) toast((e && e.message) || '문제가 생겼어요.', 3500); throw e; }
    finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = label; } }
  }

  // ---------- 날짜·숫자 ----------
  var DOW = ['일', '월', '화', '수', '목', '금', '토'];
  function todayStr() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function parseYmd(s) { var p = String(s || '').split('-'); return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])); }
  function fmtDate(s) {
    if (!s) return '';
    var d = parseYmd(s.slice(0, 10));
    if (isNaN(d)) return s;
    return (d.getMonth() + 1) + '/' + d.getDate() + '(' + DOW[d.getDay()] + ')';
  }
  function fmtDT(s) { if (!s) return ''; return fmtDate(s.slice(0, 10)) + (s.length > 10 ? ' ' + s.slice(11, 16) : ''); }
  function daysUntil(s) { return Math.round((parseYmd(s) - parseYmd(todayStr())) / 86400000); }
  function dday(s) { var n = daysUntil(s); return n === 0 ? 'D-day' : n > 0 ? 'D-' + n : 'D+' + (-n); }
  function size(n) { n = Number(n) || 0; return n > 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB'; }
  function pct(score, max) { return max ? Math.round(score / max * 100) : 0; }

  // ---------- 파일 ----------
  function readDataUrl(file) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsDataURL(file); });
  }
  // 이미지 파일/캔버스 → 줄인 JPEG dataURL
  function shrinkImage(src, maxW, quality) {
    return new Promise(function (res, rej) {
      function fromCanvas(c) {
        var w = c.width, hgt = c.height, s = Math.min(1, (maxW || 1400) / w);
        var out = document.createElement('canvas');
        out.width = Math.round(w * s); out.height = Math.round(hgt * s);
        var g = out.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, out.width, out.height);
        g.drawImage(c, 0, 0, out.width, out.height);
        res(out.toDataURL('image/jpeg', quality || 0.86));
      }
      if (src instanceof HTMLCanvasElement) return fromCanvas(src);
      readDataUrl(src).then(function (url) {
        var img = new Image();
        img.onload = function () { var c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); fromCanvas(c); };
        img.onerror = rej;
        img.src = url;
      }, rej);
    });
  }
  function loadScript(src) {
    return new Promise(function (res, rej) {
      if (document.querySelector('script[src="' + src + '"]')) return res();
      var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('도구를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.')); };
      document.head.appendChild(s);
    });
  }

  window.UI = {
    h: h, icon: icon, shell: shell, mount: mount, toast: toast, sheet: sheet, confirm: confirmBox, loading: loading, errorBox: errorBox, busy: busy,
    themeButton: themeButton, todayStr: todayStr, fmtDate: fmtDate, fmtDT: fmtDT, dday: dday, daysUntil: daysUntil, size: size, pct: pct,
    readDataUrl: readDataUrl, shrinkImage: shrinkImage, loadScript: loadScript, parseYmd: parseYmd, pad: pad
  };
})();

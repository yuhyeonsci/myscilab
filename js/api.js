// 서버(Apps Script) 연결. 모든 요청은 POST { action, token, data } — text/plain이라 사전 확인(preflight) 없이 바로 감.
// 구글이 응답을 script.googleusercontent.com으로 넘겨주면 fetch가 알아서 따라가요.
(function () {
  var MSG = {
    AUTH: '다시 로그인해 주세요.',
    EXPIRED: '로그인 시간이 지났어요. 다시 로그인해 주세요.',
    NOT_OPEN: '아직 열리지 않았어요.',
    NOT_FOUND: '찾을 수 없어요. 새로고침해 보세요.',
    LOCKED: '여러 번 틀려서 잠시 잠겼어요. 조금 뒤에 다시 해 주세요.',
    NETWORK: '서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 해 주세요.'
  };
  function ApiError(code, message) { this.code = code; this.message = message || MSG[code] || code; }
  ApiError.prototype = Object.create(Error.prototype);

  function key(role) { return 'msl_token_' + role; }
  function getToken(role) { try { return localStorage.getItem(key(role)) || ''; } catch (e) { return ''; } }
  function setToken(role, t) {
    try { if (t) localStorage.setItem(key(role), t); else localStorage.removeItem(key(role)); } catch (e) { }
  }

  // 한 번 받은 응답을 폰에 저장해 두고 다음에 바로 보여 줌 (뒤에서 새로 받아 바꿈)
  function ckey(role, action, data) { return 'msl_c_' + role + ':' + action + ':' + JSON.stringify(data || {}); }
  function peek(role, action, data) {
    try { var s = localStorage.getItem(ckey(role, action, data)); return s ? JSON.parse(s) : null; } catch (e) { return null; }
  }
  function store(role, action, data, value) {
    try { localStorage.setItem(ckey(role, action, data), JSON.stringify(value)); } catch (e) { clearCache(role); }
  }
  function clearCache(role) {
    try {
      var pre = 'msl_c_' + (role ? role + ':' : ''), del = [];
      for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf(pre) === 0) del.push(k); }
      del.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) { }
  }

  async function call(action, data, role, opts) {
    var res;
    try {
      res = await fetch(window.APP_CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: action, token: role ? getToken(role) : '', data: data || {} }),
        redirect: 'follow'
      });
    } catch (e) { throw new ApiError('NETWORK'); }
    if (!res.ok) throw new ApiError('NETWORK');
    var j;
    try { j = await res.json(); } catch (e) { throw new ApiError('NETWORK'); }
    if (j.ok) { if (opts && opts.cache && role) store(role, action, data, j.data); return j.data; }
    var code = j.error || 'NETWORK';
    if (role && (code === 'AUTH' || code === 'EXPIRED')) {
      setToken(role, '');
      clearCache(role);
      window.dispatchEvent(new CustomEvent('auth-lost', { detail: { role: role, code: code } }));
    }
    throw new ApiError(code, j.message || MSG[code] || code);
  }

    // 화면 채우기: 저장된 게 있으면 바로 그리고, 새로 받은 내용이 다르면 다시 그림
  // reqs: [[action, data], ...]  fill(results 배열, fromCache)
  function live(box, role, reqs, fill, onError) {
    var token = {};
    box._live = token;
    var cached = reqs.map(function (r) { return peek(role, r[0], r[1]); });
    var hasCache = cached.every(function (x) { return x !== null; });
    if (hasCache) { box.innerHTML = ''; fill(cached, true); }
    else { box.innerHTML = ''; box.appendChild(window.UI ? UI.loading() : document.createTextNode('…')); }
    Promise.all(reqs.map(function (r) { return call(r[0], r[1], role, { cache: true }); })).then(function (fresh) {
      if (box._live !== token || !box.isConnected) return;
      if (hasCache && JSON.stringify(fresh) === JSON.stringify(cached)) return;
      box.innerHTML = '';
      fill(fresh, false);
    }, function (e) {
      if (box._live !== token || !box.isConnected) return;
      if (e && (e.code === 'AUTH' || e.code === 'EXPIRED')) return;
      if (hasCache) { if (window.UI) UI.toast('새 내용을 못 받아왔어요. 저장된 내용을 보여 주고 있어요.'); return; }
      box.innerHTML = '';
      if (onError) onError(e);
    });
  }

  window.API = { call: call, getToken: getToken, setToken: setToken, ApiError: ApiError, peek: peek, clearCache: clearCache, live: live };
})();

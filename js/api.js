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

  async function call(action, data, role) {
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
    if (j.ok) return j.data;
    var code = j.error || 'NETWORK';
    if (role && (code === 'AUTH' || code === 'EXPIRED')) {
      setToken(role, '');
      window.dispatchEvent(new CustomEvent('auth-lost', { detail: { role: role, code: code } }));
    }
    throw new ApiError(code, j.message || MSG[code] || code);
  }

  window.API = { call: call, getToken: getToken, setToken: setToken, ApiError: ApiError };
})();

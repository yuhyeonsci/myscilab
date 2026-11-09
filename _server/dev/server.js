// 로컬 미리보기: Code.gs를 node에서 돌리고 사이트 파일도 같이 보여 줌 (npm run preview → http://localhost:8787, 강사 비밀번호 teacherpw1)
const http = require('http'), fs = require('fs'), path = require('path');
const H = require('./harness.js');
const ROOT = path.join(__dirname, '..', '..');
const SITE = ROOT; // 저장소 맨 위가 곧 사이트
const PORT = Number(process.env.PORT || 8787);
// 미리보기용 데이터 더 넣기
H.ctx.setupApi();
require('./seed_more.js')(H);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }); return res.end(); }
  if (req.url.startsWith('/api')) {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      let out;
      try { out = H.ctx.doPost({ postData: { contents: body } }).s; } catch (e) { out = JSON.stringify({ ok: false, error: 'SERVER ' + e.message }); }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(out);
    });
    return;
  }
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  let f = path.join(SITE, p);
  if (!f.startsWith(SITE) || !fs.existsSync(f)) { if (fs.existsSync(f + '/index.html')) f = f + '/index.html'; else { res.writeHead(404); return res.end('nf'); } }
  let data = fs.readFileSync(f);
  if (p === '/js/config.js') data = Buffer.from(data.toString().replace(/API_URL: '[^']*'/, "API_URL: 'http://localhost:" + PORT + "/api'"));
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(data);
}).listen(PORT, () => console.log('listening ' + PORT));

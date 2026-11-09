// 사이트 파일 캐시 번호(?v=N)를 하나 올림. 사이트 JS/CSS를 바꾸면 올려야 학생 폰에 새 파일이 바로 반영돼요.
// 사용: npm run bump
const fs = require('fs'), path = require('path');
const SITE = path.join(__dirname, '..'); // 저장소 맨 위 = 사이트 (_로 시작하는 폴더는 건너뜀)
const files = [];
(function walk(d) { fs.readdirSync(d, { withFileTypes: true }).forEach(e => { if (e.name === '.git' || e.name === 'node_modules' || e.name.startsWith('_')) return; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(html|js)$/.test(e.name)) files.push(p); }); })(SITE);
let cur = 0;
files.forEach(f => { const m = fs.readFileSync(f, 'utf8').match(/\?v=(\d+)/g); if (m) m.forEach(x => cur = Math.max(cur, Number(x.slice(3)))); });
const next = cur + 1;
let n = 0;
files.forEach(f => { const s = fs.readFileSync(f, 'utf8'); const t = s.replace(/\?v=\d+/g, '?v=' + next); if (t !== s) { fs.writeFileSync(f, t); n++; } });
console.log('?v=' + cur + ' → ?v=' + next + ' (' + n + '개 파일)');

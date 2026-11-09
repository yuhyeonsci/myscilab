// 서버(Code.gs) 자동 테스트 전부 돌리기: npm test
const { spawnSync } = require('child_process'), path = require('path');
const files = ['test1.js', 'test2.js', 'test3.js', 'test4.js', 'test5.js'];
let bad = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const fails = out.split('\n').filter(l => l.startsWith('FAIL') || l.includes('Error'));
  const ok = r.status === 0 && /ALL OK/.test(out) && !fails.length;
  console.log((ok ? 'OK   ' : 'FAIL ') + f + (ok ? '' : '\n' + (fails.join('\n') || out.slice(-800))));
  if (!ok) bad++;
}
console.log(bad ? '\n실패 ' + bad + '개' : '\n모두 통과');
process.exit(bad ? 1 : 0);

// 서버(Code.gs)를 Apps Script에 올리고 "기존 배포"를 새 버전으로 바꿈 → 주소(exec URL)는 그대로
// 사용: npm run deploy:server -- "바뀐 내용 한 줄"
// 절대 'clasp deploy'를 -i(배포 ID) 없이 쓰지 말 것: 새 배포가 생겨 주소가 바뀜
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), SERVER = path.join(ROOT, '_server');
function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) { console.error('\n멈춤: ' + cmd + ' ' + args.join(' ')); process.exit(1); }
}
const cfgPath = path.join(__dirname, 'deploy.json');
if (!fs.existsSync(cfgPath)) { console.error('_tools/deploy.json이 없어요. CLAUDE.md의 "처음 연결" 순서를 먼저 하세요.'); process.exit(1); }
const { deploymentId } = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
if (!/^AKfy[\w-]{20,}$/.test(deploymentId || '')) { console.error('deploy.json의 deploymentId가 이상해요.'); process.exit(1); }
if (!fs.existsSync(path.join(SERVER, '.clasp.json'))) { console.error('_server/.clasp.json이 없어요. 처음 연결을 먼저 하세요.'); process.exit(1); }
const code = fs.readFileSync(path.join(SERVER, 'Code.gs'), 'utf8');
if (!code.includes("var ADMIN_PASSWORD = 'change-me-1234';")) { console.error('Code.gs의 ADMIN_PASSWORD 줄이 기본값이 아니에요. 실제 비밀번호가 들어가면 안 돼요. 멈춥니다.'); process.exit(1); }
const ver = (code.match(/var API_VERSION = '([^']+)'/) || [])[1] || '';
const desc = (process.argv.slice(2).join(' ') || 'update') + (ver ? ' (' + ver + ')' : '');
console.log('1/3 테스트'); run(process.execPath, [path.join(SERVER, 'dev', 'run-all.js')], ROOT);
console.log('2/3 올리기 (clasp push)'); run('npx', ['-y', '@google/clasp', 'push', '-f'], SERVER);
console.log('3/3 기존 배포를 새 버전으로 (clasp deploy -i)'); run('npx', ['-y', '@google/clasp', 'deploy', '-i', deploymentId, '-d', desc], SERVER);
console.log('\n완료. 확인: API 주소 뒤에 ?action=ping → "version":"' + ver + '"');

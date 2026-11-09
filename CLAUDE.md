# 유현T 과학 · 숙제 채점소 (myscilab.co.kr)

학원 과학 강사(유현T)가 학생 숙제·테스트·출결·자료·영상을 관리하는 사이트. 사용자는 개발자가 아님 → **항상 한국어, 존댓말, 쉬운 말**로 설명하고, 터미널 명령을 시키기보다 직접 실행해 주세요.

## 구조 (이 저장소 = yuhyeonsci/myscilab, GitHub Pages → myscilab.co.kr)

```
(저장소 맨 위)        ← 사이트 그 자체 (GitHub Pages가 그대로 공개)
├─ index.html          학생 · admin/ 강사 · parent/ 학부모 · 404.html
├─ js/ css/            화면 코드 (빌드 없음)
├─ CNAME               도메인 연결 — 절대 지우지 말 것
├─ _config.yml         개발용 파일을 사이트에서 제외 (_로 시작하는 폴더는 자동 제외)
├─ _server/Code.gs     Google Apps Script 서버 (JSON API, 구글 시트 "숙제 채점소"에 붙어 있음)
│  ├─ .claspignore     dev/는 Apps Script에 안 올라가게
│  └─ dev/             node로 Apps Script를 흉내 내는 테스트(harness.js, test1~5), 로컬 미리보기(server.js)
├─ _tools/             deploy-server.js(서버 배포), bump.js(캐시 번호 올리기), deploy.json(배포 ID)
├─ package.json        npm test / npm run preview / npm run bump / npm run deploy:server
└─ CLAUDE.md
```

- 사이트: 순수 HTML/CSS/JS.
  - `js/config.js`: API_URL(서버 exec 주소), TITLE, PIN_LENGTH
  - `js/api.js`: fetch POST(text/plain) `{action, token, data}` → `{ok, data}`; localStorage 캐시(`API.live`), `API.beacon`
  - `js/ui.js`: `UI.h()` DOM 헬퍼, 아이콘, 시트/토스트/확인창, 날짜 함수, 테마
  - `js/student.js`, `js/admin.js`, `js/parent.js`: 해시 라우팅 화면들
  - `css/app.css`: 파스텔 토큰(:root), 다크 모드, 인쇄용 성적표(@media print)
- 서버: `_server/Code.gs` 한 파일. `API_` 객체에 action → 함수. 시트 구조는 맨 위 `HEADERS`.
  - 인증: HMAC 토큰(학생 s/학부모 p/강사 a). 학생 비밀번호는 솔트 해시. 강사 비밀번호는 스크립트 속성(ADMIN_HASH).
  - 읽기 캐시: READ_CACHE_ + CacheService(시트 버전별). 쓰기는 `writeRow_`/`upsert_`, 동시성은 `withLock_`.
  - `API_VERSION` 문자열: 서버를 바꾸면 올림 (예 '2026.11.8' → '2026.11.9'). `?action=ping` 으로 확인.
- 이 저장소는 공개라 코드가 보임. **비밀값(비밀번호·토큰 키)은 절대 커밋하지 말 것** (모두 Apps Script 스크립트 속성에 있음).

## 꼭 지킬 것 (사용자가 직접 정한 규칙)

1. **'새 배포' 금지.** 서버 주소(exec URL)가 바뀌면 사이트가 끊김. 배포는 오직 `npm run deploy:server -- "설명"` (내부에서 `clasp deploy -i <기존 배포 ID>`). `clasp deploy`를 `-i` 없이 절대 실행하지 말 것.
2. **강사 비밀번호(ADMIN_PASSWORD) 줄은 건드리지도, 읽어서 말하지도 말 것.** 저장소의 Code.gs는 기본값 `'change-me-1234'` 그대로 둠. 실제 비밀번호는 스크립트 속성 해시로만 존재. 비밀번호를 입력하는 일은 사용자가 직접 함.
3. **권한·로그인 창(구글 OAuth, GitHub 로그인)이 뜨면 멈추고 사용자에게 알릴 것.** 대신 누르지 않음.
4. **학생 비밀번호는 강사도 모르게** 숨김(사용자 요청). 임시 비밀번호 1111만 강사 화면에 보임.
5. 요청하지 않은 파일(PDF 등)을 임의로 만들지 말 것.
6. 학생 개인정보가 담긴 시트 데이터를 밖으로 보내거나 출력하지 말 것.

## 작업 순서 (기능 추가·수정)

1. 코드 수정 (사이트 파일, `_server/Code.gs`)
2. 서버를 바꿨으면 `API_VERSION` 올리기, `_server/dev/`에 테스트 추가
3. `npm test` (모두 통과해야 함) / 화면은 `npm run preview` → http://localhost:8787 (강사 비밀번호 teacherpw1, 학생 청담고·김철수·4821) + Playwright 스크린샷으로 확인
4. 사이트 JS/CSS를 바꿨으면 `npm run bump` (캐시 번호 ?v=N 올림 — 안 하면 학생 폰에 옛 파일이 남음)
5. 배포
   - **서버** (Code.gs를 바꾼 경우, 사이트보다 먼저):
     - clasp를 쓸 수 있으면(PC, 또는 웹 환경에서 구글 연결이 되면): `npm run deploy:server -- "한 줄 설명"` → ping 버전 확인
     - 안 되면(웹 버전 등): 사용자에게 안내 — GitHub에서 `_server/Code.gs` 열기 → "Copy raw file" → Apps Script 편집기 Code.gs 전체 지우고 붙여넣기 → 저장 → **배포 → 배포 관리 → 연필(수정) → 버전: 새 버전 → 배포** ('새 배포' 아님) → ping 확인
   - **사이트**: 커밋해서 main에 반영 (웹 버전은 브랜치/PR로 올리고 사용자가 GitHub에서 Merge). 1~2분 뒤 myscilab.co.kr 반영
6. 사용자에게 무엇이 바뀌었는지 짧게 한국어로 설명

## 처음 설정 (한 번만)

저장소 맨 위에 `_setup.zip`이 올라와 있으면 처음 설정이 아직 안 된 것:
1. `_setup.zip`을 풀면 이 구조 그대로(사이트 최신 파일 + _server + _tools + _config.yml + package.json + CLAUDE.md)가 나옴. 저장소 맨 위에 덮어쓰기. **CNAME은 그대로 유지**(zip에는 없음). 저장소에 `.nojekyll`이 있으면 지울 것(있으면 _ 폴더 제외가 안 됨)
2. `npm test` 통과 확인 → `_setup.zip` 삭제 → 커밋 (웹 버전이면 PR 만들고 사용자에게 Merge 부탁)
3. 반영 뒤 확인: myscilab.co.kr 이 정상이고, myscilab.co.kr/_server/Code.gs 와 /CLAUDE.md 가 404인지
4. 서버 자동 배포(clasp)는 PC에서 할 때 연결 (웹 버전은 구글 로그인이 유지되지 않음). 연결 방법:
   - 사용자가 https://script.google.com/home/usersettings 에서 "Google Apps Script API"를 켰는지 확인 (켜 둠)
   - `npx -y @google/clasp login` → 로그인은 사용자가 직접 (멈추고 알리기)
   - Apps Script 프로젝트에는 Code.gs 말고도 파일(옛 화면 index.html 등, appsscript.json)이 있고 `clasp push`는 프로젝트 전체를 덮어씀 → 먼저 가져오기: 임시 폴더에 `npx -y @google/clasp clone <스크립트ID>` → **Code 파일(Code.js/Code.gs)은 열지도 출력하지도 말고 지움**(실제 비밀번호 줄이 있을 수 있음) → 나머지(appsscript.json, *.html, 기타 .js/.gs)를 `_server/`로, `.clasp.json`을 `_server/.clasp.json`으로(rootDir "."), 임시 폴더 삭제. 옛 화면 html 파일은 저장소 공개 여부를 사용자에게 확인
   - clasp 2.x는 .clasp.json에 `"fileExtension": "gs"`, 3.x는 `"scriptExtensions": [".gs", ".js"]`. `npx @google/clasp status`로 Code.gs 포함·dev/ 제외 확인
   - 배포 ID = `js/config.js` API_URL의 `/macros/s/<배포ID>/exec` 부분. `clasp deployments`로 확인 후 `_tools/deploy.json`에 `{ "deploymentId": "<배포ID>" }`
   - 강사 비밀번호는 이미 사이트 설정에서 바꿔 해시로 저장해 둠(사용자 확인 완료) → 코드의 기본값 줄은 쓰이지 않음

## 지금까지 정한 내용 (바꾸지 말 것, 바꿀 땐 사용자에게 먼저 물어보기)

- 로그인: 학생은 학교·이름·비밀번호(6자리, 옛 4자리도 통과, 임시 1111). 학년 입력 없음. 토큰 유지: 학생 14일, 학부모 30일, 강사 12시간
- 학부모: 교재 뒤 QR → myscilab.co.kr/parent → 학부모 코드(학생 '내 정보'에 표시)
- 숙제: 날짜가 되면 열림. 마감 = 다음 수업 시작 30분 전, QR 지각 = 시작 10분 뒤부터 (설정 → 마감·지각 기준에서 분 조정). 처음 낸 답으로 점수, 틀린 문제 재풀이 후 정답·해설 공개
- 풀이 화면: 한 문제씩(객관식 고르면 자동 다음) ↔ 한 화면 빠른 입력(사진 숨김, 번호 옆 '문제'로 펼침). 학생 선택은 기억됨. 재풀이·오답 복습은 사진 보이기로 시작. 공개 후 틀린 문제는 문제 사진 자동 펼침
- 자료실: 차시(Units) 단위. 공개 대상 기본은 '선택 공개' — 기본 아무도 안 보임, 결석/영상 출석 → 그날 차시 영상+자료 자동, 학생별 '상시 공개'(영상/자료/둘 다), 차시별 예외. 기존 차시는 '전체 공개'
- 영상: 유튜브 '일부 공개'를 사이트 안에서 재생(IFrame API). 5초 칸 단위 시청 진도(Watch 시트), 이름·학교 워터마크(18초마다 이동), 유튜브 자체 전체 화면 끔 → 자체 전체 화면 버튼. 드라이브 영상은 진도 없음
- PDF 자료: 다운로드 때 이름·학교 워터마크
- 출석: 출석·영상·지각·결석·조퇴. QR 셀프 출석(40분). 출석부 날짜는 강사가 정한 수업일만(숙제 날짜 + 출석·일지 저장일)
- 종강: 반 비활성화, 종강 1주 뒤 영상·자료 닫힘
- 인쇄용 성적표: 기간 선택, 학생당 A4 한 장(숙제·테스트 추이·출결·영역별·코멘트), 코멘트는 Comments 시트 `RC:시작~끝` 키
- 강사 전용 메모(학생에게 안 보임), 수업 일지, 질문함, 시험 범위·D-day(학생이 설정), 주간 백업(weeklyBackup 트리거)
- 화면 문구는 존댓말·격식 있게 ("공개 대상", "누구에게 보여 줄까요" 같은 말투 X)
- 보류: 학교 시험 성적, 학부모 상담 요청, 알림톡·문자(유료 대행사 필요)

## 사용자 성향

- 답변은 한국어로, 짧고 요점만. 진행 중에는 무엇을 하는지 한 줄씩
- 크레딧 낭비를 싫어함: 불필요한 파일·긴 설명 X

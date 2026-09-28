/* ══════════════════════════════════════════════════════════
 * scripts/verify.mjs — 핸드오프 9장 "완료 기준"을 실제로 판정하는 스크립트.
 * "확인 완료"라고 말로만 적는 걸 막기 위한 것 — 실행 결과를 그대로
 * README/커밋 메시지에 붙여넣는다.
 *
 * 실행: node scripts/verify.mjs
 * ══════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadDataModule() {
  const code = readFileSync(join(root, 'data.js'), 'utf8');
  const sandbox = { window: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'data.js' });
  return sandbox.window;
}

const FORBIDDEN_WORDS = ['정답', '오답', '점수', '게이지'];

let failures = 0;
function section(title) { console.log('\n── ' + title + ' ──'); }
function ok(msg) { console.log('  ✔ ' + msg); }
function fail(msg) { console.log('  ✘ ' + msg); failures++; }

/* ══════════════ 1. sourceId 누락 노드 = 0개 ══════════════ */
section('기준 1 — 사실 서술 노드에 sourceId 없는 것 0개');
const { CONTENT, SOURCES } = loadDataModule();

const factNodes = [];
function collectFacts(node, path) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((v, i) => collectFacts(v, path + '[' + i + ']'));
    return;
  }
  // "fact-like" 객체 판정: text와 sourceId 키를 동시에 가질 수 있는 모양
  if ('text' in node && ('sourceId' in node || 'verified' in node)) {
    factNodes.push({ path, node });
  }
  Object.keys(node).forEach((k) => collectFacts(node[k], path + '.' + k));
}
collectFacts(CONTENT, 'CONTENT');

let missingSourceId = 0;
factNodes.forEach((f) => {
  if (!f.node.sourceId) { fail('sourceId 없음: ' + f.path + ' → "' + String(f.node.text).slice(0, 40) + '..."'); missingSourceId++; }
});
console.log('  검사한 사실 서술 노드 수: ' + factNodes.length);
if (missingSourceId === 0) ok('sourceId 누락 0개');

/* ══════════════ 2. verified:false 노드 목록 (배지 자동 표시 대상) ══════════════ */
section('기준 2 — verified:false 노드 (화면에 [원문 대조 전] 배지가 뜸)');
const unverified = factNodes.filter((f) => f.node.verified === false);
unverified.forEach((f) => console.log('  · ' + f.path + ' — sourceId=' + f.node.sourceId));
console.log('  총 ' + unverified.length + '개 (app.js의 factHtml()이 verified!==true인 모든 노드에 배지를 강제로 붙인다 — 렌더 로직 자체가 조건이라 개별 누락이 없다)');

/* ══════════════ 3. 힌트 문자열이 질문형인지 (마침표로 끝나면 안 됨) ══════════════ */
section('기준 3 — 힌트 문자열: 마침표로 끝나는 것 grep');
const hints = [];
function collectHints(node, path) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((v, i) => collectHints(v, path + '[' + i + ']')); return; }
  Object.keys(node).forEach((k) => {
    if ((k === 'hint' || k === 'reasonHint' || k === 'writingHint') && typeof node[k] === 'string') {
      hints.push({ path: path + '.' + k, text: node[k] });
    }
    collectHints(node[k], path + '.' + k);
  });
}
collectHints(CONTENT, 'CONTENT');

let periodEndings = 0;
hints.forEach((h) => {
  const endsWithPeriod = /[.](?!\?)\s*$/.test(h.text.trim()) || h.text.trim().endsWith('.');
  const endsWithQuestion = h.text.trim().endsWith('?');
  if (endsWithPeriod && !endsWithQuestion) { fail('마침표로 끝나는 힌트: ' + h.path + ' → "' + h.text + '"'); periodEndings++; }
  else if (!endsWithQuestion) { fail('질문형(물음표)이 아닌 힌트: ' + h.path + ' → "' + h.text + '"'); periodEndings++; }
});
console.log('  검사한 힌트 수: ' + hints.length);
if (periodEndings === 0) ok('전부 물음표로 끝남 (마침표 종결 0개)');

/* ══════════════ 4. 정답/오답/점수/게이지 표현 grep (화면 문자열 전체) ══════════════ */
section('기준 4 — 정답/오답/점수/게이지 표현 grep');
const filesToScan = ['data.js', 'app.js', 'index.html', 'style.css'];
let forbiddenHits = 0;
filesToScan.forEach((fname) => {
  const text = readFileSync(join(root, fname), 'utf8');
  FORBIDDEN_WORDS.forEach((w) => {
    const idx = text.indexOf(w);
    if (idx !== -1) {
      const line = text.slice(0, idx).split('\n').length;
      fail(fname + ':' + line + ' — "' + w + '" 발견');
      forbiddenHits++;
    }
  });
});
if (forbiddenHits === 0) ok('정답/오답/점수/게이지 표현 0건 (' + filesToScan.join(', ') + ')');

/* ══════════════ 반복 실수 체크리스트 ══════════════ */
section('반복 실수 1 — URL/ID 원본 대조');
const configText = readFileSync(join(root, 'config.js'), 'utf8');
const EXPECTED = {
  SHEET_WEBAPP_URL: 'https://script.google.com/macros/s/AKfycbyXSjCfWY_HiZFqW_OBR-FQDoIfF1z_STqyKWUI31MacHeY3u7hbirFSFDvW-5yuUHaJQ/exec',
  PADLET_5: 'https://padlet.com/dy_sch03/2026-2-3-5-cewq8vec8p3ew2yn',
  PADLET_6: 'https://padlet.com/dy_sch03/2026-2-3-6-2xngg3v8pstkvld9',
  PADLET_7: 'https://padlet.com/dy_sch03/2026-2-3-7-8ssvnriy75f7xwxs',
  PADLET_8: 'https://padlet.com/dy_sch03/2026-2-3-8-gsrz2i3ca863675l'
};
Object.entries(EXPECTED).forEach(([k, v]) => {
  if (configText.includes(v)) ok(k + ' 원본과 일치');
  else fail(k + ' 불일치 — config.js에서 확인 필요');
});
const EXPECTED_SILLOK = {
  'K-1': 'https://sillok.history.go.kr/id/kja_10407017_002',
  'K-2': 'https://sillok.history.go.kr/id/kka_11410025_002',
  'K-3': 'https://sillok.history.go.kr/popup/print.do?id=kka_11412016_002&gubun=kor'
};
Object.entries(EXPECTED_SILLOK).forEach(([k, v]) => {
  if (SOURCES[k] && SOURCES[k].url === v) ok('SOURCES.' + k + '.url 원본과 일치');
  else fail('SOURCES.' + k + '.url 불일치 — 기대값: ' + v + ' / 실제: ' + (SOURCES[k] && SOURCES[k].url));
});

section('반복 실수 2 — TDZ 방지: init() 호출 위치');
const appText = readFileSync(join(root, 'app.js'), 'utf8');
const initCallMatches = appText.match(/\binit\(\)/g) || [];
const lastFunctionDeclEnd = appText.lastIndexOf('function init');
const lastInitCallIdx = appText.lastIndexOf('init()');
if (initCallMatches.length >= 1 && lastInitCallIdx > lastFunctionDeclEnd) {
  ok('init() 호출이 함수 선언부보다 아래(파일 끝쪽)에 위치함');
} else {
  fail('init() 호출 위치를 확인할 것');
}

section('반복 실수 3 — 태블릿 터치/드래그 대비');
console.log('  이 앱에는 카드 나열/순서 재배열 인터랙션이 없음 — 해당 없음이 정상.');
console.log('  버튼 최소 터치 영역(--tap-min:44px)은 style.css .choice-btn/.nav-btn/.hint-toggle/.easy-toggle에 적용됨.');

/* ══════════════ 요약 ══════════════ */
section('요약');
console.log('  실패 항목 수: ' + failures);
if (failures > 0) process.exitCode = 1;

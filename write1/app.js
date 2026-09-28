/* ══════════════════════════════════════════════════════════
 * write1/app.js — "사화 시뮬레이션(무오·기묘)" 전체 앱에서 글쓰기①만
 * 떼어 먼저 배포하기 위한 독립 페이지. 본 시뮬(../index.html)이 아직
 * 준비 중이어도 이 화면만 먼저 학생에게 줄 수 있게 만든 것.
 *
 * v1.2(2026-09-28, 효니 핸드오프 "핸드오프 문서 v1 — 사림 단원 글쓰기 ① 수정"
 * 반영) — "비판할래/참을래 + 이유" 구조를 "카드 분류(사림·훈구) → 카드 두 장
 * 골라 한 마디 쓰기" 구조로 교체.
 *
 * v1.4(2026-09-28, 효니 피드백 반영) — 카드 분류 UI를 "카드마다 버튼 2개 +
 * 하이라이트"에서 "담지 않은 카드 더미 → 사림/훈구 상자로 실제로 옮겨 담는"
 * 방식으로 바꿨다. 버튼만 누르고 화면에 아무 변화가 없으면 왜 눌러야 하는지
 * 알기 어렵다는 지적 반영 — 이제 카드를 담으면 그 상자 밑에 실제로 쌓인다.
 * 도입 문구에서 "아직 사화 이야기는 하나도 안 나와" 같은 메타 설명은 뺐고,
 * 글쓰기 단계에서는 역할(3사 관리) 배지를 넣어 어떤 입장에서 쓰는 글인지
 * 먼저 보이게 했다.
 *
 * v1.5(2026-09-28, 효니 피드백 "글쓰기 마음에 안 들어" 반영) — 2단계(카드
 * 선택) 카드 목록을 시뮬 전체에서 쓰는 공용 .choice-btn(큼직한 전체 폭 버튼)
 * 대신 전용 .pick-chip으로 바꿨다. 분류 단계에서 이미 사림=쪽빛(jade),
 * 훈구=금빛(amber)으로 색을 나눠놨는데, 다음 단계에서 똑같은 카드를 무채색
 * 큰 버튼으로 다시 늘어놓으면 "방금 분류한 결과"처럼 안 보이고 "카드를 또
 * 처음부터 고르는 세 번째 분류 단계"처럼 보였다. .pick-chip은 더 작고
 * 조밀하며 분류 단계와 같은 색을 그대로 쓴다. 라벨에 이모지(📜/🏛)도 붙여
 * 어느 쪽 목록인지 한눈에 구분되게 했다. .choice-btn/.choice-list는
 * 최상위 app.js(본 시뮬)의 다른 판단 화면에서 그대로 쓰고 있어 손대지 않음.
 *
 * v1.6(2026-09-28, 효니 피드백 "역할이 강조되지 않고, 카드 선택과 글쓰기 연결이
 * 애매함" 반영) — 두 가지를 고쳤다.
 * (1) 역할 안내를 작은 알약 배지(.role-badge)+회색 안내문(.lead) 조합에서
 * 눈에 띄는 박스(.role-banner)로 바꿔 "지금 어떤 입장에서 쓰는 글인지"가
 * 먼저 읽히게 했다.
 * (2) 카드를 둘 다 고르기 전엔 쓰기 칸 자체를 아예 렌더링하지 않는다
 * (writeHtml의 bothPicked 분기). 둘 다 고르면 방금 고른 카드 두 개의
 * 문장을 그대로 다시 보여준 뒤(.pick-recap) 바로 그 아래 "위 두 카드를
 * 근거로" 쓰기 칸이 열린다 — 선택과 글쓰기가 같은 화면에 나란히 있지만
 * 서로 무관해 보이던 문제를, 순서를 강제하고 선택 내용을 눈앞에 다시
 * 보여주는 방식으로 연결했다.
 *
 * ../config.js를 그대로 불러 쓴다(SHEET_WEBAPP_URL, PADLET_BY_BAN 공유) —
 * 백엔드 URL이나 Padlet 링크가 바뀌면 한 곳(config.js)만 고치면 된다.
 * GAME_NAME만 이 페이지 전용으로 따로 둔다: 나중에 전체 시뮬이 열리면
 * 그 안의 write1 스텝과는 다른 gameName으로 별도 행이 쌓인다 —
 * history26 커리큘럼에도 이 페이지를 별도 활동으로 등록해야 하고,
 * 그때 activity id를 아래 WRITE1_GAME_NAME과 맞출 것.
 * ⚠️ 이미 포털 커리큘럼에 이 activity id로 등록돼 있을 수 있어 값 자체는
 * 그대로 둔다(진행률·포인트 계산 연결이 끊기지 않도록) — 내용만 바뀐 것.
 *
 * localStorage 키는 전체 시뮬(../app.js)과 같은
 * "joseon_sarim_progress_<학번>"을 쓴다.
 * ══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CONFIG = window.CONFIG;
  var WRITE1_GAME_NAME = '사화_글쓰기1_비판할래참을래';
  var MIN_TEXT_LEN = 10; // 공란 방지 수준 최소 글자 수 (교사가 바꿀 수 있게 상수로 분리)

  var CLASSIFY_INTRO = '교과서 123쪽까지 읽은 걸로 해봐. 카드 10장을 읽고 사림 상자·훈구 상자에 나눠 담아봐.';
  var WRONG_MSG = '123쪽 본문을 다시 읽어봐.';
  var WRITE_ROLE = '🎭 너는 성종 때 3사에서 일하는 관리야';
  var WRITE_INTRO = '3사는 훈구의 부정과 권력 독점을 비판하는 자리야. 그 입장이 돼서, 방금 분류한 카드에서 사림 카드 하나·훈구 카드 하나를 골라 훈구 대신들에게 한 마디 해봐. 1~2문장이면 돼. (실제 기록이 아니라 네가 상상해서 쓰는 창작이야.)';
  var WRITING_HINT = '내가 고른 훈구 카드는 사림이 보기에 뭐가 문제일까? 내가 고른 사림 카드는 그 문제와 어떻게 이어질까?';
  var WRITE_PLACEHOLDER = '훈구 대신들에게 하고 싶은 말을 1~2문장으로';
  var DONE_NOTE = '교과서가 정리한 구분이야. 사림과 훈구를 대립하는 두 집단으로 보는 설명 방식에는 학계의 다른 시각도 있어.';

  // 카드 문구는 교과서 123쪽 서술 그대로 — 임의 수정 금지(핸드오프 문서 4장).
  var CARDS = [
    { id: 'c1', text: '고려 말 조선 건국에 참여하지 않고 지방에서 학문 연구와 교육에 힘씀', answer: 'sarim' },
    { id: 'c2', text: '정몽주, 길재의 학통을 이음', answer: 'sarim' },
    { id: 'c3', text: '도덕과 의리를 바탕으로 하는 왕도 정치와 향촌 자치를 추구', answer: 'sarim' },
    { id: 'c4', text: '성종 때 김종직을 비롯한 영남 지역 출신이 많이 등용됨', answer: 'sarim' },
    { id: 'c5', text: '주로 3사의 언관직에 임명되어 훈구 세력의 부정한 행위와 권력 독점을 비판함', answer: 'sarim' },
    { id: 'c6', text: '조선 건국과 국왕 즉위에 앞장선 사대부가 공신이 됨', answer: 'hoongu' },
    { id: 'c7', text: '세조가 왕위에 오르는 데 공을 세운 한명회 등이 고위 관직을 차지함', answer: 'hoongu' },
    { id: 'c8', text: '그 공로로 국가로부터 많은 토지와 노비를 받음', answer: 'hoongu' },
    { id: 'c9', text: '일부는 왕실과 혼인 관계를 맺어 세력 기반을 다짐', answer: 'hoongu' },
    { id: 'c10', text: '대를 이어 권력을 독점하면서 왕권을 제약함', answer: 'hoongu' }
  ];

  var SESSION = { sid: '', name: '', ban: null, preview: false };
  var ANSWERS = {};
  var CLASSIFY = {}; // cardId -> 'sarim' | 'hoongu' (상자에 담겼지만 아직 확정 전일 수도, 확정됐을 수도)
  var LOCKED = {}; // cardId -> true (확인 결과 맞아서 더는 손댈 수 없는 카드)
  var CARD_ORDER = []; // 카드 표시 순서(세션마다 무작위로 섞음, 사림·훈구 뒤섞여 나온다)
  var lastWrongCount = 0; // 마지막 "확인하기" 결과 틀린 개수(0이면 안내문 안 띄움)
  var phase = 'login'; // login | classify | write | done
  var submitState = 'idle'; // idle | saving | done | failed

  function parseStudentId(sid) {
    var s = String(sid || '').trim();
    if (!/^\d{5}$/.test(s)) return null;
    return { grade: Number(s.slice(0, 1)), ban: Number(s.slice(1, 3)), number: Number(s.slice(3, 5)) };
  }

  function getQueryParam(key) {
    var params = new URLSearchParams(window.location.search);
    return params.get(key) || '';
  }

  function storageKey() { return 'joseon_sarim_progress_' + (SESSION.sid || 'guest'); }

  function loadAnswers() {
    try {
      var raw = localStorage.getItem(storageKey());
      ANSWERS = raw ? JSON.parse(raw) : {};
    } catch (e) { ANSWERS = {}; }
  }
  function saveAnswers() {
    try { localStorage.setItem(storageKey(), JSON.stringify(ANSWERS)); } catch (e) { /* 조용히 무시 */ }
  }
  function setAnswer(key, value) { ANSWERS[key] = value; saveAnswers(); }
  function persistClassification() {
    setAnswer('write1_classification', CLASSIFY);
    ANSWERS.write1_locked = LOCKED;
    saveAnswers();
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function escapeAttr(s) { return escapeHtml(s); }

  function fetchJsonRetry(url, options, tries, delayMs) {
    tries = tries == null ? CONFIG.FETCH_RETRY_COUNT : tries;
    delayMs = delayMs == null ? CONFIG.FETCH_RETRY_DELAY_MS : delayMs;
    return fetch(url, options).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json().catch(function () { return { result: 'success' }; });
    }).catch(function (err) {
      if (tries <= 1) throw err;
      return new Promise(function (resolve) {
        setTimeout(function () { resolve(fetchJsonRetry(url, options, tries - 1, delayMs)); }, delayMs);
      });
    });
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }).catch(function () { return fallbackCopy(text); });
    }
    return Promise.resolve(fallbackCopy(text));
  }
  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.focus(); ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  function shuffledIds() {
    var ids = CARDS.map(function (c) { return c.id; });
    for (var i = ids.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = ids[i]; ids[i] = ids[j]; ids[j] = tmp;
    }
    return ids;
  }

  function cardById(id) {
    for (var i = 0; i < CARDS.length; i++) { if (CARDS[i].id === id) return CARDS[i]; }
    return null;
  }
  function cardText(id) {
    var c = cardById(id);
    return c ? c.text : '';
  }
  function cardsBySide(side) { return CARDS.filter(function (c) { return c.answer === side; }); }

  /* ── 카드 분류 상태 헬퍼 (담지 않은 카드 더미 ↔ 사림/훈구 상자) ── */
  function poolIds() { return CARD_ORDER.filter(function (id) { return !(id in CLASSIFY); }); }
  function zoneIds(side) { return CARD_ORDER.filter(function (id) { return CLASSIFY[id] === side; }); }
  function assignCard(id, side) { CLASSIFY[id] = side; persistClassification(); }
  function unassignCard(id) { if (LOCKED[id]) return; delete CLASSIFY[id]; persistClassification(); }

  function checkClassification() {
    ANSWERS.write1_attempts = (ANSWERS.write1_attempts || 0) + 1;
    setAnswer('write1_attempts', ANSWERS.write1_attempts);
    var wrong = 0;
    CARD_ORDER.forEach(function (id) {
      if (LOCKED[id] || !(id in CLASSIFY)) return;
      var card = cardById(id);
      if (CLASSIFY[id] === card.answer) { LOCKED[id] = true; }
      else { delete CLASSIFY[id]; wrong++; }
    });
    persistClassification();
    lastWrongCount = wrong;
    if (wrong === 0) phase = 'write';
    render();
  }

  function loginIsComplete() {
    return !!parseStudentId(SESSION.sid) && SESSION.name.trim().length > 0;
  }

  function writeIsComplete() {
    return !!ANSWERS.write1_sarim_card && !!ANSWERS.write1_hoongu_card &&
      (ANSWERS.write1_text || '').trim().length >= MIN_TEXT_LEN;
  }

  function padletLinkHtml(label) {
    if (!SESSION.ban || !CONFIG.PADLET_BY_BAN[SESSION.ban]) {
      return '<div class="note-box">담당 반 정보가 없어서 링크를 자동으로 못 찾았어. 선생님께 문의해줘.</div>';
    }
    return '<a class="padlet-link" href="' + escapeAttr(CONFIG.PADLET_BY_BAN[SESSION.ban]) + '" target="_blank" rel="noopener">' + escapeHtml(label) + '</a>';
  }

  /* ══════════════ 화면 렌더 ══════════════
   * preserveScroll이 true면 스크롤 위치를 그대로 둔다 — 카드 분류처럼 같은
   * 화면 안에서 여러 번 눌러야 하는 조작에서 클릭마다 맨 위로 튀는 걸 막기 위함.
   * phase 자체가 바뀌는 동작(로그인 확인, 확인하기, 제출)은 스크롤을 올린다. */
  function render(preserveScroll) {
    var root = document.getElementById('stepArea');
    if (phase === 'login') root.innerHTML = loginHtml();
    else if (phase === 'classify') root.innerHTML = classifyHtml();
    else if (phase === 'write') root.innerHTML = writeHtml();
    else root.innerHTML = doneHtml();

    bindEvents(root);
    if (!preserveScroll) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  function loginHtml() {
    var html = '<div class="card">';
    html += '<h2>학번·이름 확인</h2>';
    html += '<p class="lead">포털에서 넘어온 값이야. 맞는지 확인하고, 틀렸으면 고쳐줘.</p>';
    html += '<label class="field-label">학번 (5자리)</label>';
    html += '<input type="text" inputmode="numeric" maxlength="5" class="text-field" id="loginSid" value="' + escapeAttr(SESSION.sid) + '" placeholder="예: 30512">';
    html += '<label class="field-label">이름</label>';
    html += '<input type="text" class="text-field" id="loginName" value="' + escapeAttr(SESSION.name) + '" placeholder="이름">';
    html += '<div class="nav-row"><button type="button" class="nav-btn next" id="loginNext" disabled>확인하고 시작하기</button></div>';
    html += '</div>';
    return html;
  }

  function classifyHtml() {
    var pool = poolIds();
    var html = '<div class="card">';
    html += '<h2>🗂️ 카드 분류 — 사림일까, 훈구일까?</h2>';
    html += '<p class="lead">' + escapeHtml(CLASSIFY_INTRO) + '</p>';
    if (lastWrongCount > 0) {
      html += '<div class="note-box">' + escapeHtml(WRONG_MSG) + '</div>';
    }
    html += '<div class="sort-board">';
    html += '<div class="sort-pool">';
    html += '<div class="sort-pool-head">🗂️ 아직 담지 않은 카드 <span class="sort-pool-count">' + pool.length + '</span></div>';
    if (pool.length > 0) {
      html += '<div class="sort-pool-list">';
      pool.forEach(function (id) {
        var card = cardById(id);
        html += '<div class="sort-item">';
        html += '<p class="sort-item-text">' + escapeHtml(card.text) + '</p>';
        html += '<div class="sort-item-btns">';
        html += '<button type="button" class="sort-btn sort-btn-sarim" data-card="' + id + '" data-side="sarim">📜 사림 상자에 담기</button>';
        html += '<button type="button" class="sort-btn sort-btn-hoongu" data-card="' + id + '" data-side="hoongu">🏛 훈구 상자에 담기</button>';
        html += '</div></div>';
      });
      html += '</div>';
    } else {
      html += '<p class="sort-pool-empty">다 담았어. 아래 "확인하기"를 눌러봐.</p>';
    }
    html += '</div>';
    html += '<div class="sort-zones">';
    html += sortZoneHtml('sarim', '📜 사림 상자', zoneIds('sarim'));
    html += sortZoneHtml('hoongu', '🏛 훈구 상자', zoneIds('hoongu'));
    html += '</div>';
    html += '</div>';
    html += '<div class="nav-row"><button type="button" class="nav-btn next" id="checkClassify"' + (pool.length === 0 ? '' : ' disabled') + '>확인하기</button></div>';
    html += '</div>';
    return html;
  }

  function sortZoneHtml(side, label, ids) {
    var html = '<div class="sort-zone sort-zone-' + side + '">';
    html += '<div class="sort-zone-head">' + label + '</div>';
    html += '<div class="sort-zone-list">';
    ids.forEach(function (id) {
      var card = cardById(id);
      var locked = !!LOCKED[id];
      html += '<div class="sort-chip' + (locked ? ' locked' : '') + '">';
      html += '<span class="sort-chip-text">' + escapeHtml(card.text) + '</span>';
      if (locked) html += '<span class="sort-chip-check" title="확인 완료">✔</span>';
      else html += '<button type="button" class="sort-chip-undo" data-undo="' + id + '" aria-label="상자에서 빼기">↩</button>';
      html += '</div>';
    });
    html += '</div></div>';
    return html;
  }

  function writeHtml() {
    var sarimCards = cardsBySide('sarim');
    var hoonguCards = cardsBySide('hoongu');
    var text = ANSWERS.write1_text || '';
    var bothPicked = !!ANSWERS.write1_sarim_card && !!ANSWERS.write1_hoongu_card;
    var html = '<div class="card">';
    html += '<h2>🖋️ 글쓰기 ① — 한 마디 쓰기</h2>';
    html += '<div class="role-banner">';
    html += '<div class="role-banner-role">' + escapeHtml(WRITE_ROLE) + '</div>';
    html += '<p class="role-banner-body">' + escapeHtml(WRITE_INTRO) + '</p>';
    html += '</div>';
    html += '<label class="field-label">📜 사림 카드 하나 선택</label>';
    html += '<div class="pick-zone pick-zone-sarim">';
    sarimCards.forEach(function (c) {
      html += '<button type="button" class="pick-chip' + (ANSWERS.write1_sarim_card === c.id ? ' selected' : '') + '" data-group="sarim" data-card="' + c.id + '">' + escapeHtml(c.text) + '</button>';
    });
    html += '</div>';
    html += '<label class="field-label">🏛 훈구 카드 하나 선택</label>';
    html += '<div class="pick-zone pick-zone-hoongu">';
    hoonguCards.forEach(function (c) {
      html += '<button type="button" class="pick-chip' + (ANSWERS.write1_hoongu_card === c.id ? ' selected' : '') + '" data-group="hoongu" data-card="' + c.id + '">' + escapeHtml(c.text) + '</button>';
    });
    html += '</div>';
    if (!bothPicked) {
      html += '<p class="write-gate">👆 사림 카드 하나, 훈구 카드 하나를 다 고르면 쓰기 칸이 열려.</p>';
      html += '</div>';
      return html;
    }
    html += '<div class="pick-recap">';
    html += '<div class="pick-recap-item pick-recap-sarim"><span class="pick-recap-tag">사림</span>' + escapeHtml(cardText(ANSWERS.write1_sarim_card)) + '</div>';
    html += '<div class="pick-recap-item pick-recap-hoongu"><span class="pick-recap-tag">훈구</span>' + escapeHtml(cardText(ANSWERS.write1_hoongu_card)) + '</div>';
    html += '</div>';
    html += '<label class="field-label">✍️ 위 두 카드를 근거로, 훈구 대신들에게 한 마디</label>';
    html += '<textarea class="text-field" rows="4" id="write1Text" placeholder="' + escapeAttr(WRITE_PLACEHOLDER) + '">' + escapeHtml(text) + '</textarea>';
    html += '<button type="button" class="hint-toggle" data-target="write1Hint">💡 막막하면 힌트 보기</button>';
    html += '<div class="hint-box" id="write1Hint" hidden>' + escapeHtml(WRITING_HINT) + '</div>';
    html += '<div class="padlet-box" style="margin-top:16px;">';
    html += '<p>다 썼으면 아래 버튼으로 복사해서 Padlet에 붙여넣어줘. (이 글쓰기는 필수야)</p>';
    html += '<button type="button" class="nav-btn next" id="copyWrite1" style="margin-top:10px; display:inline-block; width:auto; padding:0 20px;">복사하기</button>';
    html += ' ' + padletLinkHtml('Padlet 열어서 붙여넣기');
    html += '<p id="copyStatus" style="margin-top:8px; font-size:.86rem; color:var(--ink-soft);"></p>';
    html += '</div>';
    html += '<div class="nav-row"><button type="button" class="nav-btn next" id="submitWrite1" disabled>제출하기</button></div>';
    html += '<p id="submitStatus" style="margin-top:10px; font-size:.86rem; color:var(--ink-soft);"></p>';
    html += '</div>';
    return html;
  }

  function doneHtml() {
    var html = '<div class="card">';
    html += '<h2>✅ 제출됐어</h2>';
    html += '<div class="recap-item"><h3>네가 고른 카드와 한 마디</h3>';
    html += '<div class="recap-value">사림 카드: ' + escapeHtml(cardText(ANSWERS.write1_sarim_card)) + '<br>훈구 카드: ' + escapeHtml(cardText(ANSWERS.write1_hoongu_card)) + '<br>' + escapeHtml(ANSWERS.write1_text || '') + '</div></div>';
    html += '<div class="note-box">' + escapeHtml(DONE_NOTE) + '</div>';
    html += '<div class="note-box">Padlet에도 붙여넣었는지 한 번 더 확인해줘. 이후 무오·기묘사화 시뮬레이션은 선생님이 안내할 때 이어서 진행하면 돼.</div>';
    html += '<p id="submitStatus2" style="margin-top:10px; font-size:.86rem; color:var(--ink-soft);"></p>';
    html += '</div>';
    return html;
  }

  function bindEvents(root) {
    if (phase === 'login') {
      var sidEl = root.querySelector('#loginSid');
      var nameEl = root.querySelector('#loginName');
      var nextBtn = root.querySelector('#loginNext');
      function sync() {
        SESSION.sid = sidEl.value.trim();
        SESSION.name = nameEl.value.trim();
        var parsed = parseStudentId(SESSION.sid);
        SESSION.ban = parsed ? parsed.ban : null;
        nextBtn.disabled = !loginIsComplete();
      }
      sidEl.addEventListener('input', sync);
      nameEl.addEventListener('input', sync);
      sync(); // URL 파라미터로 이미 채워진 값이 있으면 버튼 상태를 즉시 반영
      nextBtn.addEventListener('click', function () {
        if (!loginIsComplete()) return;
        loadAnswers();
        enterPostLoginPhase();
        render();
      });
    } else if (phase === 'classify') {
      // 카드가 10장이라 클릭마다 화면을 다시 그려도 맨 위로는 스크롤하지 않는다
      // (render(true)) — 상자 목록 갱신에 필요한 만큼만 다시 그리기엔 이동 대상이
      // 여러 컨테이너를 오가서, 통째로 다시 그리는 편이 더 안전하고 간단하다.
      var board = root.querySelector('.sort-board');
      board.addEventListener('click', function (e) {
        var sortBtn = e.target.closest('.sort-btn');
        if (sortBtn) {
          assignCard(sortBtn.getAttribute('data-card'), sortBtn.getAttribute('data-side'));
          render(true);
          return;
        }
        var undoBtn = e.target.closest('.sort-chip-undo');
        if (undoBtn) {
          unassignCard(undoBtn.getAttribute('data-undo'));
          render(true);
        }
      });
      root.querySelector('#checkClassify').addEventListener('click', checkClassification);
    } else if (phase === 'write') {
      // 카드를 둘 다 고르기 전엔 쓰기 영역(textarea/힌트/복사/제출) 자체를
      // 렌더링하지 않는다 (writeHtml 참고) — "선택부터 끝내야 쓰기 칸이 열린다"는
      // 순서를 화면 구조로 강제해서, 선택과 글쓰기가 이어진 하나의 흐름으로
      // 보이게 한다. 그래서 아래 요소들도 있을 때만 이벤트를 건다.
      root.querySelectorAll('.pick-chip').forEach(function (btn) {
        btn.addEventListener('click', function () {
          setAnswer('write1_' + btn.getAttribute('data-group') + '_card', btn.getAttribute('data-card'));
          render();
        });
      });
      var submitBtn = root.querySelector('#submitWrite1');
      if (!submitBtn) return;
      function refreshSubmitState() { submitBtn.disabled = !writeIsComplete(); }

      var textEl = root.querySelector('#write1Text');
      textEl.addEventListener('input', function () {
        setAnswer('write1_text', textEl.value);
        refreshSubmitState();
      });
      root.querySelector('.hint-toggle').addEventListener('click', function () {
        var box = document.getElementById('write1Hint');
        box.hidden = !box.hidden;
      });
      root.querySelector('#copyWrite1').addEventListener('click', function () {
        var payload = '사림 카드: ' + cardText(ANSWERS.write1_sarim_card) + '\n' +
          '훈구 카드: ' + cardText(ANSWERS.write1_hoongu_card) + '\n' +
          '한 마디: ' + (ANSWERS.write1_text || '');
        copyToClipboard(payload).then(function (ok) {
          document.getElementById('copyStatus').textContent = ok ? '복사됐어. Padlet에 붙여넣어줘.' : '복사에 실패했어. 직접 옮겨 적어줘.';
        });
      });
      submitBtn.addEventListener('click', submitFinal);
      refreshSubmitState();
    }
  }

  function submitFinal() {
    if (!writeIsComplete()) return;
    if (SESSION.preview) { phase = 'done'; render(); document.getElementById('submitStatus2').textContent = '(미리보기 모드 — 기록 저장 안 됨)'; return; }
    submitState = 'saving';
    var statusEl = document.getElementById('submitStatus');
    if (statusEl) statusEl.textContent = '기록 저장 중...';
    var payload = {
      studentId: SESSION.sid,
      studentName: SESSION.name,
      gameName: WRITE1_GAME_NAME,
      choiceSummary: '사림:' + cardText(ANSWERS.write1_sarim_card) + ' / 훈구:' + cardText(ANSWERS.write1_hoongu_card),
      diffSummary: '',
      reflection: ANSWERS.write1_text || '',
      choicesJson: JSON.stringify({
        classification: CLASSIFY,
        attempts: ANSWERS.write1_attempts || 1,
        sarim_card: ANSWERS.write1_sarim_card,
        hoongu_card: ANSWERS.write1_hoongu_card,
        write1_text: ANSWERS.write1_text
      })
    };
    fetchJsonRetry(CONFIG.SHEET_WEBAPP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).then(function () {
      submitState = 'done';
      phase = 'done';
      render();
      document.getElementById('submitStatus2').textContent = '기록이 저장됐어.';
    }).catch(function (err) {
      submitState = 'failed';
      console.warn('[write1] 제출 실패:', err);
      if (statusEl) statusEl.textContent = '기록 저장에 실패했어. 다시 눌러줘.';
    });
  }

  // 로그인 확인 직후 이어서 보여줄 단계를 저장된 답변 기준으로 정한다.
  function enterPostLoginPhase() {
    CLASSIFY = ANSWERS.write1_classification || {};
    LOCKED = ANSWERS.write1_locked || {};
    var allLocked = CARDS.length > 0 && CARDS.every(function (c) { return !!LOCKED[c.id]; });
    phase = allLocked ? 'write' : 'classify';
    lastWrongCount = 0;
  }

  function init() {
    SESSION.sid = getQueryParam('sid');
    SESSION.name = getQueryParam('name');
    SESSION.preview = getQueryParam('preview') === '1';
    var parsed = parseStudentId(SESSION.sid);
    SESSION.ban = parsed ? parsed.ban : null;
    CARD_ORDER = shuffledIds();

    if (SESSION.preview) document.getElementById('devBanner').hidden = false;

    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

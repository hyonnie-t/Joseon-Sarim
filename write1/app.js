/* ══════════════════════════════════════════════════════════
 * write1/app.js — "사화 시뮬레이션(무오·기묘)" 전체 앱에서 글쓰기①만
 * 떼어 먼저 배포하기 위한 독립 페이지. 본 시뮬(../index.html)이 아직
 * 준비 중이어도 이 화면만 먼저 학생에게 줄 수 있게 만든 것.
 *
 * v1.2(2026-09-28, 효니 핸드오프 "핸드오프 문서 v1 — 사림 단원 글쓰기 ① 수정"
 * 반영) — "비판할래/참을래 + 이유" 구조를 "카드 분류(사림·훈구) → 카드 두 장
 * 골라 한 마디 쓰기" 구조로 교체. 근거는 핸드오프 문서 2장 참고(사림 쪽
 * 시각을 사실처럼 전제하던 문구 제거, 참는 쪽 근거 없는 문제 해소).
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
 * "joseon_sarim_progress_<학번>"을 쓴다. 다만 이번 개편으로 답변
 * 필드 구조가 바뀌어(write1_choice/write1_text → 카드 분류·선택 카드·
 * write1_text) 전체 시뮬 쪽의 옛 write1 스텝(../app.js, ../data.js)이
 * 참조하던 write1_choice는 더 이상 이 페이지가 채우지 않는다. 이건
 * 핸드오프 문서 6장 "열린 질문 1"에서 효니 결정 대기 중인 사항 —
 * 글쓰기②/전체 시뮬은 이 커밋 범위 밖이라 건드리지 않는다.
 * ══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CONFIG = window.CONFIG;
  var WRITE1_GAME_NAME = '사화_글쓰기1_비판할래참을래';
  var MIN_TEXT_LEN = 10; // 공란 방지 수준 최소 글자 수 (핸드오프 6장 — 교사가 바꿀 수 있게 상수로 분리)

  var CLASSIFY_INTRO = '아직 사화 이야기는 하나도 안 나와. 교과서 123쪽까지 읽은 걸로 해봐. 카드가 10장 있어. 사림 이야기면 사림 쪽으로, 훈구 이야기면 훈구 쪽으로 옮겨봐.';
  var WRONG_MSG = '123쪽 본문을 다시 읽어봐.';
  var WRITE_INTRO = '너는 성종 때 3사 관리야. 훈구 대신들에게 한 마디 해봐. 방금 분류한 카드에서 사림 카드 하나, 훈구 카드 하나를 골라서 넣어. 1~2문장이면 돼. (실제 기록이 아니라 네가 상상해서 쓰는 창작이야.)';
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
  var CLASSIFY = {}; // cardId -> 'sarim' | 'hoongu'
  var CARD_ORDER = []; // 카드 표시 순서(세션마다 무작위로 섞음)
  var wrongIds = []; // 마지막 확인 결과 틀린 카드 id 목록
  var checkedOnce = false; // '확인하기'를 한 번이라도 눌렀는지
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

  function loginIsComplete() {
    return !!parseStudentId(SESSION.sid) && SESSION.name.trim().length > 0;
  }

  function allClassified(ids) {
    return ids.every(function (id) { return !!CLASSIFY[id]; });
  }
  function cardsToShow() {
    if (!checkedOnce) return CARD_ORDER;
    return CARD_ORDER.filter(function (id) { return wrongIds.indexOf(id) !== -1; });
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

  /* ══════════════ 화면 렌더 ══════════════ */
  function render() {
    var root = document.getElementById('stepArea');
    if (phase === 'login') root.innerHTML = loginHtml();
    else if (phase === 'classify') root.innerHTML = classifyHtml();
    else if (phase === 'write') root.innerHTML = writeHtml();
    else root.innerHTML = doneHtml();

    bindEvents(root);
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
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
    var ids = cardsToShow();
    var html = '<div class="card">';
    html += '<h2>카드 분류 — 사림일까, 훈구일까?</h2>';
    html += '<p class="lead">' + escapeHtml(CLASSIFY_INTRO) + '</p>';
    if (checkedOnce && ids.length > 0) {
      html += '<div class="note-box">' + escapeHtml(WRONG_MSG) + '</div>';
    }
    html += '<div class="classify-list">';
    ids.forEach(function (id) {
      var card = cardById(id);
      var picked = CLASSIFY[id];
      html += '<div class="classify-card" data-card-row="' + id + '">';
      html += '<p class="classify-text">' + escapeHtml(card.text) + '</p>';
      html += '<div class="classify-btns">';
      html += '<button type="button" class="classify-btn' + (picked === 'sarim' ? ' selected-sarim' : '') + '" data-card="' + id + '" data-side="sarim">사림</button>';
      html += '<button type="button" class="classify-btn' + (picked === 'hoongu' ? ' selected-hoongu' : '') + '" data-card="' + id + '" data-side="hoongu">훈구</button>';
      html += '</div></div>';
    });
    html += '</div>';
    html += '<div class="nav-row"><button type="button" class="nav-btn next" id="checkClassify"' + (allClassified(ids) ? '' : ' disabled') + '>확인하기</button></div>';
    html += '</div>';
    return html;
  }

  function writeHtml() {
    var sarimCards = cardsBySide('sarim');
    var hoonguCards = cardsBySide('hoongu');
    var text = ANSWERS.write1_text || '';
    var html = '<div class="card">';
    html += '<h2>글쓰기 ① — 한 마디 쓰기</h2>';
    html += '<p class="lead">' + escapeHtml(WRITE_INTRO) + '</p>';
    html += '<label class="field-label">사림 카드 하나 선택</label>';
    html += '<div class="choice-list" data-group="sarim">';
    sarimCards.forEach(function (c) {
      html += '<button type="button" class="choice-btn' + (ANSWERS.write1_sarim_card === c.id ? ' selected' : '') + '" data-group="sarim" data-card="' + c.id + '">' + escapeHtml(c.text) + '</button>';
    });
    html += '</div>';
    html += '<label class="field-label">훈구 카드 하나 선택</label>';
    html += '<div class="choice-list" data-group="hoongu">';
    hoonguCards.forEach(function (c) {
      html += '<button type="button" class="choice-btn' + (ANSWERS.write1_hoongu_card === c.id ? ' selected' : '') + '" data-group="hoongu" data-card="' + c.id + '">' + escapeHtml(c.text) + '</button>';
    });
    html += '</div>';
    html += '<label class="field-label">한 마디</label>';
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
    html += '<h2>제출됐어</h2>';
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
      var checkBtn = root.querySelector('#checkClassify');

      root.querySelectorAll('.classify-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.getAttribute('data-card');
          var side = btn.getAttribute('data-side');
          CLASSIFY[id] = side;
          setAnswer('write1_classification', CLASSIFY);

          var row = root.querySelector('.classify-card[data-card-row="' + id + '"]');
          row.querySelectorAll('.classify-btn').forEach(function (b) {
            b.classList.remove('selected-sarim', 'selected-hoongu');
          });
          btn.classList.add(side === 'sarim' ? 'selected-sarim' : 'selected-hoongu');

          checkBtn.disabled = !allClassified(cardsToShow());
        });
      });

      checkBtn.addEventListener('click', function () {
        var visible = cardsToShow();
        ANSWERS.write1_attempts = (ANSWERS.write1_attempts || 0) + 1;
        setAnswer('write1_attempts', ANSWERS.write1_attempts);

        var newWrong = visible.filter(function (id) {
          var card = cardById(id);
          return CLASSIFY[id] !== card.answer;
        });
        checkedOnce = true;
        wrongIds = newWrong;

        if (wrongIds.length === 0) {
          phase = 'write';
        }
        render();
      });
    } else if (phase === 'write') {
      root.querySelectorAll('.choice-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var group = btn.getAttribute('data-group');
          var cardId = btn.getAttribute('data-card');
          setAnswer('write1_' + group + '_card', cardId);
          root.querySelectorAll('.choice-btn[data-group="' + group + '"]').forEach(function (b) {
            b.classList.remove('selected');
          });
          btn.classList.add('selected');
          refreshSubmitState();
        });
      });
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
      root.querySelector('#submitWrite1').addEventListener('click', submitFinal);
      refreshSubmitState();

      function refreshSubmitState() {
        var btn = root.querySelector('#submitWrite1');
        if (btn) btn.disabled = !writeIsComplete();
      }
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
    var allCorrect = CARDS.length > 0 && CARDS.every(function (c) { return CLASSIFY[c.id] === c.answer; });
    if (allCorrect) {
      checkedOnce = true;
      wrongIds = [];
      phase = 'write';
    } else {
      checkedOnce = (ANSWERS.write1_attempts || 0) > 0;
      wrongIds = checkedOnce ? CARDS.filter(function (c) { return CLASSIFY[c.id] !== c.answer; }).map(function (c) { return c.id; }) : [];
      phase = 'classify';
    }
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

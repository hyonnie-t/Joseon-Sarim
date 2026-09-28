/* ══════════════════════════════════════════════════════════
 * app.js — 렌더링/상태 로직만 담당한다. 역사 서술 문장은 절대 여기 하드
 * 코딩하지 않는다 (전부 data.js). 함수는 전부 선언만 먼저 하고, 실제
 * 실행(init 호출)은 파일 맨 마지막에 둔다 — IIFE에서 아래쪽 const를
 * 참조하는 TDZ 에러를 피하기 위한 webapp-builder 스킬 규칙.
 *
 * v2.0(2026-09-28, 효니 지시 — 제미나이 참고 버전을 바탕으로 구조 압축):
 * 무오/기묘 각각을 "배경 + 사료 돋보기 모달 + 판단 + 결과 피드백"을 한
 * 화면에 담는 sahwaStage로, 전환 구간을 카드뉴스형 transitionCards로,
 * 회고 화면에 서논술형 글쓰기 조합기를 더했다. 글쓰기①(write1) 관련
 * 함수·마크업은 이번에도 손대지 않았다 — write1/app.js(독립 배포 페이지)와
 * localStorage를 공유하기 때문(README 참고).
 * ══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CONTENT = window.CONTENT;
  var SOURCES = window.SOURCES;
  var CONFIG = window.CONFIG;

  var SESSION = { sid: '', name: '', grade: null, ban: null, number: null, preview: false };
  var ANSWERS = {};
  var stepIndex = -1; // -1 = 로그인 확인 화면, 0..N-1 = CONTENT.steps
  var submitState = 'idle'; // idle | saving | done | failed

  /* 지금 화면에 걸려 있는 사료 카드를 key로 찾기 위한 임시 맵 — 사료 모달을
   * 여는 버튼을 누르면 여기서 카드 데이터를 꺼내온다. renderSahwaStage가
   * 매번 다시 채운다. */
  var CURRENT_SOURCE_CARDS = {};

  /* ── 글쓰기① 전용 상태(v1.2, v1.4) — 카드 분류 단계는 ANSWERS에 바로 반영되지
   * 않는 "몇 번 틀렸는지" 같은 화면 표시용 상태가 필요해서 write1/app.js(독립
   * 페이지)와 같은 방식으로 모듈 변수로 따로 둔다. WRITE1_CLASSIFY는 "담지 않은
   * 카드 더미 ↔ 사림/훈구 상자" 중 상자 쪽에 들어간 카드(확정 전 포함), 확인
   * 결과 맞은 카드만 WRITE1_LOCKED에 true로 남는다. loadAnswers() 직후
   * initWrite1State()가 저장된 답으로 한 번 맞춰준다.
   * ⚠️ 아래 write1 관련 블록은 write1/app.js(독립 페이지)와 localStorage를
   * 공유한다 — 수정 금지(효니 지시, 2026-09-28). */
  var WRITE1_MIN_TEXT_LEN = 10;
  var WRITE1_CARD_ORDER = null;
  var WRITE1_CLASSIFY = {};
  var WRITE1_LOCKED = {};
  var WRITE1_LAST_WRONG_COUNT = 0;
  var WRITE1_PHASE = 'classify'; // classify | write

  /* ── 학번 파싱: 학년(1) + 반(2) + 번호(2) 5자리. history26 parseStudentId()와 같은 규칙. ── */
  function parseStudentId(sid) {
    var s = String(sid || '').trim();
    if (!/^\d{5}$/.test(s)) return null;
    return { grade: Number(s.slice(0, 1)), ban: Number(s.slice(1, 3)), number: Number(s.slice(3, 5)) };
  }

  function getQueryParam(key) {
    var params = new URLSearchParams(window.location.search);
    return params.get(key) || '';
  }

  function storageKey() {
    return 'joseon_sarim_progress_' + (SESSION.sid || 'guest');
  }

  function loadAnswers() {
    try {
      var raw = localStorage.getItem(storageKey());
      ANSWERS = raw ? JSON.parse(raw) : {};
    } catch (e) { ANSWERS = {}; }
  }

  function saveAnswers() {
    try { localStorage.setItem(storageKey(), JSON.stringify(ANSWERS)); } catch (e) { /* 저장 공간 없음 등 — 조용히 무시 */ }
  }

  function setAnswer(key, value) {
    ANSWERS[key] = value;
    saveAnswers();
  }

  /* ── fetch 재시도 헬퍼 — history26 fetchJsonRetry_() 관례와 동일 ── */
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

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function escapeAttr(s) { return escapeHtml(s); }

  function hintHtml(fieldKey, hintText) {
    if (!hintText) return '';
    var boxId = 'hint_' + fieldKey;
    return '<button type="button" class="hint-toggle" data-target="' + boxId + '">💡 막막하면 힌트 보기</button>' +
      '<div class="hint-box" id="' + boxId + '" hidden>' + escapeHtml(hintText) + '</div>';
  }

  /* ══════════════ 스텝별 렌더러 ══════════════
   * 각 render*는 { html, afterMount } 형태를 돌려준다. afterMount(root)는
   * DOM이 실제로 붙은 뒤 이벤트 리스너를 다는 콜백. */

  /* ── 로그인 확인 화면 (webapp-builder 스킬 필수 항목 ①) ──
   * 포털에서 넘어온 학번/이름을 "화면에 보여주고" 학생이 확인하게 한다.
   * 자동 채움만 하고 화면을 건너뛰지 않는다(잘못 넘어왔을 때 고칠 방법이
   * 없어지기 때문). */
  function renderLogin() {
    var html = '<div class="card">';
    html += '<h2>학번·이름 확인</h2>';
    html += '<p class="lead">포털에서 넘어온 값이야. 맞는지 확인하고, 틀렸으면 고쳐줘.</p>';
    html += '<label class="field-label">학번 (5자리)</label>';
    html += '<input type="text" inputmode="numeric" maxlength="5" class="text-field" id="loginSid" value="' + escapeAttr(SESSION.sid) + '" placeholder="예: 30512">';
    html += '<label class="field-label">이름</label>';
    html += '<input type="text" class="text-field" id="loginName" value="' + escapeAttr(SESSION.name) + '" placeholder="이름">';
    html += '</div>';
    return {
      html: html,
      afterMount: function (root) {
        // 이 화면엔 "다음" 버튼 대신 자체 확인 버튼을 쓰지 않고, 공용 다음 버튼을 그대로 쓰되
        // 입력값 변경 시마다 SESSION을 갱신해서 다음 버튼 활성화 조건에 반영한다.
        function syncFromInputs() {
          SESSION.sid = root.querySelector('#loginSid').value.trim();
          SESSION.name = root.querySelector('#loginName').value.trim();
          var parsed = parseStudentId(SESSION.sid);
          if (parsed) { SESSION.grade = parsed.grade; SESSION.ban = parsed.ban; SESSION.number = parsed.number; }
          else { SESSION.grade = null; SESSION.ban = null; SESSION.number = null; }
          updateNavState();
        }
        root.querySelector('#loginSid').addEventListener('input', syncFromInputs);
        root.querySelector('#loginName').addEventListener('input', syncFromInputs);
      }
    };
  }

  function loginIsComplete() {
    return !!parseStudentId(SESSION.sid) && SESSION.name.trim().length > 0;
  }

  /* ══════════════ 글쓰기① — 카드 분류(사림·훈구) → 카드 두 장 골라 한 마디
   * 쓰기 (v1.2, v1.4). write1/app.js(독립 배포 페이지)와 같은 흐름을 이
   * 스텝 기반 앱 안에 이식한 것. ⚠️ 이 섹션 전체를 손대지 않는다(효니 지시,
   * 2026-09-28) — write1/과 localStorage 필드를 공유하고 있어서, 여기를
   * 고치면 독립 페이지 쪽과 어긋난다. ══════════════ */
  function shuffledIds(cards) {
    var ids = cards.map(function (c) { return c.id; });
    for (var i = ids.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = ids[i]; ids[i] = ids[j]; ids[j] = tmp;
    }
    return ids;
  }
  function write1CardById(step, id) {
    for (var i = 0; i < step.cards.length; i++) { if (step.cards[i].id === id) return step.cards[i]; }
    return null;
  }
  function write1CardText(step, id) {
    var c = write1CardById(step, id);
    return c ? c.text : '';
  }
  function write1CardsBySide(step, side) {
    return step.cards.filter(function (c) { return c.answer === side; });
  }
  function write1PoolIds() {
    return WRITE1_CARD_ORDER.filter(function (id) { return !(id in WRITE1_CLASSIFY); });
  }
  function write1ZoneIds(side) {
    return WRITE1_CARD_ORDER.filter(function (id) { return WRITE1_CLASSIFY[id] === side; });
  }
  function write1PersistClassification() {
    setAnswer('write1_classification', WRITE1_CLASSIFY);
    ANSWERS.write1_locked = WRITE1_LOCKED;
    saveAnswers();
  }
  function write1AssignCard(id, side) { WRITE1_CLASSIFY[id] = side; write1PersistClassification(); }
  function write1UnassignCard(id) { if (WRITE1_LOCKED[id]) return; delete WRITE1_CLASSIFY[id]; write1PersistClassification(); }

  function write1CheckClassification(step) {
    ANSWERS.write1_attempts = (ANSWERS.write1_attempts || 0) + 1;
    setAnswer('write1_attempts', ANSWERS.write1_attempts);
    var wrong = 0;
    WRITE1_CARD_ORDER.forEach(function (id) {
      if (WRITE1_LOCKED[id] || !(id in WRITE1_CLASSIFY)) return;
      var card = write1CardById(step, id);
      if (WRITE1_CLASSIFY[id] === card.answer) { WRITE1_LOCKED[id] = true; }
      else { delete WRITE1_CLASSIFY[id]; wrong++; }
    });
    write1PersistClassification();
    WRITE1_LAST_WRONG_COUNT = wrong;
    if (wrong === 0) WRITE1_PHASE = 'write';
    renderCurrentStep();
  }

  // 로그인 확인 직후 한 번 호출 — 저장된 답으로 카드 순서·분류 상태·phase를 맞춘다.
  function initWrite1State() {
    var step = findStep('write1');
    WRITE1_CARD_ORDER = shuffledIds(step.cards);
    WRITE1_CLASSIFY = ANSWERS.write1_classification || {};
    WRITE1_LOCKED = ANSWERS.write1_locked || {};
    WRITE1_LAST_WRONG_COUNT = 0;
    var allLocked = step.cards.length > 0 && step.cards.every(function (c) { return !!WRITE1_LOCKED[c.id]; });
    WRITE1_PHASE = allLocked ? 'write' : 'classify';
  }

  function renderWrite1(step) {
    return WRITE1_PHASE === 'write' ? renderWrite1Write(step) : renderWrite1Classify(step);
  }

  function write1SortZoneHtml(side, label, ids) {
    var html = '<div class="sort-zone sort-zone-' + side + '">';
    html += '<div class="sort-zone-head">' + label + '</div>';
    html += '<div class="sort-zone-list">';
    ids.forEach(function (id) {
      var card = write1CardById(findStep('write1'), id);
      var locked = !!WRITE1_LOCKED[id];
      html += '<div class="sort-chip' + (locked ? ' locked' : '') + '">';
      html += '<span class="sort-chip-text">' + escapeHtml(card.text) + '</span>';
      if (locked) html += '<span class="sort-chip-check" title="확인 완료">✔</span>';
      else html += '<button type="button" class="sort-chip-undo" data-undo="' + id + '" aria-label="상자에서 빼기">↩</button>';
      html += '</div>';
    });
    html += '</div></div>';
    return html;
  }

  function renderWrite1Classify(step) {
    var pool = write1PoolIds();
    var html = '<div class="card">';
    html += '<h2>🗂️ ' + escapeHtml(step.title) + ' — 카드 분류</h2>';
    html += '<p class="lead">' + escapeHtml(step.classifyLead) + '</p>';
    if (WRITE1_LAST_WRONG_COUNT > 0) {
      html += '<div class="note-box">' + escapeHtml(step.wrongMsg) + '</div>';
    }
    html += '<div class="sort-board">';
    html += '<div class="sort-pool">';
    html += '<div class="sort-pool-head">🗂️ 아직 담지 않은 카드 <span class="sort-pool-count">' + pool.length + '</span></div>';
    if (pool.length > 0) {
      html += '<div class="sort-pool-list">';
      pool.forEach(function (id) {
        var card = write1CardById(step, id);
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
    html += write1SortZoneHtml('sarim', '📜 사림 상자', write1ZoneIds('sarim'));
    html += write1SortZoneHtml('hoongu', '🏛 훈구 상자', write1ZoneIds('hoongu'));
    html += '</div>';
    html += '</div>';
    html += '<div class="nav-row"><button type="button" class="nav-btn next" id="checkClassify"' + (pool.length === 0 ? '' : ' disabled') + '>확인하기</button></div>';
    html += '</div>';
    return {
      html: html,
      afterMount: function (root) {
        // 카드가 10장이라 클릭마다 renderCurrentStep()의 기본 동작(맨 위로 스크롤)을
        // 그대로 쓰면 상자에 담을 때마다 화면이 튄다 — write1/app.js와 동일하게
        // preserveScroll=true로 다시 그려서 스크롤 위치를 유지한다.
        var board = root.querySelector('.sort-board');
        board.addEventListener('click', function (e) {
          var sortBtn = e.target.closest('.sort-btn');
          if (sortBtn) {
            write1AssignCard(sortBtn.getAttribute('data-card'), sortBtn.getAttribute('data-side'));
            renderCurrentStep(true);
            return;
          }
          var undoBtn = e.target.closest('.sort-chip-undo');
          if (undoBtn) {
            write1UnassignCard(undoBtn.getAttribute('data-undo'));
            renderCurrentStep(true);
          }
        });
        root.querySelector('#checkClassify').addEventListener('click', function () {
          write1CheckClassification(step);
        });
      }
    };
  }

  function renderWrite1Write(step) {
    var sarimCards = write1CardsBySide(step, 'sarim');
    var hoonguCards = write1CardsBySide(step, 'hoongu');
    var text = ANSWERS.write1_text || '';
    var html = '<div class="card">';
    html += '<h2>🖋️ ' + escapeHtml(step.title) + ' — 한 마디 쓰기</h2>';
    html += '<span class="role-badge">' + escapeHtml(step.writeRole) + '</span>';
    html += '<p class="lead">' + escapeHtml(step.writeLead) + '</p>';
    html += '<label class="field-label">사림 카드 하나 선택</label>';
    html += '<div class="choice-list">';
    sarimCards.forEach(function (c) {
      html += '<button type="button" class="choice-btn' + (ANSWERS.write1_sarim_card === c.id ? ' selected' : '') + '" data-group="sarim" data-card="' + c.id + '">' + escapeHtml(c.text) + '</button>';
    });
    html += '</div>';
    html += '<label class="field-label">훈구 카드 하나 선택</label>';
    html += '<div class="choice-list">';
    hoonguCards.forEach(function (c) {
      html += '<button type="button" class="choice-btn' + (ANSWERS.write1_hoongu_card === c.id ? ' selected' : '') + '" data-group="hoongu" data-card="' + c.id + '">' + escapeHtml(c.text) + '</button>';
    });
    html += '</div>';
    html += '<label class="field-label">한 마디</label>';
    html += '<textarea class="text-field" rows="4" data-key="write1_text" placeholder="' + escapeAttr(step.writePlaceholder) + '">' + escapeHtml(text) + '</textarea>';
    html += hintHtml('write1_text', step.writingHint);
    html += '<div class="note-box">' + escapeHtml(step.doneNote) + '</div>';
    html += '<div class="padlet-box" style="margin-top:16px;">';
    html += '<p>' + escapeHtml(step.copyLead) + '</p>';
    html += '<button type="button" class="nav-btn next" id="copyWrite1" style="margin-top:10px; display:inline-block; width:auto; padding:0 20px;">복사하기</button>';
    html += ' ' + padletLinkHtml('Padlet 열어서 붙여넣기');
    html += '<p id="copyStatus" style="margin-top:8px; font-size:.86rem; color:var(--ink-soft);"></p>';
    html += '</div></div>';
    return {
      html: html,
      afterMount: function (root) {
        root.querySelectorAll('.choice-btn[data-group]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            setAnswer('write1_' + btn.getAttribute('data-group') + '_card', btn.getAttribute('data-card'));
            renderCurrentStep();
          });
        });
        bindTextFieldsAndHints(root);
        var copyBtn = root.querySelector('#copyWrite1');
        if (copyBtn) {
          copyBtn.addEventListener('click', function () {
            var payload = '사림 카드: ' + write1CardText(step, ANSWERS.write1_sarim_card) + '\n' +
              '훈구 카드: ' + write1CardText(step, ANSWERS.write1_hoongu_card) + '\n' +
              '한 마디: ' + (ANSWERS.write1_text || '');
            copyToClipboard(payload).then(function (ok) {
              var statusEl = document.getElementById('copyStatus');
              if (statusEl) statusEl.textContent = ok ? '복사됐어. Padlet에 붙여넣어줘.' : '복사에 실패했어. 직접 옮겨 적어줘.';
            });
          });
        }
      }
    };
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
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus(); ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }
  /* ══════════════ 글쓰기① 섹션 끝 ══════════════ */

  /* ══════════════ 사료 돋보기 모달 ══════════════
   * 스테이지 화면의 "🔍 사료 돋보기" 버튼이 여는 팝업. 모달 DOM 자체는
   * index.html에 한 번만 있고(#stepArea 밖), 여기서 내용만 채워 넣는다. */
  function openSourceModal(card) {
    var modal = document.getElementById('sourceModal');
    var titleEl = document.getElementById('modalTitle');
    var bodyEl = document.getElementById('modalBody');
    if (!modal || !titleEl || !bodyEl) return;
    titleEl.textContent = card.title;
    var bodyHtml = '<p class="lead">' + escapeHtml(card.lead) + '</p>';
    if (card.text) {
      bodyHtml += '<div class="source-quote">' + escapeHtml(card.text) + '</div>';
      if (card.fullText) {
        bodyHtml += '<button type="button" class="modal-toggle" id="modalFullToggle">🔎 궁금하면 전문 보기</button>';
        bodyHtml += '<div class="source-quote" id="modalFullText" hidden>' + escapeHtml(card.fullText) + '</div>';
      }
    }
    if (card.tableRows) {
      bodyHtml += '<table class="cmp-table"><thead><tr><th>조의제문의 표현</th><th>왕이 지목한 대상</th></tr></thead><tbody>';
      card.tableRows.forEach(function (r) {
        bodyHtml += '<tr><td>' + escapeHtml(r.left) + '</td><td>' + escapeHtml(r.right) + '</td></tr>';
      });
      bodyHtml += '</tbody></table>';
    }
    bodyEl.innerHTML = bodyHtml;
    modal.hidden = false;
    var fullToggle = document.getElementById('modalFullToggle');
    if (fullToggle) {
      fullToggle.addEventListener('click', function () {
        var box = document.getElementById('modalFullText');
        if (box) box.hidden = !box.hidden;
      });
    }
  }

  function closeSourceModal() {
    var modal = document.getElementById('sourceModal');
    if (modal) modal.hidden = true;
  }

  /* ══════════════ 사화 스테이지 (배경 + 사료 돋보기 + 판단 + 결과) ══════════════ */
  function renderSahwaStage(step) {
    CURRENT_SOURCE_CARDS = {};
    (step.sourceCards || []).forEach(function (c) { CURRENT_SOURCE_CARDS[c.key] = c; });

    var chosenKey = step.id + '_choice';
    var reasonKey = step.id + '_reason';
    var chosen = ANSWERS[chosenKey];

    var html = '<div class="card stage-card">';
    html += '<span class="stage-badge">' + escapeHtml(step.badge) + '</span>';
    html += '<h2>' + escapeHtml(step.title) + '</h2>';
    if (step.role) html += '<span class="role-badge">' + escapeHtml(step.role) + '</span>';

    html += '<div class="stage-facts">';
    step.bgFacts.forEach(function (f) { html += '<p>' + escapeHtml(f.text) + '</p>'; });
    html += '</div>';

    if (step.chat) {
      html += '<div class="chat-card">';
      html += '<h3>' + escapeHtml(step.chat.title) + '</h3>';
      html += '<p class="lead">' + escapeHtml(step.chat.lead) + '</p>';
      html += '<div class="chat-wrap">';
      step.chat.lines.forEach(function (l) {
        if (l.narration) {
          html += '<div class="chat-narration">' + escapeHtml(l.text) + '</div>';
          return;
        }
        var isRoyal = l.speaker === '중종' || l.speaker === '왕';
        html += '<div class="chat-line' + (isRoyal ? ' royal' : '') + '">';
        html += '<div class="avatar' + (isRoyal ? ' royal' : '') + '">' + escapeHtml(l.speaker.slice(0, 1)) + '</div>';
        html += '<div class="chat-body"><div class="who">' + escapeHtml(l.speaker) + '</div><div class="bubble">' + escapeHtml(l.text) + '</div></div>';
        html += '</div>';
      });
      html += '</div></div>';
    }

    if (step.sourceCards && step.sourceCards.length) {
      html += '<div class="source-btn-row">';
      step.sourceCards.forEach(function (c) {
        html += '<button type="button" class="source-btn" data-source="' + c.key + '">🔍 ' + escapeHtml(c.title) + '</button>';
      });
      html += '</div>';
    }

    html += '<h3 class="judgment-heading">당신의 역사적 선택은?</h3>';
    html += '<p class="lead">' + escapeHtml(step.judgment.lead) + '</p>';
    html += '<div class="choice-grid">';
    step.judgment.choices.forEach(function (c) {
      html += '<button type="button" class="choice-card' + (chosen === c.id ? ' selected' : '') + '" data-choice="' + c.id + '">';
      html += '<span class="choice-tag">' + escapeHtml(c.tag) + '</span>';
      html += '<span class="choice-text">' + escapeHtml('(' + c.id + ') ' + c.label) + '</span>';
      html += '</button>';
    });
    html += '</div>';

    html += '<label class="field-label">이 선택을 한 이유를 한 줄로 적어줘.</label>';
    html += '<textarea class="text-field" rows="2" data-key="' + reasonKey + '">' + escapeHtml(ANSWERS[reasonKey] || '') + '</textarea>';
    html += hintHtml(reasonKey, step.judgment.reasonHint);

    if (chosen) {
      html += '<div class="feedback-box"><strong>⚔️ 실제로는 이렇게 됐어</strong>';
      html += '<p>' + escapeHtml(step.judgment.feedback[chosen] || '') + '</p>';
      if (step.resultQuote) html += '<div class="source-quote">' + escapeHtml(step.resultQuote.text) + '</div>';
      step.resultFacts.forEach(function (f) { html += '<p>' + escapeHtml(f.text) + '</p>'; });
      html += '</div>';
    }

    html += '</div>';
    return {
      html: html,
      afterMount: function (root) {
        root.querySelectorAll('.choice-card').forEach(function (btn) {
          btn.addEventListener('click', function () {
            setAnswer(chosenKey, btn.getAttribute('data-choice'));
            renderCurrentStep();
          });
        });
        bindTextFieldsAndHints(root);
        root.querySelectorAll('.source-btn').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var card = CURRENT_SOURCE_CARDS[btn.getAttribute('data-source')];
            if (card) openSourceModal(card);
          });
        });
      }
    };
  }

  /* ══════════════ 전환 카드 (카드뉴스형) ══════════════ */
  function renderTransitionCards(step) {
    var html = '<div class="card transition-card">';
    html += '<span class="stage-badge muted">' + escapeHtml(step.badge) + '</span>';
    html += '<h2>' + escapeHtml(step.title) + '</h2>';
    html += '<p class="lead">' + escapeHtml(step.lead) + '</p>';
    html += '<div class="transition-grid">';
    step.cards.forEach(function (c) {
      html += '<div class="transition-item">';
      html += '<div class="transition-item-head"><span class="transition-icon">' + escapeHtml(c.icon) + '</span>';
      html += '<div><div class="transition-item-title">' + escapeHtml(c.title) + '</div><div class="transition-item-sub">' + escapeHtml(c.sub) + '</div></div></div>';
      html += '<p>' + escapeHtml(c.desc.text) + '</p>';
      html += '</div>';
    });
    html += '</div>';
    html += '<div class="callout-box">💡 ' + escapeHtml(step.callout) + '</div>';
    html += '</div>';
    return { html: html };
  }

  function labelForChoice(step, choiceId) {
    if (!step || !choiceId || !step.judgment) return '';
    var found = (step.judgment.choices || []).filter(function (c) { return c.id === choiceId; })[0];
    return found ? found.label : choiceId;
  }

  /* ══════════════ 회고 + 서논술형 글쓰기 조합기 ══════════════ */
  function essayAutoFillText(step) {
    var mStep = findStep('m_stage'), kStep = findStep('k_stage'), tStep = findStep('t2');
    var mLabel = labelForChoice(mStep, ANSWERS.m_stage_choice);
    var kLabel = labelForChoice(kStep, ANSWERS.k_stage_choice);

    var claimParts = ['나는 무오사화 판단에서 "' + mLabel + '"을(를), 기묘사화 판단에서 "' + kLabel + '"을(를) 선택했다.'];
    if (ANSWERS.m_stage_reason) claimParts.push(ANSWERS.m_stage_reason);
    if (ANSWERS.k_stage_reason) claimParts.push(ANSWERS.k_stage_reason);
    claimParts.push('사림이 거듭된 사화에도 훈구 비판을 멈추지 않은 것은, 자신들이 지켜야 할 원칙을 포기할 수 없었기 때문이라고 생각한다.');

    var evidence = mStep.bgFacts[0].text + ' ' + kStep.bgFacts[1].text;

    var counter = '일각에서는 훈구와 타협하거나 개혁의 속도를 늦추는 편이 더 안전했다고 볼 수 있다. 하지만 사림에게 그것은 3사 언관·대간으로서 지켜야 할 원칙을 스스로 저버리는 일과 같았다.';

    var conclusion = tStep.callout;
    if (ANSWERS.write1_text) conclusion += ' 글쓰기①에서 내가 쓴 "' + ANSWERS.write1_text + '"도 같은 맥락이다.';

    return { claim: claimParts.join(' '), evidence: evidence, counter: counter, conclusion: conclusion };
  }

  function renderRecap(step) {
    var write1Step = findStep('write1');
    var sarimCardText = write1CardText(write1Step, ANSWERS.write1_sarim_card) || '(기록 없음)';
    var hoonguCardText = write1CardText(write1Step, ANSWERS.write1_hoongu_card) || '(기록 없음)';
    var mStep = findStep('m_stage'), kStep = findStep('k_stage');
    var html = '<div class="card">';
    html += '<h2>' + escapeHtml(step.title) + '</h2>';

    html += '<div class="recap-item"><h3>글쓰기 ① — 고른 카드와 한 마디</h3><div class="recap-value">사림 카드: ' + escapeHtml(sarimCardText) + '<br>훈구 카드: ' + escapeHtml(hoonguCardText) + (ANSWERS.write1_text ? ('<br>' + escapeHtml(ANSWERS.write1_text)) : '') + '</div></div>';

    html += '<div class="recap-item"><h3>무오사화 — 네 판단</h3>';
    html += '<div class="recap-value">' + escapeHtml('(' + (ANSWERS.m_stage_choice || '?') + ') ' + labelForChoice(mStep, ANSWERS.m_stage_choice)) + '<br>' + escapeHtml(ANSWERS.m_stage_reason || '') + '</div></div>';

    html += '<div class="recap-item"><h3>기묘사화 — 네 판단</h3>';
    html += '<div class="recap-value">' + escapeHtml('(' + (ANSWERS.k_stage_choice || '?') + ') ' + labelForChoice(kStep, ANSWERS.k_stage_choice)) + '<br>' + escapeHtml(ANSWERS.k_stage_reason || '') + '</div></div>';

    html += '<div class="essay-box">';
    html += '<span class="stage-badge">✍️ 탐구 서논술문 완성</span>';
    html += '<h3 class="essay-question">🎯 ' + escapeHtml(step.essayQuestion) + '</h3>';
    step.essayParts.forEach(function (p) {
      var key = 'essay_' + p.key;
      html += '<label class="field-label">' + escapeHtml(p.label) + '</label>';
      html += '<textarea class="text-field" rows="3" data-key="' + key + '" placeholder="' + escapeAttr(p.placeholder) + '">' + escapeHtml(ANSWERS[key] || '') + '</textarea>';
    });
    html += '<div class="essay-actions">';
    html += '<button type="button" class="nav-btn prev" id="essayAutoFill" style="flex:none; padding:0 16px;">🪄 내 선택으로 자동 완성</button>';
    html += '<button type="button" class="nav-btn next" id="essayCopy" style="flex:none; padding:0 16px;">📋 복사하기</button>';
    html += '</div>';
    html += '<p id="essayCopyStatus" style="margin-top:8px; font-size:.86rem; color:var(--ink-soft);"></p>';
    html += '</div>';

    html += '<div class="padlet-box"><p>' + escapeHtml(step.padletLead) + '</p>';
    html += '<p style="margin-top:8px; font-size:.94rem; color:var(--ink-soft);">' + escapeHtml(step.padletPrompt) + '</p>';
    html += padletLinkHtml('글쓰기 ② 이어서 쓰기');
    html += '<p id="submitStatus" style="margin-top:12px; font-size:.86rem; color:var(--ink-soft);"></p>';
    html += '</div></div>';

    return {
      html: html,
      afterMount: function (root) {
        bindTextFieldsAndHints(root);
        var autoBtn = root.querySelector('#essayAutoFill');
        if (autoBtn) {
          autoBtn.addEventListener('click', function () {
            var filled = essayAutoFillText(step);
            step.essayParts.forEach(function (p) { setAnswer('essay_' + p.key, filled[p.key]); });
            renderCurrentStep();
          });
        }
        var copyBtn = root.querySelector('#essayCopy');
        if (copyBtn) {
          copyBtn.addEventListener('click', function () {
            var lines = step.essayParts.map(function (p) {
              return '[' + p.label.replace(/^\d+\.\s*/, '') + ']\n' + (ANSWERS['essay_' + p.key] || '');
            });
            copyToClipboard(lines.join('\n\n')).then(function (ok) {
              var el = document.getElementById('essayCopyStatus');
              if (el) el.textContent = ok ? '복사됐어. 제출란에 붙여넣어줘.' : '복사에 실패했어. 직접 옮겨 적어줘.';
            });
          });
        }
        updateSubmitStatus();
      }
    };
  }

  function padletLinkHtml(label) {
    if (!SESSION.ban || !CONFIG.PADLET_BY_BAN[SESSION.ban]) {
      return '<div class="note-box">담당 반 정보가 없어서 링크를 자동으로 못 찾았어. 선생님께 문의해줘.</div>';
    }
    return '<a class="padlet-link" href="' + escapeAttr(CONFIG.PADLET_BY_BAN[SESSION.ban]) + '" target="_blank" rel="noopener">' + escapeHtml(label || 'Padlet 열기') + '</a>';
  }

  function findStep(id) {
    return CONTENT.steps.filter(function (s) { return s.id === id; })[0];
  }

  /* ══════════════ 공용 이벤트 바인딩 ══════════════ */
  function bindTextFieldsAndHints(root) {
    root.querySelectorAll('.hint-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var box = document.getElementById(btn.getAttribute('data-target'));
        if (box) box.hidden = !box.hidden;
      });
    });
    root.querySelectorAll('textarea[data-key]').forEach(function (el) {
      el.addEventListener('input', function () {
        setAnswer(el.getAttribute('data-key'), el.value);
        updateNavState();
      });
    });
  }

  /* ══════════════ 스텝 완료 판정 (다음 버튼 활성화 조건) ══════════════ */
  function stepIsComplete(step) {
    switch (step.type) {
      case 'write1': return !!ANSWERS.write1_sarim_card && !!ANSWERS.write1_hoongu_card && (ANSWERS.write1_text || '').trim().length >= WRITE1_MIN_TEXT_LEN;
      case 'sahwaStage': return !!ANSWERS[step.id + '_choice'] && (ANSWERS[step.id + '_reason'] || '').trim().length > 0;
      default: return true;
    }
  }

  /* ══════════════ 메인 렌더 루프 ══════════════ */
  var RENDERERS = {
    write1: renderWrite1,
    sahwaStage: renderSahwaStage,
    transitionCards: renderTransitionCards,
    recap: renderRecap
  };

  // preserveScroll=true면 스크롤 위치를 그대로 둔다 — 글쓰기① 카드 분류처럼
  // 같은 화면 안에서 여러 번 눌러야 하는 조작에서 클릭마다 맨 위로 튀는 걸 막기
  // 위함. 스텝 자체가 바뀌는 이동(이전/다음, 로그인 확인)은 그대로 위로 올린다.
  function renderCurrentStep(preserveScroll) {
    var stepArea = document.getElementById('stepArea');
    var out;
    if (stepIndex === -1) {
      out = renderLogin();
    } else {
      var step = CONTENT.steps[stepIndex];
      var renderer = RENDERERS[step.type];
      out = renderer(step);
    }
    stepArea.innerHTML = out.html;
    if (out.afterMount) out.afterMount(stepArea);
    updateProgress();
    updateNavState();
    if (!preserveScroll) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });

    if (stepIndex >= 0 && CONTENT.steps[stepIndex].type === 'recap' && !SESSION.preview) {
      submitFinalIfNeeded();
    }
  }

  function updateProgress() {
    var total = CONTENT.steps.length;
    if (stepIndex === -1) {
      document.getElementById('progressFill').style.width = '0%';
      document.getElementById('progressLabel').textContent = '학번 확인';
      return;
    }
    var pct = Math.round(((stepIndex) / (total - 1)) * 100);
    document.getElementById('progressFill').style.width = pct + '%';
    document.getElementById('progressLabel').textContent = (stepIndex + 1) + ' / ' + total;
  }

  function updateNavState() {
    var nextBtn = document.getElementById('navNext');
    var prevBtn = document.getElementById('navPrev');
    prevBtn.style.visibility = (stepIndex <= 0) ? 'hidden' : 'visible';

    if (stepIndex === -1) {
      nextBtn.style.display = 'block';
      nextBtn.disabled = !loginIsComplete();
      nextBtn.textContent = '확인하고 시작하기';
      return;
    }
    var step = CONTENT.steps[stepIndex];
    if (step.type === 'recap') {
      nextBtn.style.display = 'none';
    } else {
      nextBtn.style.display = 'block';
      nextBtn.disabled = !stepIsComplete(step);
      nextBtn.textContent = stepIndex === CONTENT.steps.length - 2 ? '회고 화면으로' : '다음';
    }
  }

  function goNext() {
    if (stepIndex === -1) {
      if (!loginIsComplete()) return;
      loadAnswers(); // 확정된 SESSION.sid로 그 학생의 저장 기록을 불러온다
      initWrite1State(); // 글쓰기① 카드 순서·분류 상태를 저장된 답 기준으로 맞춘다
      stepIndex = 0;
      renderCurrentStep();
      return;
    }
    if (stepIndex < CONTENT.steps.length - 1) { stepIndex++; renderCurrentStep(); }
  }
  function goPrev() {
    if (stepIndex > -1) { stepIndex--; renderCurrentStep(); }
  }

  /* ══════════════ 최종 제출 (게임활동_로그, 기본 제출 경로 — 별도 action 없음) ══════════════ */
  function buildChoiceSummary() {
    var m = ANSWERS.m_stage_choice || '?';
    var k = ANSWERS.k_stage_choice || '?';
    return '무오:' + m + ' / 기묘:' + k;
  }

  function buildDiffSummary() {
    return '무오 — 정문형 등의 의견이 채택됐고, 다른 의견(이유청 등)을 낸 신하는 형장 처벌을 받음(실록 확인) / ' +
      '기묘 — 조광조는 사사, 김정·김식·김구는 절도 안치, 나머지는 극변 안치(실록 확인)';
  }

  function buildReflection() {
    var lines = [];
    function push(label, val) { if (val) lines.push('[' + label + '] ' + val); }
    push('글쓰기① 사림 카드', write1CardText(findStep('write1'), ANSWERS.write1_sarim_card));
    push('글쓰기① 훈구 카드', write1CardText(findStep('write1'), ANSWERS.write1_hoongu_card));
    push('글쓰기① 한 마디', ANSWERS.write1_text);
    push('무오 판단 이유', ANSWERS.m_stage_reason);
    push('기묘 판단 이유', ANSWERS.k_stage_reason);
    push('서논술 주장', ANSWERS.essay_claim);
    push('서논술 근거', ANSWERS.essay_evidence);
    push('서논술 반론', ANSWERS.essay_counter);
    push('서논술 결론', ANSWERS.essay_conclusion);
    return lines.join('\n');
  }

  function submitFinalIfNeeded() {
    if (ANSWERS.__submitted === true) { updateSubmitStatus(); return; }
    submitState = 'saving';
    updateSubmitStatus();
    var payload = {
      studentId: SESSION.sid,
      studentName: SESSION.name,
      gameName: CONFIG.GAME_NAME,
      choiceSummary: buildChoiceSummary(),
      diffSummary: buildDiffSummary(),
      reflection: buildReflection(),
      choicesJson: JSON.stringify(ANSWERS)
    };
    fetchJsonRetry(CONFIG.SHEET_WEBAPP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).then(function () {
      submitState = 'done';
      ANSWERS.__submitted = true;
      saveAnswers();
      updateSubmitStatus();
    }).catch(function (err) {
      submitState = 'failed';
      console.warn('[joseon-sarim] 제출 실패:', err);
      updateSubmitStatus();
    });
  }

  function updateSubmitStatus() {
    var el = document.getElementById('submitStatus');
    if (!el) return;
    if (SESSION.preview) { el.textContent = '(미리보기 모드 — 기록 저장 안 됨)'; return; }
    if (submitState === 'saving') el.textContent = '기록 저장 중...';
    else if (submitState === 'done') el.textContent = '기록이 저장됐어.';
    else if (submitState === 'failed') el.textContent = '기록 저장에 실패했어. 화면을 새로고침해서 다시 시도해봐.';
    else el.textContent = '';
  }

  /* ══════════════ 초기화 ══════════════ */
  function init() {
    // 포털에서 넘어온 값은 "임시로" 채워두기만 하고, 실제로 확정하는 건
    // 로그인 확인 화면에서 학생이 "확인하고 시작하기"를 눌렀을 때다
    // (webapp-builder 스킬: 자동 채움만 하고 확인 화면을 건너뛰지 않는다).
    SESSION.sid = getQueryParam('sid');
    SESSION.name = getQueryParam('name');
    SESSION.preview = getQueryParam('preview') === '1';
    var parsed = parseStudentId(SESSION.sid);
    if (parsed) { SESSION.grade = parsed.grade; SESSION.ban = parsed.ban; SESSION.number = parsed.number; }

    if (SESSION.preview) document.getElementById('devBanner').hidden = false;

    document.getElementById('navNext').addEventListener('click', goNext);
    document.getElementById('navPrev').addEventListener('click', goPrev);

    var modalClose = document.getElementById('modalClose');
    if (modalClose) modalClose.addEventListener('click', closeSourceModal);
    var modalBackdrop = document.getElementById('sourceModal');
    if (modalBackdrop) {
      modalBackdrop.addEventListener('click', function (e) {
        if (e.target === modalBackdrop) closeSourceModal();
      });
    }

    renderCurrentStep();
  }

  // 파일 내 모든 함수 선언이 끝난 뒤, 문서 로드 완료 시 한 번만 호출한다.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

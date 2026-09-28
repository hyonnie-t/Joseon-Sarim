/* ══════════════════════════════════════════════════════════
 * app.js — 렌더링/상태 로직만 담당한다. 역사 서술 문장은 절대 여기 하드
 * 코딩하지 않는다 (전부 data.js). 함수는 전부 선언만 먼저 하고, 실제
 * 실행(init 호출)은 파일 맨 마지막에 둔다 — IIFE에서 아래쪽 const를
 * 참조하는 TDZ 에러를 피하기 위한 webapp-builder 스킬 규칙.
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

  /* ── 글쓰기① 전용 상태(v1.2) — 카드 분류 단계는 ANSWERS에 바로 반영되지 않는
   * "몇 번 틀렸는지/이번에 뭐가 틀렸는지" 같은 화면 표시용 상태가 필요해서
   * write1/app.js(독립 페이지)와 같은 방식으로 모듈 변수로 따로 둔다.
   * loadAnswers() 직후 initWrite1State()가 저장된 답으로 한 번 맞춰준다. */
  var WRITE1_MIN_TEXT_LEN = 10;
  var WRITE1_CARD_ORDER = null;
  var WRITE1_CLASSIFY = {};
  var WRITE1_WRONG = [];
  var WRITE1_CHECKED = false;
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

  /* ══════════════ 소스 배지 ══════════════ */
  function tagClassFor(label) {
    if (label === '실록 확인') return 'tag-실록';
    if (label === '교과서') return 'tag-교과서';
    if (label === '2차') return 'tag-2차';
    return '';
  }

  function srcBadgeHtml(sourceId) {
    var src = SOURCES[sourceId];
    if (!src) return '';
    return '<span class="src-tag ' + tagClassFor(src.label) + '" title="' + escapeAttr(src.cite) + '">' + src.label + (src.url ? '' : '') + '</span>';
  }

  var easySeq = 0;
  function factHtml(f) {
    if (!f) return '';
    if (!f.sourceId) {
      console.warn('[sourceId 누락] 사실 서술 노드에 sourceId가 없습니다:', f.text);
    }
    var id = 'easy_' + (easySeq++);
    var html = '<div class="fact">';
    html += '<p>' + escapeHtml(f.text) + '</p>';
    html += '<div class="fact-meta">' + srcBadgeHtml(f.sourceId);
    if (!f.verified) html += '<span class="badge-unverified">원문 대조 전</span>';
    html += '</div>';
    if (f.easy) {
      html += '<button type="button" class="easy-toggle" data-target="' + id + '">💬 쉬운 말로 풀어보면 (교사 검수 전)</button>';
      html += '<div class="easy-box" id="' + id + '" hidden><span class="easy-label">학생용 풀이 · 교사 검수 전</span>' + escapeHtml(f.easy) + '</div>';
    }
    html += '</div>';
    return html;
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
   * 자동 채움만 하고 화면을 건너뛰면 안 된다 — 잘못 넘어왔을 때 고칠
   * 방법이 없어지기 때문. */
  function renderLogin() {
    var html = '<div class="card">';
    html += '<h2>학번·이름 확인</h2>';
    html += '<p class="lead">포털에서 넘어온 값이야. 맞는지 확인하고, 틀렸으면 고쳐줘.</p>';
    html += '<label class="field-label">학번 (5자리)</label>';
    html += '<input type="text" inputmode="numeric" maxlength="5" class="text-field" id="loginSid" value="' + escapeAttr(SESSION.sid) + '" placeholder="예: 30512">';
    html += '<label class="field-label">이름</label>';
    html += '<input type="text" class="text-field" id="loginName" value="' + escapeAttr(SESSION.name) + '" placeholder="이름">';
    html += '<p id="loginError" class="note-box" style="display:none; color:var(--seal); border-color:#F0CFC9;"></p>';
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

  /* ── 글쓰기 ① — 카드 분류(사림·훈구) → 카드 두 장 골라 한 마디 쓰기 (v1.2) ──
   * write1/app.js(독립 배포 페이지)와 같은 흐름을 이 스텝 기반 앱 안에 이식한
   * 것. 전역 이전/다음 내비게이션은 그대로 두고, 그 안에서 phase(classify/write)
   * 를 자체적으로 넘긴다 — "확인하기"는 스텝을 넘기는 버튼이 아니라 카드 분류가
   * 맞았는지만 확인하는 별도 버튼이다. */
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
  function write1CardsToShow(step) {
    if (!WRITE1_CHECKED) return WRITE1_CARD_ORDER;
    return WRITE1_CARD_ORDER.filter(function (id) { return WRITE1_WRONG.indexOf(id) !== -1; });
  }
  function write1AllClassified(ids) {
    return ids.every(function (id) { return !!WRITE1_CLASSIFY[id]; });
  }

  // 로그인 확인 직후 한 번 호출 — 저장된 답으로 카드 순서·분류 상태·phase를 맞춘다.
  function initWrite1State() {
    var step = findStep('write1');
    WRITE1_CARD_ORDER = shuffledIds(step.cards);
    WRITE1_CLASSIFY = ANSWERS.write1_classification || {};
    var allCorrect = step.cards.length > 0 && step.cards.every(function (c) { return WRITE1_CLASSIFY[c.id] === c.answer; });
    if (allCorrect) {
      WRITE1_CHECKED = true;
      WRITE1_WRONG = [];
      WRITE1_PHASE = 'write';
    } else {
      WRITE1_CHECKED = (ANSWERS.write1_attempts || 0) > 0;
      WRITE1_WRONG = WRITE1_CHECKED ? step.cards.filter(function (c) { return WRITE1_CLASSIFY[c.id] !== c.answer; }).map(function (c) { return c.id; }) : [];
      WRITE1_PHASE = 'classify';
    }
  }

  function renderWrite1(step) {
    return WRITE1_PHASE === 'write' ? renderWrite1Write(step) : renderWrite1Classify(step);
  }

  function renderWrite1Classify(step) {
    var ids = write1CardsToShow(step);
    var html = '<div class="card">';
    html += '<h2>' + escapeHtml(step.title) + ' — 카드 분류</h2>';
    html += '<p class="lead">' + escapeHtml(step.classifyLead) + '</p>';
    if (WRITE1_CHECKED && ids.length > 0) {
      html += '<div class="note-box">' + escapeHtml(step.wrongMsg) + '</div>';
    }
    html += '<div class="classify-list">';
    ids.forEach(function (id) {
      var card = write1CardById(step, id);
      var picked = WRITE1_CLASSIFY[id];
      html += '<div class="classify-card" data-card-row="' + id + '">';
      html += '<p class="classify-text">' + escapeHtml(card.text) + '</p>';
      html += '<div class="classify-btns">';
      html += '<button type="button" class="classify-btn' + (picked === 'sarim' ? ' selected-sarim' : '') + '" data-card="' + id + '" data-side="sarim">사림</button>';
      html += '<button type="button" class="classify-btn' + (picked === 'hoongu' ? ' selected-hoongu' : '') + '" data-card="' + id + '" data-side="hoongu">훈구</button>';
      html += '</div></div>';
    });
    html += '</div>';
    html += '<div class="nav-row"><button type="button" class="nav-btn next" id="checkClassify"' + (write1AllClassified(ids) ? '' : ' disabled') + '>확인하기</button></div>';
    html += '</div>';
    return {
      html: html,
      afterMount: function (root) {
        var checkBtn = root.querySelector('#checkClassify');
        // 카드가 10장이라 다른 스텝의 choice-btn처럼 클릭마다 renderCurrentStep()을
        // 부르면 매번 화면이 맨 위로 스크롤돼 버린다(카드를 10번 눌러야 하는데
        // 그때마다 스크롤이 튀는 건 write1/app.js에서도 피했던 문제) — 여기서는
        // 버튼 클래스만 직접 바꿔서 스크롤 위치를 유지한다.
        root.querySelectorAll('.classify-btn').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = btn.getAttribute('data-card');
            var side = btn.getAttribute('data-side');
            WRITE1_CLASSIFY[id] = side;
            setAnswer('write1_classification', WRITE1_CLASSIFY);

            var row = root.querySelector('.classify-card[data-card-row="' + id + '"]');
            row.querySelectorAll('.classify-btn').forEach(function (b) {
              b.classList.remove('selected-sarim', 'selected-hoongu');
            });
            btn.classList.add(side === 'sarim' ? 'selected-sarim' : 'selected-hoongu');

            checkBtn.disabled = !write1AllClassified(write1CardsToShow(step));
          });
        });
        checkBtn.addEventListener('click', function () {
          var visible = write1CardsToShow(step);
          ANSWERS.write1_attempts = (ANSWERS.write1_attempts || 0) + 1;
          setAnswer('write1_attempts', ANSWERS.write1_attempts);
          var newWrong = visible.filter(function (id) {
            return WRITE1_CLASSIFY[id] !== write1CardById(step, id).answer;
          });
          WRITE1_CHECKED = true;
          WRITE1_WRONG = newWrong;
          if (WRITE1_WRONG.length === 0) WRITE1_PHASE = 'write';
          renderCurrentStep();
        });
      }
    };
  }

  function renderWrite1Write(step) {
    var sarimCards = write1CardsBySide(step, 'sarim');
    var hoonguCards = write1CardsBySide(step, 'hoongu');
    var text = ANSWERS.write1_text || '';
    var html = '<div class="card">';
    html += '<h2>' + escapeHtml(step.title) + ' — 한 마디 쓰기</h2>';
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

  function renderBackground(step) {
    var html = '<div class="card">';
    html += '<h2>' + escapeHtml(step.title) + '</h2>';
    if (step.role) html += '<span class="role-badge">' + escapeHtml(step.role) + '</span>';
    step.facts.forEach(function (f) { html += factHtml(f); });
    if (step.note) html += '<div class="note-box">' + escapeHtml(step.note) + '</div>';
    html += '</div>';
    return { html: html, afterMount: bindEasyToggles };
  }

  function renderSourceReveal(step) {
    var html = '<div class="card">';
    html += '<h2>' + escapeHtml(step.title) + '</h2>';
    html += '<p class="lead">' + escapeHtml(step.lead) + '</p>';
    var s = step.source;
    html += '<div class="source-quote' + (s.verified ? '' : ' placeholder') + '">' + escapeHtml(s.text) + '</div>';
    html += '<div class="fact-meta">' + srcBadgeHtml(s.sourceId) + (s.verified ? '' : '<span class="badge-unverified">원문 대조 전</span>') + '</div>';
    if (s.easy) {
      html += '<button type="button" class="easy-toggle" data-target="' + step.id + '_easy">💬 쉬운 말로 풀어보면 (교사 검수 전)</button>';
      html += '<div class="easy-box" id="' + step.id + '_easy" hidden><span class="easy-label">학생용 풀이 · 교사 검수 전</span>' + escapeHtml(s.easy) + '</div>';
    }
    if (s.fullText) {
      html += '<button type="button" class="easy-toggle" data-target="' + step.id + '_full">🔎 궁금하면 전문 보기</button>';
      html += '<div class="easy-box" id="' + step.id + '_full" hidden><div class="source-quote' + (s.verified ? '' : ' placeholder') + '" style="margin-bottom:0;">' + escapeHtml(s.fullText) + '</div></div>';
    }
    step.questions.forEach(function (q) {
      var key = step.id + '_' + q.id;
      html += '<label class="field-label">' + escapeHtml(q.label) + '</label>';
      if (q.choices) {
        html += '<div class="choice-list">';
        q.choices.forEach(function (c) {
          html += '<button type="button" class="choice-btn' + (ANSWERS[key] === c.id ? ' selected' : '') + '" data-qkey="' + key + '" data-choice="' + c.id + '">' + escapeHtml(c.label) + '</button>';
        });
        html += '</div>';
      } else {
        html += '<textarea class="text-field" rows="2" data-key="' + key + '">' + escapeHtml(ANSWERS[key] || '') + '</textarea>';
        html += hintHtml(key, q.hint);
      }
    });
    html += '</div>';
    return {
      html: html,
      afterMount: function (root) {
        bindEasyToggles(root);
        bindTextFieldsAndHints(root);
        root.querySelectorAll('.choice-btn[data-qkey]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            setAnswer(btn.getAttribute('data-qkey'), btn.getAttribute('data-choice'));
            renderCurrentStep();
          });
        });
      }
    };
  }

  function renderSourceTable(step) {
    var html = '<div class="card">';
    html += '<h2>' + escapeHtml(step.title) + '</h2>';
    html += '<p class="lead">' + escapeHtml(step.lead) + '</p>';
    var t = step.table;
    html += '<table class="cmp-table"><caption>' + escapeHtml(step.tableCaption) + '</caption>';
    html += '<thead><tr><th>조의제문의 표현</th><th>왕의 전지가 지목한 대상</th></tr></thead><tbody>';
    t.rows.forEach(function (r) {
      html += '<tr><td>' + escapeHtml(r.left) + '</td><td>' + escapeHtml(r.right) + '</td></tr>';
    });
    html += '</tbody></table>';
    html += '<div class="fact-meta">' + srcBadgeHtml(t.sourceId) + (t.verified ? '' : '<span class="badge-unverified">원문 대조 전</span>') + '</div>';
    var key = step.id + '_' + step.question.id;
    html += '<label class="field-label">' + escapeHtml(step.question.label) + '</label>';
    html += '<textarea class="text-field" rows="2" data-key="' + key + '">' + escapeHtml(ANSWERS[key] || '') + '</textarea>';
    html += hintHtml(key, step.question.hint);
    html += '</div>';
    return { html: html, afterMount: function (root) { bindEasyToggles(root); bindTextFieldsAndHints(root); } };
  }

  function renderJudgment(step) {
    var chosenKey = step.id + '_choice';
    var reasonKey = step.id + '_reason';
    var chosen = ANSWERS[chosenKey];
    var html = '<div class="card">';
    html += '<h2>' + escapeHtml(step.title) + '</h2>';
    html += '<p class="lead">' + escapeHtml(step.lead) + '</p>';
    html += '<div class="choice-list">';
    step.choices.forEach(function (c) {
      html += '<button type="button" class="choice-btn' + (chosen === c.id ? ' selected' : '') + '" data-choice="' + c.id + '">' + escapeHtml('(' + c.id + ') ' + c.label) + '</button>';
    });
    html += '</div>';
    html += '<div class="fact-meta">' + srcBadgeHtml(step.choiceSourceId) + '</div>';
    html += '<label class="field-label">이유를 한 줄로 적어줘.</label>';
    html += '<textarea class="text-field" rows="2" data-key="' + reasonKey + '">' + escapeHtml(ANSWERS[reasonKey] || '') + '</textarea>';
    html += hintHtml(reasonKey, step.reasonHint);
    html += '</div>';
    return {
      html: html,
      afterMount: function (root) {
        root.querySelectorAll('.choice-btn').forEach(function (btn) {
          btn.addEventListener('click', function () {
            setAnswer(chosenKey, btn.getAttribute('data-choice'));
            renderCurrentStep();
          });
        });
        bindTextFieldsAndHints(root);
      }
    };
  }

  function renderResult(step) {
    var html = '<div class="card">';
    html += '<h2>' + escapeHtml(step.title) + '</h2>';
    if (step.lead) html += '<p class="lead">' + escapeHtml(step.lead) + '</p>';
    if (step.quote) {
      html += '<div class="source-quote' + (step.quote.verified ? '' : ' placeholder') + '">' + escapeHtml(step.quote.text) + '</div>';
      html += '<div class="fact-meta">' + srcBadgeHtml(step.quote.sourceId) + (step.quote.verified ? '' : '<span class="badge-unverified">원문 대조 전</span>') + '</div>';
      if (step.quote.easy) {
        html += '<button type="button" class="easy-toggle" data-target="resultQuoteEasy">💬 쉬운 말로 풀어보면 (교사 검수 전)</button>';
        html += '<div class="easy-box" id="resultQuoteEasy" hidden><span class="easy-label">학생용 풀이 · 교사 검수 전</span>' + escapeHtml(step.quote.easy) + '</div>';
      }
    }
    step.facts.forEach(function (f) { html += factHtml(f); });
    if (step.addendum) html += factHtml(step.addendum);
    html += '</div>';
    return { html: html, afterMount: bindEasyToggles };
  }

  function renderReflectOptional(step) {
    var key = 'reflect_' + step.id;
    var html = '<div class="card">';
    html += '<h2>' + escapeHtml(step.title) + '</h2>';
    html += '<label class="field-label">' + escapeHtml(step.question.label) + ' <span style="font-weight:400;color:var(--ink-soft);">(선택)</span></label>';
    html += '<textarea class="text-field" rows="2" data-key="' + key + '">' + escapeHtml(ANSWERS[key] || '') + '</textarea>';
    html += hintHtml(key, step.question.hint);
    html += '</div>';
    return { html: html, afterMount: bindTextFieldsAndHints };
  }

  function renderTransition(step) {
    var html = '<div class="card transition-card">';
    html += '<h2>' + escapeHtml(step.title) + '</h2>';
    if (step.years) html += '<div class="transition-years">' + escapeHtml(step.years) + '</div>';
    html += '<div style="text-align:left;">';
    step.facts.forEach(function (f) { html += factHtml(f); });
    if (step.interpretation) html += factHtml(step.interpretation);
    html += '</div>';
    if (step.note) html += '<div class="note-box" style="text-align:left;">' + escapeHtml(step.note) + '</div>';
    if (step.question) {
      var key = 't_' + step.id;
      html += '<label class="field-label" style="text-align:left;">' + escapeHtml(step.question.label) + '</label>';
      html += '<textarea class="text-field" rows="2" data-key="' + key + '">' + escapeHtml(ANSWERS[key] || '') + '</textarea>';
    }
    html += '</div>';
    return { html: html, afterMount: function (root) { bindEasyToggles(root); bindTextFieldsAndHints(root); } };
  }

  function renderChat(step) {
    var html = '<div class="card">';
    html += '<h2>' + escapeHtml(step.title) + '</h2>';
    html += '<p class="lead">' + escapeHtml(step.lead) + '</p>';
    html += '<div class="chat-wrap">';
    step.lines.forEach(function (l) {
      if (l.narration) {
        html += '<div class="note-box" style="text-align:center; background:rgba(255,255,255,.6);">' + escapeHtml(l.text) + '</div>';
        return;
      }
      var isRoyal = l.speaker === '중종' || l.speaker === '왕';
      html += '<div class="chat-line' + (isRoyal ? ' royal' : '') + '">';
      html += '<div class="who">' + escapeHtml(l.speaker) + '</div>';
      html += '<div class="bubble">' + escapeHtml(l.text) + '</div>';
      html += '</div>';
    });
    html += '</div>';
    html += '<div class="fact-meta">' + srcBadgeHtml(step.chatSourceId) + (step.chatVerified ? '' : '<span class="badge-unverified">원문 대조 전</span>') + '</div>';
    if (step.easySummary) {
      html += '<button type="button" class="easy-toggle" data-target="chatEasy">' + escapeHtml(step.easyToggleLabel || '쉬운 말로 풀어보면 (교사 검수 전)') + '</button>';
      html += '<div class="easy-box" id="chatEasy" hidden><span class="easy-label">학생용 풀이 · 교사 검수 전</span>' + escapeHtml(step.easySummary) + '</div>';
    }
    html += '</div>';
    return { html: html, afterMount: bindEasyToggles };
  }

  function renderInterpretation(step) {
    var chosenKey = step.id + '_choice';
    var reasonKey = step.id + '_reason';
    var chosen = ANSWERS[chosenKey];
    var html = '<div class="card">';
    html += '<h2>' + escapeHtml(step.title) + '</h2>';
    html += '<p class="lead">' + escapeHtml(step.lead) + '</p>';
    step.views.forEach(function (v) {
      html += '<div class="view-card' + (chosen === v.id ? ' selected' : '') + '" data-choice="' + v.id + '">';
      html += '<div class="view-label">' + escapeHtml(v.label) + '</div>';
      html += '<p>' + escapeHtml(v.text.text) + '</p>';
      html += '<div class="fact-meta">' + srcBadgeHtml(v.text.sourceId) + '</div>';
      html += '</div>';
    });
    html += '<label class="field-label">' + escapeHtml(step.question.label) + ' <span style="font-weight:400;color:var(--ink-soft);">(선택 입력)</span></label>';
    html += '<textarea class="text-field" rows="2" data-key="' + reasonKey + '">' + escapeHtml(ANSWERS[reasonKey] || '') + '</textarea>';
    html += hintHtml(reasonKey, step.question.hint);
    html += '</div>';
    return {
      html: html,
      afterMount: function (root) {
        root.querySelectorAll('.view-card').forEach(function (el) {
          el.addEventListener('click', function () {
            setAnswer(chosenKey, el.getAttribute('data-choice'));
            renderCurrentStep();
          });
        });
        bindTextFieldsAndHints(root);
      }
    };
  }

  function labelForChoice(step, choiceId) {
    if (!step || !choiceId) return '';
    var found = (step.choices || []).filter(function (c) { return c.id === choiceId; })[0];
    return found ? found.label : choiceId;
  }

  function renderRecap(step) {
    var write1Step = findStep('write1');
    var sarimCardText = write1CardText(write1Step, ANSWERS.write1_sarim_card) || '(기록 없음)';
    var hoonguCardText = write1CardText(write1Step, ANSWERS.write1_hoongu_card) || '(기록 없음)';
    var mStep = findStep('m_judgment'), kStep = findStep('k_judgment'), interpStep = findStep('k_interpret');
    var html = '<div class="card">';
    html += '<h2>' + escapeHtml(step.title) + '</h2>';

    html += '<div class="recap-item"><h3>글쓰기 ① — 고른 카드와 한 마디</h3><div class="recap-value">사림 카드: ' + escapeHtml(sarimCardText) + '<br>훈구 카드: ' + escapeHtml(hoonguCardText) + (ANSWERS.write1_text ? ('<br>' + escapeHtml(ANSWERS.write1_text)) : '') + '</div></div>';

    html += '<div class="recap-item"><h3>무오사화 — 해석 비교</h3>';
    html += '<div class="recap-value">' + escapeHtml(ANSWERS.m_sourceB_compare || '(기록 없음)') + '</div></div>';

    html += '<div class="recap-item"><h3>무오사화 — 네 판단</h3>';
    html += '<div class="recap-value">' + escapeHtml('(' + (ANSWERS.m_judgment_choice || '?') + ') ' + labelForChoice(mStep, ANSWERS.m_judgment_choice)) + '<br>' + escapeHtml(ANSWERS.m_judgment_reason || '') + '</div></div>';

    html += '<div class="recap-item"><h3>기묘사화 — 네 판단</h3>';
    html += '<div class="recap-value">' + escapeHtml('(' + (ANSWERS.k_judgment_choice || '?') + ') ' + labelForChoice(kStep, ANSWERS.k_judgment_choice)) + '<br>' + escapeHtml(ANSWERS.k_judgment_reason || '') + '</div></div>';

    var closerLabel = ANSWERS.k_interpret_choice === 'view1' ? '조광조 일파의 급진성에 무게를 둔 해석' : (ANSWERS.k_interpret_choice === 'view2' ? '위훈삭제론의 타이밍에 무게를 둔 해석' : '(기록 없음)');
    html += '<div class="recap-item"><h3>기묘사화 — 가까웠던 해석</h3>';
    html += '<div class="recap-value">' + escapeHtml(closerLabel) + (ANSWERS.k_interpret_reason ? ('<br>' + escapeHtml(ANSWERS.k_interpret_reason)) : '') + '</div></div>';

    html += '<div class="padlet-box"><p>' + escapeHtml(step.padletLead) + '</p>';
    html += '<p style="margin-top:8px; font-size:.94rem; color:var(--ink-soft);">' + escapeHtml(step.padletPrompt) + '</p>';
    html += padletLinkHtml('글쓰기 ② 이어서 쓰기');
    html += '<p id="submitStatus" style="margin-top:12px; font-size:.86rem; color:var(--ink-soft);"></p>';
    html += '</div></div>';
    return { html: html, afterMount: function () { updateSubmitStatus(); } };
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
  function bindEasyToggles(root) {
    root.querySelectorAll('.easy-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var box = document.getElementById(btn.getAttribute('data-target'));
        if (box) box.hidden = !box.hidden;
      });
    });
  }

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
      case 'sourceReveal': return step.questions.every(function (q) {
        var key = step.id + '_' + q.id;
        if (q.choices) return !!ANSWERS[key];
        return (ANSWERS[key] || '').trim().length > 0;
      });
      case 'sourceTable': return (ANSWERS[step.id + '_' + step.question.id] || '').trim().length > 0;
      case 'judgment': return !!ANSWERS[step.id + '_choice'] && (ANSWERS[step.id + '_reason'] || '').trim().length > 0;
      case 'interpretation': return !!ANSWERS[step.id + '_choice'];
      default: return true;
    }
  }

  /* ══════════════ 메인 렌더 루프 ══════════════ */
  var RENDERERS = {
    write1: renderWrite1,
    background: renderBackground,
    sourceReveal: renderSourceReveal,
    sourceTable: renderSourceTable,
    judgment: renderJudgment,
    result: renderResult,
    reflectOptional: renderReflectOptional,
    transition: renderTransition,
    chat: renderChat,
    interpretation: renderInterpretation,
    recap: renderRecap
  };

  function renderCurrentStep() {
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
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });

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
    var m = ANSWERS.m_judgment_choice || '?';
    var k = ANSWERS.k_judgment_choice || '?';
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
    push('조의제문 해석 1', ANSWERS.m_sourceA_q1);
    push('조의제문 해석 2', ANSWERS.m_sourceA_q2);
    push('해석 비교', ANSWERS.m_sourceB_compare);
    push('무오 판단 이유', ANSWERS.m_judgment_reason);
    push('무오 성찰', ANSWERS.reflect_m_reflect);
    push('갑자·중종반정 비교', ANSWERS.t_t1);
    push('기묘 판단 이유', ANSWERS.k_judgment_reason);
    push('해석 갈림 이유', ANSWERS.k_interpret_reason);
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

    renderCurrentStep();
  }

  // 파일 내 모든 함수 선언이 끝난 뒤, 문서 로드 완료 시 한 번만 호출한다.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/* ══════════════════════════════════════════════════════════
 * write1/app.js — "사화 시뮬레이션(무오·기묘)" 전체 앱에서 글쓰기①만
 * 떼어 먼저 배포하기 위한 독립 페이지. 본 시뮬(../index.html)이 아직
 * 준비 중이어도 이 화면만 먼저 학생에게 줄 수 있게 만든 것.
 *
 * ../config.js를 그대로 불러 쓴다(SHEET_WEBAPP_URL, PADLET_BY_BAN 공유) —
 * 백엔드 URL이나 Padlet 링크가 바뀌면 한 곳(config.js)만 고치면 된다.
 * GAME_NAME만 이 페이지 전용으로 따로 둔다: 나중에 전체 시뮬이 열리면
 * 그 안의 write1 스텝과는 다른 gameName으로 별도 행이 쌓인다 —
 * history26 커리큘럼에도 이 페이지를 별도 활동으로 등록해야 하고,
 * 그때 activity id를 아래 WRITE1_GAME_NAME과 맞출 것.
 *
 * localStorage 키/필드명은 전체 시뮬(../app.js)과 똑같이
 * "joseon_sarim_progress_<학번>" 안의 write1_choice/write1_text를 쓴다.
 * 같은 브라우저로 나중에 전체 시뮬을 열면 이 글쓰기① 답이 이미 채워진
 * 채로 시작한다(같은 origin이라 localStorage가 공유됨).
 * ══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CONFIG = window.CONFIG;
  var WRITE1_GAME_NAME = '사화_글쓰기1_비판할래참을래';

  var PROMPT = '너는 성종 때 3사 관리가 됐어. 훈구의 잘못이 눈에 보여. 비판할래, 참을래? 123쪽에서 근거 하나를 넣어서 이유를 써봐.';
  var WRITING_HINT = '123쪽에서 훈구·사림에 대해 어떤 문장을 근거로 들 수 있을까?';
  var OPTIONS = [
    { id: 'criticize', label: '비판한다' },
    { id: 'endure', label: '참는다' }
  ];

  var SESSION = { sid: '', name: '', ban: null, preview: false };
  var ANSWERS = {};
  var phase = 'login'; // login | write | done
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

  function loginIsComplete() {
    return !!parseStudentId(SESSION.sid) && SESSION.name.trim().length > 0;
  }
  function writeIsComplete() {
    return !!ANSWERS.write1_choice && (ANSWERS.write1_text || '').trim().length > 0;
  }

  function labelFor(id) {
    var found = OPTIONS.filter(function (o) { return o.id === id; })[0];
    return found ? found.label : id;
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

  function writeHtml() {
    var chosen = ANSWERS.write1_choice;
    var text = ANSWERS.write1_text || '';
    var html = '<div class="card">';
    html += '<h2>글쓰기 ① — 먼저 써보자</h2>';
    html += '<p class="lead">아직 사화 이야기는 하나도 안 나와. 지금 아는 것만 가지고 판단해봐.</p>';
    html += '<p style="margin-bottom:14px; font-weight:600;">' + escapeHtml(PROMPT) + '</p>';
    html += '<div class="choice-list">';
    OPTIONS.forEach(function (opt) {
      html += '<button type="button" class="choice-btn' + (chosen === opt.id ? ' selected' : '') + '" data-choice="' + opt.id + '">' + escapeHtml(opt.label) + '</button>';
    });
    html += '</div>';
    html += '<label class="field-label">이유를 적어줘 (교과서 123쪽 근거 하나 포함)</label>';
    html += '<textarea class="text-field" rows="4" id="write1Text">' + escapeHtml(text) + '</textarea>';
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
    var choiceLabel = labelFor(ANSWERS.write1_choice);
    var html = '<div class="card">';
    html += '<h2>제출됐어</h2>';
    html += '<div class="recap-item"><h3>네 선택과 이유</h3>';
    html += '<div class="recap-value">' + escapeHtml(choiceLabel) + '<br>' + escapeHtml(ANSWERS.write1_text || '') + '</div></div>';
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
        phase = 'write';
        render();
      });
    } else if (phase === 'write') {
      var submitBtn = root.querySelector('#submitWrite1');
      function refreshSubmitState() { submitBtn.disabled = !writeIsComplete(); }

      root.querySelectorAll('.choice-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          setAnswer('write1_choice', btn.getAttribute('data-choice'));
          render();
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
        var payload = '[글쓰기①] ' + labelFor(ANSWERS.write1_choice) + '\n' + (ANSWERS.write1_text || '');
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
      choiceSummary: labelFor(ANSWERS.write1_choice),
      diffSummary: '',
      reflection: ANSWERS.write1_text || '',
      choicesJson: JSON.stringify({ write1_choice: ANSWERS.write1_choice, write1_text: ANSWERS.write1_text })
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

  function init() {
    SESSION.sid = getQueryParam('sid');
    SESSION.name = getQueryParam('name');
    SESSION.preview = getQueryParam('preview') === '1';
    var parsed = parseStudentId(SESSION.sid);
    SESSION.ban = parsed ? parsed.ban : null;

    if (SESSION.preview) document.getElementById('devBanner').hidden = false;

    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

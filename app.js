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
  var stepIndex = 0;
  var submitState = 'idle'; // idle | saving | done | failed

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

  function renderStart(step) {
    var chosen = ANSWERS.start_choice;
    var html = '<div class="card">';
    html += '<h2>' + escapeHtml(step.title) + '</h2>';
    html += '<p class="lead">' + escapeHtml(step.lead) + '</p>';
    html += '<p style="margin-bottom:14px; font-weight:600;">' + escapeHtml(step.prompt) + '</p>';
    html += '<div class="choice-list">';
    step.options.forEach(function (opt) {
      html += '<button type="button" class="choice-btn' + (chosen === opt.id ? ' selected' : '') + '" data-choice="' + opt.id + '">' + escapeHtml(opt.label) + '</button>';
    });
    html += '</div></div>';
    return {
      html: html,
      afterMount: function (root) {
        root.querySelectorAll('.choice-btn').forEach(function (btn) {
          btn.addEventListener('click', function () {
            setAnswer('start_choice', btn.getAttribute('data-choice'));
            renderCurrentStep();
          });
        });
      }
    };
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
    step.questions.forEach(function (q) {
      var key = step.id + '_' + q.id;
      html += '<label class="field-label">' + escapeHtml(q.label) + '</label>';
      html += '<textarea class="text-field" rows="2" data-key="' + key + '">' + escapeHtml(ANSWERS[key] || '') + '</textarea>';
      html += hintHtml(key, q.hint);
    });
    html += '</div>';
    return { html: html, afterMount: bindTextFieldsAndHints };
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
    if (step.rawQuote) {
      html += '<button type="button" class="easy-toggle" data-target="rawQuoteBox">📜 원문 그대로 보기</button>';
      html += '<div class="easy-box" id="rawQuoteBox" hidden><div class="source-quote' + (step.rawQuote.verified ? '' : ' placeholder') + '" style="margin-bottom:0;">' + escapeHtml(step.rawQuote.text) + '</div></div>';
    }
    if (step.caveat) html += factHtml(step.caveat);
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
    var startLabel = ANSWERS.start_choice === 'criticize' ? '비판한다' : (ANSWERS.start_choice === 'endure' ? '참는다' : '(기록 없음)');
    var mStep = findStep('m_judgment'), kStep = findStep('k_judgment'), interpStep = findStep('k_interpret');
    var html = '<div class="card">';
    html += '<h2>' + escapeHtml(step.title) + '</h2>';

    html += '<div class="recap-item"><h3>글쓰기 ① 때 선택</h3><div class="recap-value">' + escapeHtml(startLabel) + '</div></div>';

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
    html += padletLinkHtml();
    html += '<p id="submitStatus" style="margin-top:12px; font-size:.86rem; color:var(--ink-soft);"></p>';
    html += '</div></div>';
    return { html: html, afterMount: function () { updateSubmitStatus(); } };
  }

  function padletLinkHtml() {
    if (!SESSION.ban || !CONFIG.PADLET_BY_BAN[SESSION.ban]) {
      return '<div class="note-box">담당 반 정보가 없어서 링크를 자동으로 못 찾았어. 선생님께 문의해줘.</div>';
    }
    return '<a class="padlet-link" href="' + escapeAttr(CONFIG.PADLET_BY_BAN[SESSION.ban]) + '" target="_blank" rel="noopener">글쓰기 ② 이어서 쓰기</a>';
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
      case 'start': return !!ANSWERS.start_choice;
      case 'sourceReveal': return step.questions.every(function (q) { return (ANSWERS[step.id + '_' + q.id] || '').trim().length > 0; });
      case 'sourceTable': return (ANSWERS[step.id + '_' + step.question.id] || '').trim().length > 0;
      case 'judgment': return !!ANSWERS[step.id + '_choice'] && (ANSWERS[step.id + '_reason'] || '').trim().length > 0;
      case 'interpretation': return !!ANSWERS[step.id + '_choice'];
      default: return true;
    }
  }

  /* ══════════════ 메인 렌더 루프 ══════════════ */
  var RENDERERS = {
    start: renderStart,
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
    var step = CONTENT.steps[stepIndex];
    var stepArea = document.getElementById('stepArea');
    var renderer = RENDERERS[step.type];
    var out = renderer(step);
    stepArea.innerHTML = out.html;
    if (out.afterMount) out.afterMount(stepArea);
    updateProgress();
    updateNavState();
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });

    if (step.type === 'recap' && !SESSION.preview) {
      submitFinalIfNeeded();
    }
  }

  function updateProgress() {
    var total = CONTENT.steps.length;
    var pct = Math.round(((stepIndex) / (total - 1)) * 100);
    document.getElementById('progressFill').style.width = pct + '%';
    document.getElementById('progressLabel').textContent = (stepIndex + 1) + ' / ' + total;
  }

  function updateNavState() {
    var step = CONTENT.steps[stepIndex];
    var nextBtn = document.getElementById('navNext');
    var prevBtn = document.getElementById('navPrev');
    prevBtn.style.visibility = stepIndex === 0 ? 'hidden' : 'visible';
    if (step.type === 'recap') {
      nextBtn.style.display = 'none';
    } else {
      nextBtn.style.display = 'block';
      nextBtn.disabled = !stepIsComplete(step);
      nextBtn.textContent = stepIndex === CONTENT.steps.length - 2 ? '회고 화면으로' : '다음';
    }
  }

  function goNext() {
    if (stepIndex < CONTENT.steps.length - 1) { stepIndex++; renderCurrentStep(); }
  }
  function goPrev() {
    if (stepIndex > 0) { stepIndex--; renderCurrentStep(); }
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
    push('시작 선택', ANSWERS.start_choice === 'criticize' ? '비판한다' : (ANSWERS.start_choice === 'endure' ? '참는다' : ''));
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
    SESSION.sid = getQueryParam('sid');
    SESSION.name = getQueryParam('name');
    SESSION.preview = getQueryParam('preview') === '1';
    var parsed = parseStudentId(SESSION.sid);
    if (parsed) { SESSION.grade = parsed.grade; SESSION.ban = parsed.ban; SESSION.number = parsed.number; }

    loadAnswers();
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

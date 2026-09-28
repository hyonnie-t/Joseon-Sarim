/* ══════════════════════════════════════════════════════════
 * config.js — 이 웹앱의 설정값
 *
 * ⚠️ GAME_NAME은 history26 포털 "커리큘럼 관리" 탭에서 이 활동을 차시로
 * 등록할 때 넣는 activity id와 정확히 같아야 포털 진행률·포인트 계산에
 * 잡힌다. 지금은 임시로 아래 값을 써뒀으니, 실제 차시 번호가 정해지면
 * (예: "OO차시_사화_판단시뮬") 이 값과 커리큘럼 등록값을 같이 맞출 것.
 * ══════════════════════════════════════════════════════════ */
window.CONFIG = {
  SHEET_WEBAPP_URL: 'https://script.google.com/macros/s/AKfycbyXSjCfWY_HiZFqW_OBR-FQDoIfF1z_STqyKWUI31MacHeY3u7hbirFSFDvW-5yuUHaJQ/exec',
  GAME_NAME: '사화_무오기묘_시뮬레이션',

  // 3학년 글쓰기②(선택) Padlet — history26 config.js의 반별 링크를 그대로 재사용.
  // 5~8반 외 반이 접속하면 링크를 안내하지 않는다(담당 반이 아니므로).
  PADLET_BY_BAN: {
    5: 'https://padlet.com/dy_sch03/2026-2-3-5-cewq8vec8p3ew2yn',
    6: 'https://padlet.com/dy_sch03/2026-2-3-6-2xngg3v8pstkvld9',
    7: 'https://padlet.com/dy_sch03/2026-2-3-7-8ssvnriy75f7xwxs',
    8: 'https://padlet.com/dy_sch03/2026-2-3-8-gsrz2i3ca863675l'
  },

  // fetchJsonRetry_의 재시도 횟수/간격 — history26 관례와 동일하게 맞춤.
  FETCH_RETRY_COUNT: 3,
  FETCH_RETRY_DELAY_MS: 700
};

// `npm run dev` 시작 시 기본 로그인 정보를 눈에 띄게 보여주는 배너입니다.
// (package.json 의 predev 로 자동 실행됩니다. 강의/학습용 고정 계정 안내용.)

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m",
  cyan: "\x1b[36m", yellow: "\x1b[33m", green: "\x1b[32m", gray: "\x1b[90m",
};

const line = "════════════════════════════════════════════";
console.log("");
console.log(C.cyan + line + C.reset);
console.log(C.cyan + "  🔑  " + C.bold + "김비서 기본 로그인" + C.reset + C.gray + "  (강의용 고정 계정)" + C.reset);
console.log(C.cyan + "  ──────────────────────────────────────" + C.reset);
console.log("      👤  ID  :  " + C.bold + C.yellow + "admin" + C.reset);
console.log("      🔒  PW  :  " + C.bold + C.yellow + "jadong!" + C.reset);
console.log(C.cyan + line + C.reset);
console.log("  🌐  " + C.green + "http://localhost:3000" + C.reset + " 에서 위 정보로 로그인하세요.");
console.log("  👉  " + C.bold + "로그인 후" + C.reset + " 왼쪽 사이드바 맨 아래 " + C.bold + "'내 이름'" + C.reset +
  " 클릭 → 마이페이지에서 " + C.bold + "비밀번호를 꼭 변경" + C.reset + "하세요!");
console.log("");

// ============================================================
// 黑白棋（Reversi）— 游戏逻辑
// 8×8 棋盘，Canvas 绘制，通过 postMessage 与大厅通信
// ============================================================

// ---------- 常量 ----------
const BOARD_SIZE = 8;
const CELL_SIZE = 52;         // 每格像素
const PADDING = 16;           // 棋盘边距
const STONE_RADIUS = 22;      // 棋子半径
const HINT_RADIUS = 8;        // 合法位置提示圆点半径

// 8 个方向
const DIRS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];

// ---------- 状态 ----------
let myInfo = null;
let opponentInfo = null;
let myColor = null;           // "black" | "white"
let currentTurn = null;
let myTurn = false;
let board = [];               // null | "black" | "white"
let gameOver = false;
let gameStarted = false;
let thisGameName = "黑白棋";
let validMoves = [];          // 己方当前合法位置 [{row, col}, ...]
let moveTimeLeft = 60;
let moveTimerInterval = null;
let nudgeSent = false;
let canvas = null;
let ctx = null;
let roomId = null;

// ---------- 动画状态 ----------
let isAnimating = false;
let animPlace = null;         // {row, col, color} 正在落下的子
let animFlips = [];           // [{row, col, fromColor, toColor}] 被翻转的棋子
let animStartTime = 0;
let animCallback = null;
const ANIM_DURATION = 350;    // 动画总时长 ms

// ============================================================
// 初始化
// ============================================================
function init() {
  canvas = document.getElementById("boardCanvas");
  ctx = canvas.getContext("2d");

  const params = new URLSearchParams(window.location.search);
  roomId = params.get("roomId");
  thisGameName = params.get("gameName") || "黑白棋";
  myInfo = {
    username: params.get("username"),
    avatarText: params.get("avatarText"),
    textColor: params.get("textColor"),
    borderColor: params.get("borderColor"),
  };

  resetBoard();
  const canvasSize = BOARD_SIZE * CELL_SIZE + PADDING * 2;
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  drawBoard();

  canvas.addEventListener("click", onCanvasClick);
  window.addEventListener("message", onParentMessage);
  sendToParent({ type: "game_ready" });
  showWaiting("等待对手加入...");
  document.getElementById("statusText").textContent = "玩家：" + myInfo.username;
}

function resetBoard() {
  board = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    board[r] = [];
    for (let c = 0; c < BOARD_SIZE; c++) {
      board[r][c] = null;
    }
  }
  // 初始 4 子
  const mid = BOARD_SIZE / 2;
  board[mid - 1][mid - 1] = "white";
  board[mid - 1][mid] = "black";
  board[mid][mid - 1] = "black";
  board[mid][mid] = "white";

  gameOver = false;
  gameStarted = false;
  currentTurn = null;
  myTurn = false;
  validMoves = [];
  nudgeSent = false;
  moveTimeLeft = 60;
  stopMoveTimer();
}

// ============================================================
// 棋盘绘制
// ============================================================
function drawBoard(skipAnimating) {
  const w = canvas.width;
  const h = canvas.height;

  // 背景
  ctx.fillStyle = "#2d7d3f";
  ctx.fillRect(0, 0, w, h);

  // 网格线
  ctx.strokeStyle = "#1a5c2a";
  ctx.lineWidth = 1;
  for (let i = 0; i <= BOARD_SIZE; i++) {
    const pos = PADDING + i * CELL_SIZE;
    ctx.beginPath();
    ctx.moveTo(PADDING, pos);
    ctx.lineTo(PADDING + BOARD_SIZE * CELL_SIZE, pos);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pos, PADDING);
    ctx.lineTo(pos, PADDING + BOARD_SIZE * CELL_SIZE);
    ctx.stroke();
  }

  // 边框
  ctx.strokeStyle = "#1a4a24";
  ctx.lineWidth = 3;
  ctx.strokeRect(PADDING, PADDING, BOARD_SIZE * CELL_SIZE, BOARD_SIZE * CELL_SIZE);

  // 动画中跳过正在变化的棋子位置
  const skipSet = skipAnimating ? buildAnimSkipSet() : new Set();

  // 绘制所有棋子
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (skipSet.has(r + "," + c)) continue;
      if (board[r][c]) {
        drawStone(r, c, board[r][c]);
      }
    }
  }

  // 合法落子提示（动画中不显示）
  if (!skipAnimating) {
    drawHints();
  }
  // 分数
  updateScore();
}

function buildAnimSkipSet() {
  const s = new Set();
  if (animPlace) s.add(animPlace.row + "," + animPlace.col);
  for (const f of animFlips) s.add(f.row + "," + f.col);
  return s;
}

function drawStone(row, col, color, scaleX) {
  if (scaleX === undefined) scaleX = 1;
  const cx = PADDING + col * CELL_SIZE + CELL_SIZE / 2;
  const cy = PADDING + row * CELL_SIZE + CELL_SIZE / 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scaleX, 1);

  ctx.beginPath();
  ctx.arc(0, 0, STONE_RADIUS, 0, Math.PI * 2);

  if (color === "black") {
    const g = ctx.createRadialGradient(-5, -5, 2, 0, 0, STONE_RADIUS);
    g.addColorStop(0, "#555");
    g.addColorStop(1, "#111");
    ctx.fillStyle = g;
  } else {
    const g = ctx.createRadialGradient(-5, -5, 2, 0, 0, STONE_RADIUS);
    g.addColorStop(0, "#fff");
    g.addColorStop(1, "#ccc");
    ctx.fillStyle = g;
  }
  ctx.fill();
  ctx.strokeStyle = color === "black" ? "#000" : "#999";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
}

function drawHints() {
  if (!myTurn || gameOver) return;
  for (const { row, col } of validMoves) {
    const x = PADDING + col * CELL_SIZE + CELL_SIZE / 2;
    const y = PADDING + row * CELL_SIZE + CELL_SIZE / 2;
    ctx.beginPath();
    ctx.arc(x, y, HINT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
    ctx.fill();
  }
}

function updateScore() {
  let black = 0, white = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === "black") black++;
      else if (board[r][c] === "white") white++;
    }
  }
  const opponentColor = myColor === "black" ? "white" : "black";
  const opScore = opponentColor === "black" ? black : white;
  const myScore = myColor === "black" ? black : white;
  document.getElementById("scoreOpponent").textContent =
    (opponentColor === "black" ? "● " : "⚪ ") + opScore;
  document.getElementById("scoreMine").textContent =
    (myColor === "black" ? "● " : "⚪ ") + myScore;
}

// ============================================================
// 合法走法计算
// ============================================================
function getValidMoves(color) {
  const moves = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] !== null) continue;
      if (getFlips(r, c, color).length > 0) {
        moves.push({ row: r, col: c });
      }
    }
  }
  return moves;
}

function getFlips(row, col, color) {
  const opponent = color === "black" ? "white" : "black";
  const flips = [];

  for (const [dr, dc] of DIRS) {
    const line = [];
    let r = row + dr;
    let c = col + dc;
    while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === opponent) {
      line.push({ row: r, col: c });
      r += dr;
      c += dc;
    }
    // 必须至少夹住一个对方棋子，且另一端是自己的棋子
    if (line.length > 0 && r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === color) {
      flips.push(...line);
    }
  }
  return flips;
}

// ============================================================
// 落子（带动画）
// ============================================================
function placeStone(row, col, color, onDone) {
  const flips = getFlips(row, col, color);
  if (flips.length === 0) {
    board[row][col] = color;
    drawBoard();
    if (onDone) onDone();
    return;
  }

  const opponentColor = color === "black" ? "white" : "black";
  isAnimating = true;
  animPlace = { row, col, color };
  animFlips = flips.map(f => ({ row: f.row, col: f.col, fromColor: opponentColor, toColor: color }));
  animStartTime = performance.now();
  animCallback = () => {
    board[animPlace.row][animPlace.col] = animPlace.color;
    for (const f of animFlips) {
      board[f.row][f.col] = f.toColor;
    }
    isAnimating = false;
    animPlace = null;
    animFlips = [];
    animStartTime = 0;
    drawBoard();
    if (onDone) onDone();
  };

  requestAnimationFrame(animationLoop);
}

function animationLoop(now) {
  if (!isAnimating) return;
  const elapsed = now - animStartTime;
  const t = Math.min(elapsed / ANIM_DURATION, 1);
  renderAnimationFrame(t);
  if (t < 1) {
    requestAnimationFrame(animationLoop);
  } else {
    if (animCallback) animCallback();
  }
}

function renderAnimationFrame(t) {
  drawBoard(true);

  // 新落子弹出
  if (animPlace) {
    const popT = Math.min(t / 0.57, 1);
    const scale = easeOutBack(popT);
    drawStone(animPlace.row, animPlace.col, animPlace.color, scale);
  }

  // 被夹棋子翻转
  const flipStart = 0.14;
  const flipDuration = 0.57;
  for (const f of animFlips) {
    const ft = Math.max(0, Math.min(1, (t - flipStart) / flipDuration));
    let drawColor, sx;
    if (ft < 0.5) {
      drawColor = f.fromColor;
      sx = 1 - ft * 2;
    } else {
      drawColor = f.toColor;
      sx = (ft - 0.5) * 2;
    }
    drawStone(f.row, f.col, drawColor, sx);
  }

  updateScore();
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// ============================================================
// 终局判定
// ============================================================
function checkGameEnd() {
  const blackMoves = getValidMoves("black");
  const whiteMoves = getValidMoves("white");
  if (blackMoves.length === 0 && whiteMoves.length === 0) {
    return true;
  }
  if (isBoardFull()) return true;
  return false;
}

function isBoardFull() {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === null) return false;
    }
  }
  return true;
}

function getWinner() {
  let black = 0, white = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === "black") black++;
      else if (board[r][c] === "white") white++;
    }
  }
  if (black > white) return "black";
  if (white > black) return "white";
  return "draw";
}

// ============================================================
// 棋盘点击
// ============================================================
function onCanvasClick(e) {
  if (!gameStarted || gameOver || !myTurn || isAnimating) return;

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const mx = (e.clientX - rect.left) * scaleX;
  const my = (e.clientY - rect.top) * scaleY;

  const col = Math.floor((mx - PADDING) / CELL_SIZE);
  const row = Math.floor((my - PADDING) / CELL_SIZE);

  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return;
  if (board[row][col] !== null) return;

  // 检查是否合法
  const flips = getFlips(row, col, myColor);
  if (flips.length === 0) return;

  stopMoveTimer();
  placeStone(row, col, myColor, () => {
    sendToParent({
      type: "game_action",
      action: "place_stone",
      data: { row, col, color: myColor },
    });

    const opponentColor = myColor === "black" ? "white" : "black";
    validMoves = getValidMoves(opponentColor);
    if (checkGameEnd()) {
      endGame();
      return;
    }

    myTurn = false;
    currentTurn = opponentInfo.username;
    nudgeSent = false;
    document.getElementById("btnSurrender").classList.remove("show");
    document.getElementById("btnNudge").classList.add("show");
    updateTurnDisplay();
    startMoveTimer();
    document.getElementById("statusText").textContent = "等待对手落子...";
  });
}

// ============================================================
// 跳过回合
// ============================================================
function skipTurn() {
  stopMoveTimer();
  sendToParent({
    type: "game_action",
    action: "skip_turn",
    data: {},
  });

  validMoves = getValidMoves(myColor === "black" ? "white" : "black");
  if (checkGameEnd()) {
    endGame();
    return;
  }

  myTurn = false;
  currentTurn = opponentInfo.username;
  nudgeSent = false;
  document.getElementById("btnSurrender").classList.remove("show");
  document.getElementById("btnNudge").classList.add("show");
  updateTurnDisplay();
  startMoveTimer();
  document.getElementById("statusText").textContent = "无合法位置，跳过回合";
  drawBoard();
}

// ============================================================
// 终局处理
// ============================================================
function endGame() {
  gameOver = true;
  stopMoveTimer();
  document.getElementById("btnSurrender").classList.remove("show");
  document.getElementById("btnNudge").classList.remove("show");
  document.getElementById("btnPlayAgain").classList.add("show");
  hideTurnHighlight();

  const winner = getWinner();
  const myWin = (winner === myColor);
  const isDraw = (winner === "draw");

  let resultText;
  if (isDraw) {
    resultText = "平局！";
    sendToParent({ type: "game_over", gameName: thisGameName, result: "draw", isDraw: true });
  } else if (myWin) {
    resultText = "你赢了！";
    sendToParent({ type: "game_over", gameName: thisGameName, result: "win", isDraw: false });
  } else {
    resultText = "对手获胜！";
  }
  document.getElementById("statusText").textContent = resultText;
}

// ============================================================
// 父页面消息处理
// ============================================================
function onParentMessage(event) {
  const msg = event.data;
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case "room_update":
      handleRoomUpdate(msg);
      break;
    case "game_start":
      handleGameStart(msg);
      break;
    case "game_action":
      handleGameAction(msg);
      break;
  }
}

function handleRoomUpdate(msg) {
  for (const p of msg.players) {
    if (p.username !== myInfo.username) opponentInfo = p;
  }
  if (!gameStarted && msg.players.length < 2) {
    showWaiting("等待对手加入...（" + msg.players.length + "/" + msg.maxPlayers + "）");
  }
}

function handleGameStart(msg) {
  resetBoard();
  drawBoard();
  gameStarted = true;
  gameOver = false;
  hideWaiting();
  document.getElementById("btnPlayAgain").classList.remove("show");
  document.getElementById("btnSurrender").classList.add("show");

  for (const p of msg.players) {
    if (p.username !== myInfo.username) opponentInfo = p;
  }

  if (msg.firstTurn === myInfo.username) {
    myColor = "black";
    myTurn = true;
    currentTurn = myInfo.username;
  } else {
    myColor = "white";
    myTurn = false;
    currentTurn = msg.firstTurn;
  }

  validMoves = getValidMoves(myColor);
  updateTurnDisplay();
  moveTimeLeft = 60;
  updateTimerDisplay();
  updateScore();
  drawBoard();

  if (myTurn) {
    document.getElementById("btnNudge").classList.remove("show");
    startMoveTimer();
    document.getElementById("statusText").textContent = "轮到你了（黑棋）";
    if (validMoves.length === 0) {
      skipTurn();
      return;
    }
  } else {
    document.getElementById("btnNudge").classList.add("show");
    startMoveTimer();
    document.getElementById("statusText").textContent = "等待对手落子...";
  }
  renderPlayerInfo();
}

function handleGameAction(msg) {
  if (msg.action === "place_stone") {
    stopMoveTimer();
    const { row, col, color } = msg.data;
    placeStone(row, col, color, () => {
      if (checkGameEnd()) {
        endGame();
        return;
      }

      myTurn = true;
      currentTurn = myInfo.username;
      nudgeSent = false;
      validMoves = getValidMoves(myColor);
      updateTurnDisplay();
      drawBoard();
      startMoveTimer();
      document.getElementById("btnSurrender").classList.add("show");
      document.getElementById("btnNudge").classList.remove("show");
      document.getElementById("statusText").textContent = "轮到你了（" +
        (myColor === "black" ? "黑棋" : "白棋") + "）";

      if (validMoves.length === 0) {
        skipTurn();
      }
    });
  } else if (msg.action === "skip_turn") {
    stopMoveTimer();
    if (checkGameEnd()) {
      endGame();
      return;
    }

    myTurn = true;
    currentTurn = myInfo.username;
    nudgeSent = false;
    validMoves = getValidMoves(myColor);
    updateTurnDisplay();
    drawBoard();
    startMoveTimer();
    document.getElementById("btnSurrender").classList.add("show");
    document.getElementById("btnNudge").classList.remove("show");
    document.getElementById("statusText").textContent = "对手无合法位置，轮到你了";
  } else if (msg.action === "surrender") {
    stopMoveTimer();
    gameOver = true;
    myTurn = false;
    hideTurnHighlight();
    document.getElementById("statusText").textContent = "对手认输，你赢了！";
    document.getElementById("btnPlayAgain").classList.add("show");
    document.getElementById("btnSurrender").classList.remove("show");
    document.getElementById("btnNudge").classList.remove("show");
  } else if (msg.action === "nudge") {
    showNudgeToast();
    const el = document.getElementById("statusText");
    el.textContent = "对手提醒你落子";
    el.style.color = "#f1c40f";
    setTimeout(() => {
      el.style.color = "";
      if (!gameOver && myTurn) {
        el.textContent = "轮到你了（" + (myColor === "black" ? "黑棋" : "白棋") + "）";
      }
    }, 2000);
  } else if (msg.action === "timeout") {
    stopMoveTimer();
    gameOver = true;
    myTurn = false;
    hideTurnHighlight();
    document.getElementById("statusText").textContent = "对手超时，你赢了！";
    document.getElementById("btnPlayAgain").classList.add("show");
    document.getElementById("btnSurrender").classList.remove("show");
    document.getElementById("btnNudge").classList.remove("show");
  } else if (msg.action === "player_left") {
    stopMoveTimer();
    gameStarted = false;
    gameOver = true;
    showWaiting("对手离开了房间");
    document.getElementById("statusText").textContent = "对手断线";
    document.getElementById("btnPlayAgain").classList.remove("show");
    document.getElementById("btnSurrender").classList.remove("show");
    document.getElementById("btnNudge").classList.remove("show");
  }
}

// ============================================================
// UI 辅助
// ============================================================
function updateTurnDisplay() {
  const myEl = document.getElementById("myPlayerInfo");
  const opEl = document.getElementById("opponentPlayerInfo");
  myEl.classList.toggle("current-turn", myTurn);
  opEl.classList.toggle("current-turn", !myTurn);
  if (gameOver) {
    myEl.classList.remove("current-turn");
    opEl.classList.remove("current-turn");
  }
}

function hideTurnHighlight() {
  document.getElementById("myPlayerInfo").classList.remove("current-turn");
  document.getElementById("opponentPlayerInfo").classList.remove("current-turn");
}

function renderPlayerInfo() {
  document.getElementById("myAvatar").textContent = myInfo.avatarText;
  document.getElementById("myAvatar").style.borderColor = myInfo.borderColor;
  document.getElementById("myAvatar").style.color = myInfo.textColor;
  document.getElementById("myName").textContent = myInfo.username + "（你）";
  const myStone = document.getElementById("myStone");
  myStone.className = "player-stone " + (myColor === "black" ? "stone-black" : "stone-white");

  if (opponentInfo) {
    document.getElementById("opAvatar").textContent = opponentInfo.avatarText;
    document.getElementById("opAvatar").style.borderColor = opponentInfo.borderColor;
    document.getElementById("opAvatar").style.color = opponentInfo.textColor;
    document.getElementById("opName").textContent = opponentInfo.username;
    const opStone = document.getElementById("opStone");
    opStone.className = "player-stone " + (myColor === "black" ? "stone-white" : "stone-black");
  }
}

function showWaiting(text) {
  document.getElementById("waitingText").textContent = text;
  document.getElementById("waitingOverlay").classList.remove("hidden");
}

function hideWaiting() {
  document.getElementById("waitingOverlay").classList.add("hidden");
}

function sendToParent(msg) {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage(msg, "*");
  }
}

// ============================================================
// 再来一局
// ============================================================
function playAgain() {
  stopMoveTimer();
  sendToParent({ type: "play_again" });
  document.getElementById("btnPlayAgain").classList.remove("show");
  document.getElementById("btnSurrender").classList.remove("show");
  document.getElementById("btnNudge").classList.remove("show");
}

// ============================================================
// 认输
// ============================================================
function surrender() {
  if (!gameStarted || gameOver) return;
  stopMoveTimer();
  gameOver = true;
  myTurn = false;
  hideTurnHighlight();
  sendToParent({ type: "game_action", action: "surrender", data: {} });
  document.getElementById("statusText").textContent = "你认输了";
  document.getElementById("btnPlayAgain").classList.add("show");
  document.getElementById("btnSurrender").classList.remove("show");
  document.getElementById("btnNudge").classList.remove("show");
  sendToParent({ type: "game_over", gameName: thisGameName, result: "loss", isDraw: false });
}

// ============================================================
// 提醒对方
// ============================================================
function nudgeOpponent() {
  if (myTurn || gameOver || nudgeSent) return;
  nudgeSent = true;
  sendToParent({ type: "game_action", action: "nudge", data: {} });
  document.getElementById("btnNudge").classList.remove("show");
  document.getElementById("statusText").textContent = "已发送提醒";
  setTimeout(() => {
    if (!gameOver && !myTurn) {
      document.getElementById("statusText").textContent = "等待对手落子...";
    }
  }, 1500);
}

function showNudgeToast() {
  const wrapper = document.getElementById("boardWrapper");
  if (!wrapper) return;

  let toast = document.getElementById("nudgeToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "nudgeToast";
    toast.className = "nudge-toast";
    toast.textContent = "对手提醒你落子！";
    wrapper.appendChild(toast);
  }

  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 2000);
}

// ============================================================
// 计时器
// ============================================================
function startMoveTimer() {
  moveTimeLeft = 60;
  updateTimerDisplay();
  const timerEl = document.getElementById("moveTimer");
  timerEl.classList.remove("urgent");
  stopMoveTimer();
  moveTimerInterval = setInterval(() => {
    moveTimeLeft--;
    updateTimerDisplay();
    if (moveTimeLeft <= 10) timerEl.classList.add("urgent");
    if (moveTimeLeft <= 0) timeoutLoss();
  }, 1000);
}

function stopMoveTimer() {
  if (moveTimerInterval) {
    clearInterval(moveTimerInterval);
    moveTimerInterval = null;
  }
}

function updateTimerDisplay() {
  document.getElementById("moveTimer").textContent =
    moveTimeLeft >= 0 ? moveTimeLeft + "s" : "0s";
}

function timeoutLoss() {
  stopMoveTimer();
  if (!myTurn) return; // 非己方回合不计超时，等对方客户端发送 timeout
  gameOver = true;
  myTurn = false;
  hideTurnHighlight();
  document.getElementById("statusText").textContent = "超时，你输了！";
  document.getElementById("btnPlayAgain").classList.add("show");
  document.getElementById("btnSurrender").classList.remove("show");
  document.getElementById("btnNudge").classList.remove("show");
  sendToParent({ type: "game_action", action: "timeout", data: {} });
  sendToParent({ type: "game_over", gameName: thisGameName, result: "loss", isDraw: false });
}

// ============================================================
// 启动
// ============================================================
window.addEventListener("DOMContentLoaded", init);

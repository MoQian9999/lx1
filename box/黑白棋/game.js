// ============================================================
// 黑白棋（Reversi）— 游戏逻辑
// 8×8 棋盘，Canvas 绘制，通过 postMessage 与大厅通信
// ============================================================

// ---------- 常量 ----------
const BOARD_SIZE = 8;
const MAX_CELL_SIZE = 52;
const MIN_CELL_SIZE = 30;
// 动态尺寸（根据视口自动调整）
let cellSize = MAX_CELL_SIZE;
let padding = 16;
let stoneRadius = 22;
let hintRadius = 8;

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

// ---------- 缩放/平移状态 ----------
let zoomLevel = 1, panX = 0, panY = 0;
const ZOOM_MIN = 0.5, ZOOM_MAX = 3.0, ZOOM_STEP = 0.25;
let _touches = {}, _pinchStartDist = 0, _pinchStartZoom = 1, _pinchCenter = null;
let _dragging = false, _dragStart = null, _dragMoved = false;

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
  fitCanvasToViewport();

  canvas.addEventListener("click", onCanvasClick);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("touchstart", onTouchStart, { passive: false });
  canvas.addEventListener("touchmove", onTouchMove, { passive: false });
  canvas.addEventListener("touchend", onTouchEnd);
  canvas.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
  document.getElementById("btnZoomIn").addEventListener("click", zoomIn);
  document.getElementById("btnZoomOut").addEventListener("click", zoomOut);
  document.getElementById("btnZoomReset").addEventListener("click", zoomReset);
  window.addEventListener("message", onParentMessage);
  window.addEventListener("resize", onWindowResize);
  sendToParent({ type: "game_ready" });
  showWaiting("等待对手加入...");
  document.getElementById("statusText").textContent = "玩家：" + myInfo.username;
}

function fitCanvasToViewport() {
  const maxWidth = Math.min(window.innerWidth - 24, 500);
  const maxHeight = Math.min(window.innerHeight - 200, 700);
  const cellByW = Math.floor((maxWidth - 32) / BOARD_SIZE);
  const cellByH = Math.floor((maxHeight - 32) / BOARD_SIZE);
  cellSize = Math.min(MAX_CELL_SIZE, cellByW, cellByH);
  cellSize = Math.max(MIN_CELL_SIZE, cellSize);
  padding = Math.max(10, Math.floor(cellSize * 0.31));
  stoneRadius = Math.floor(cellSize * 0.42);
  hintRadius = Math.max(4, Math.floor(cellSize * 0.15));
  const canvasSize = BOARD_SIZE * cellSize + padding * 2;
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  drawBoard();
}

let _resizeTimeout = null;
function onWindowResize() {
  clearTimeout(_resizeTimeout);
  _resizeTimeout = setTimeout(() => {
    fitCanvasToViewport();
    renderPlayerInfo();
  }, 200);
}

// ---------- 缩放/平移 ----------
function canvasToBoard(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return { x: ((clientX - rect.left) * scaleX - panX) / zoomLevel, y: ((clientY - rect.top) * scaleY - panY) / zoomLevel };
}
function zoomIn() { applyZoom(zoomLevel + ZOOM_STEP); }
function zoomOut() { applyZoom(zoomLevel - ZOOM_STEP); }
function zoomReset() { zoomLevel = 1; panX = 0; panY = 0; drawBoard(); }
function applyZoom(z) {
  zoomLevel = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
  const maxPan = Math.max(0, (canvas.width * zoomLevel - canvas.width) / 2);
  panX = Math.max(-maxPan, Math.min(maxPan, panX));
  panY = Math.max(-maxPan, Math.min(maxPan, panY));
  drawBoard();
}
function onWheel(e) {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
  const my = (e.clientY - rect.top) * (canvas.height / rect.height);
  const oldZoom = zoomLevel;
  applyZoom(e.deltaY < 0 ? zoomLevel + ZOOM_STEP : zoomLevel - ZOOM_STEP);
  panX = mx - (mx - panX) * (zoomLevel / oldZoom);
  panY = my - (my - panY) * (zoomLevel / oldZoom);
  drawBoard();
}
function onMouseDown(e) { if (e.button === 0) { _dragging = true; _dragMoved = false; _dragStart = { x: e.clientX, y: e.clientY, px: panX, py: panY }; } }
function onMouseMove(e) {
  if (!_dragging || !_dragStart) return;
  if (Math.abs(e.clientX - _dragStart.x) > 2 || Math.abs(e.clientY - _dragStart.y) > 2) _dragMoved = true;
  panX = _dragStart.px + (e.clientX - _dragStart.x) * (canvas.width / canvas.getBoundingClientRect().width);
  panY = _dragStart.py + (e.clientY - _dragStart.y) * (canvas.height / canvas.getBoundingClientRect().height);
  drawBoard();
}
function onMouseUp() { _dragging = false; }
function onTouchStart(e) {
  e.preventDefault();
  for (const t of e.changedTouches) _touches[t.identifier] = { x: t.clientX, y: t.clientY };
  if (e.touches.length === 2) {
    _pinchStartDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    _pinchStartZoom = zoomLevel;
    _pinchCenter = { x: (e.touches[0].clientX + e.touches[1].clientX) / 2, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 };
  }
}
function onTouchMove(e) {
  e.preventDefault();
  if (e.touches.length === 2 && _pinchStartDist > 0) {
    const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    const newZoom = _pinchStartZoom * (dist / _pinchStartDist);
    const rect = canvas.getBoundingClientRect();
    const cx = (_pinchCenter.x - rect.left) * (canvas.width / rect.width);
    const cy = (_pinchCenter.y - rect.top) * (canvas.height / rect.height);
    const oldZoom = zoomLevel;
    applyZoom(newZoom);
    panX = cx - (cx - panX) * (zoomLevel / oldZoom);
    panY = cy - (cy - panY) * (zoomLevel / oldZoom);
    drawBoard();
  } else if (e.touches.length === 1 && zoomLevel > 1) {
    const t = e.touches[0], prev = _touches[t.identifier];
    if (prev) { panX += (t.clientX - prev.x) * (canvas.width / canvas.getBoundingClientRect().width); panY += (t.clientY - prev.y) * (canvas.height / canvas.getBoundingClientRect().height); drawBoard(); }
    for (const t2 of e.touches) _touches[t2.identifier] = { x: t2.clientX, y: t2.clientY };
  }
}
function onTouchEnd(e) { for (const t of e.changedTouches) delete _touches[t.identifier]; }

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
  ctx.save();
  ctx.setTransform(zoomLevel, 0, 0, zoomLevel, panX, panY);

  // 背景
  ctx.fillStyle = "#2d7d3f";
  ctx.fillRect(0, 0, w, h);

  // 网格线
  ctx.strokeStyle = "#1a5c2a";
  ctx.lineWidth = 1;
  for (let i = 0; i <= BOARD_SIZE; i++) {
    const pos = padding + i * cellSize;
    ctx.beginPath();
    ctx.moveTo(padding, pos);
    ctx.lineTo(padding + BOARD_SIZE * cellSize, pos);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pos, padding);
    ctx.lineTo(pos, padding + BOARD_SIZE * cellSize);
    ctx.stroke();
  }

  // 边框
  ctx.strokeStyle = "#1a4a24";
  ctx.lineWidth = 3;
  ctx.strokeRect(padding, padding, BOARD_SIZE * cellSize, BOARD_SIZE * cellSize);

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

  ctx.restore();
  if (zoomLevel !== 1) {
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(Math.round(zoomLevel * 100) + "%", 8, canvas.height - 8);
  }
}

function buildAnimSkipSet() {
  const s = new Set();
  if (animPlace) s.add(animPlace.row + "," + animPlace.col);
  for (const f of animFlips) s.add(f.row + "," + f.col);
  return s;
}

function drawStone(row, col, color, scaleX) {
  if (scaleX === undefined) scaleX = 1;
  const cx = padding + col * cellSize + cellSize / 2;
  const cy = padding + row * cellSize + cellSize / 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scaleX, 1);

  ctx.beginPath();
  ctx.arc(0, 0, stoneRadius, 0, Math.PI * 2);

  if (color === "black") {
    const g = ctx.createRadialGradient(-5, -5, 2, 0, 0, stoneRadius);
    g.addColorStop(0, "#555");
    g.addColorStop(1, "#111");
    ctx.fillStyle = g;
  } else {
    const g = ctx.createRadialGradient(-5, -5, 2, 0, 0, stoneRadius);
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
    const x = padding + col * cellSize + cellSize / 2;
    const y = padding + row * cellSize + cellSize / 2;
    ctx.beginPath();
    ctx.arc(x, y, hintRadius, 0, Math.PI * 2);
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
  if (_dragMoved) { _dragMoved = false; return; }

  const pt = canvasToBoard(e.clientX, e.clientY);
  const col = Math.floor((pt.x - padding) / cellSize);
  const row = Math.floor((pt.y - padding) / cellSize);

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

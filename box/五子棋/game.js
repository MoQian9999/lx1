// ============================================================
// 五子棋 - 游戏逻辑
// 15×15 标准棋盘，Canvas 绘制，通过 postMessage 与大厅通信
// ============================================================

// ---------- 游戏常量 ----------
const BOARD_SIZE = 15;        // 棋盘 15×15
const MAX_CELL_SIZE = 36;
const MIN_CELL_SIZE = 20;
// 动态尺寸（根据视口自动调整）
let cellSize = MAX_CELL_SIZE;
let padding = 28;
let stoneRadius = 15;

// ---------- 游戏状态 ----------
let myInfo = null;            // 我的信息：{ username, avatarText, textColor, borderColor }
let opponentInfo = null;      // 对手信息
let myColor = null;           // "black" 或 "white"
let currentTurn = null;       // 当前回合玩家用户名
let myTurn = false;           // 是否轮到我
let board = [];               // 棋盘状态：null / "black" / "white"
let gameOver = false;         // 游戏是否已结束
let gameStarted = false;      // 游戏是否已开始
let lastMoveRow = -1;         // 最后落子行（用于高亮标记）
let lastMoveCol = -1;         // 最后落子列
let prevMoveRow = -1;         // 倒数第二步行（悔棋恢复用）
let prevMoveCol = -1;         // 倒数第二步列
let thisGameName = "五子棋";   // 游戏名（从 URL 参数获取）
let moveTimeLeft = 60;        // 每步剩余秒数
let moveTimerInterval = null; // 计时器句柄
let pendingUndoRequest = false; // 是否已有悔棋请求
let pendingUndoTwoStones = false; // 当前悔棋模式：撤2子还是1子
let nudgeSent = false;        // 本回合是否已提醒
let canvas = null;
let ctx = null;
let roomId = null;

// ---------- 动画状态 ----------
let isAnimating = false;
let animStone = null;         // {row, col, color} 正在落下的子
let animStartTime = 0;
let animCallback = null;
const ANIM_DURATION = 320;    // 动画总时长 ms
let audioCtx = null;          // Web Audio 上下文（lazy init）

// ---------- 缩放/平移状态 ----------
let zoomLevel = 1;
let panX = 0, panY = 0;
const ZOOM_MIN = 0.5, ZOOM_MAX = 3.0, ZOOM_STEP = 0.25;
let _touches = {};
let _pinchStartDist = 0, _pinchStartZoom = 1, _pinchCenter = null;
let _dragging = false, _dragStart = null, _dragMoved = false;

// ============================================================
// 初始化：从 URL 参数读取玩家信息
// ============================================================
function init() {
  canvas = document.getElementById("boardCanvas");
  ctx = canvas.getContext("2d");

  // 从 URL 参数读取信息
  const params = new URLSearchParams(window.location.search);
  roomId = params.get("roomId");
  thisGameName = params.get("gameName") || "五子棋";
  myInfo = {
    username: params.get("username"),
    avatarText: params.get("avatarText"),
    textColor: params.get("textColor"),
    borderColor: params.get("borderColor"),
  };

  // 初始化棋盘（全空）
  resetBoard();
  fitCanvasToViewport();

  // 设置点击事件
  canvas.addEventListener("click", onCanvasClick);

  // 缩放事件
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("touchstart", onTouchStart, { passive: false });
  canvas.addEventListener("touchmove", onTouchMove, { passive: false });
  canvas.addEventListener("touchend", onTouchEnd);
  canvas.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);

  // 缩放按钮
  document.getElementById("btnZoomIn").addEventListener("click", zoomIn);
  document.getElementById("btnZoomOut").addEventListener("click", zoomOut);
  document.getElementById("btnZoomReset").addEventListener("click", zoomReset);

  // 监听来自大厅（父页面）的消息
  window.addEventListener("message", onParentMessage);

  // 窗口大小变化时重绘
  window.addEventListener("resize", onWindowResize);

  // 通知父页面：iframe 已就绪
  sendToParent({ type: "game_ready" });

  // 显示等待界面
  showWaiting("等待对手加入...");

  document.getElementById("statusText").textContent =
    "玩家：" + myInfo.username;
}

function fitCanvasToViewport() {
  const maxWidth = Math.min(window.innerWidth - 24, 600);
  const maxHeight = Math.min(window.innerHeight - 200, 800);
  const cellByW = Math.floor((maxWidth - 56) / BOARD_SIZE);
  const cellByH = Math.floor((maxHeight - 56) / BOARD_SIZE);
  cellSize = Math.min(MAX_CELL_SIZE, cellByW, cellByH);
  cellSize = Math.max(MIN_CELL_SIZE, cellSize);
  padding = Math.max(14, Math.floor(cellSize * 0.78));
  stoneRadius = Math.floor(cellSize * 0.42);
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
  const sx = (clientX - rect.left) * scaleX;
  const sy = (clientY - rect.top) * scaleY;
  return { x: (sx - panX) / zoomLevel, y: (sy - panY) / zoomLevel };
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
  const newZoom = e.deltaY < 0 ? zoomLevel + ZOOM_STEP : zoomLevel - ZOOM_STEP;
  applyZoom(newZoom);
  panX = mx - (mx - panX) * (zoomLevel / oldZoom);
  panY = my - (my - panY) * (zoomLevel / oldZoom);
  drawBoard();
}

function onMouseDown(e) {
  if (e.button === 0) { _dragging = true; _dragMoved = false; _dragStart = { x: e.clientX, y: e.clientY, px: panX, py: panY }; }
}
function onMouseMove(e) {
  if (!_dragging || !_dragStart) return;
  const dx = e.clientX - _dragStart.x;
  const dy = e.clientY - _dragStart.y;
  if (Math.abs(dx) > 2 || Math.abs(dy) > 2) _dragMoved = true;
  panX = _dragStart.px + dx * (canvas.width / canvas.getBoundingClientRect().width);
  panY = _dragStart.py + dy * (canvas.height / canvas.getBoundingClientRect().height);
  drawBoard();
}
function onMouseUp() { _dragging = false; }

function onTouchStart(e) {
  if (e.touches.length >= 2 || zoomLevel > 1) {
    e.preventDefault();
  }
  for (const t of e.changedTouches) _touches[t.identifier] = { x: t.clientX, y: t.clientY };
  if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    _pinchStartDist = Math.hypot(dx, dy);
    _pinchStartZoom = zoomLevel;
    _pinchCenter = { x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
                     y: (e.touches[0].clientY + e.touches[1].clientY) / 2 };
  }
}

function onTouchMove(e) {
  e.preventDefault();
  if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.hypot(dx, dy);
    if (_pinchStartDist > 0) {
      const newZoom = _pinchStartZoom * (dist / _pinchStartDist);
      const rect = canvas.getBoundingClientRect();
      const cx = (_pinchCenter.x - rect.left) * (canvas.width / rect.width);
      const cy = (_pinchCenter.y - rect.top) * (canvas.height / rect.height);
      const oldZoom = zoomLevel;
      applyZoom(newZoom);
      panX = cx - (cx - panX) * (zoomLevel / oldZoom);
      panY = cy - (cy - panY) * (zoomLevel / oldZoom);
      drawBoard();
    }
  } else if (e.touches.length === 1 && zoomLevel > 1) {
    const t = e.touches[0];
    const prev = _touches[t.identifier];
    if (prev) {
      panX += (t.clientX - prev.x) * (canvas.width / canvas.getBoundingClientRect().width);
      panY += (t.clientY - prev.y) * (canvas.height / canvas.getBoundingClientRect().height);
      drawBoard();
    }
    for (const t2 of e.touches) _touches[t2.identifier] = { x: t2.clientX, y: t2.clientY };
  }
}

function onTouchEnd(e) {
  for (const t of e.changedTouches) delete _touches[t.identifier];
}

// ============================================================
// 重置棋盘数据
// ============================================================
function resetBoard() {
  board = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    board[row] = [];
    for (let col = 0; col < BOARD_SIZE; col++) {
      board[row][col] = null;
    }
  }
  gameOver = false;
  gameStarted = false;
  currentTurn = null;
  myTurn = false;
  lastMoveRow = -1;
  lastMoveCol = -1;
  prevMoveRow = -1;
  prevMoveCol = -1;
  pendingUndoRequest = false;
  nudgeSent = false;
  stopMoveTimer();
}

// ============================================================
// 绘制棋盘（线 + 星位点）
// ============================================================
function drawBoard(skipAnimating) {
  const w = canvas.width;
  const h = canvas.height;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.setTransform(zoomLevel, 0, 0, zoomLevel, panX, panY);

  // 背景色（木色）
  ctx.fillStyle = "#dcb35c";
  ctx.fillRect(0, 0, w, h);

  // 棋盘网格线
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;
  for (let i = 0; i < BOARD_SIZE; i++) {
    const pos = padding + i * cellSize;
    ctx.beginPath();
    ctx.moveTo(padding, pos);
    ctx.lineTo(padding + (BOARD_SIZE - 1) * cellSize, pos);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pos, padding);
    ctx.lineTo(pos, padding + (BOARD_SIZE - 1) * cellSize);
    ctx.stroke();
  }

  // 星位点
  const starPoints = [
    [3, 3], [3, 7], [3, 11],
    [7, 3], [7, 7], [7, 11],
    [11, 3], [11, 7], [11, 11],
  ];
  ctx.fillStyle = "#333";
  for (const [r, c] of starPoints) {
    ctx.beginPath();
    ctx.arc(padding + c * cellSize, padding + r * cellSize, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // 动画中跳过正在变化的棋子
  const skipKey = skipAnimating && animStone ? (animStone.row + "," + animStone.col) : null;

  // 绘制所有棋子
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (skipKey && row === animStone.row && col === animStone.col) continue;
      if (board[row][col]) {
        drawStone(row, col, board[row][col]);
      }
    }
  }

  ctx.restore();
  if (Math.abs(zoomLevel - 1) > 0.005) {
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(Math.round(zoomLevel * 100) + "%", 8, canvas.height - 8);
  }
}

// ============================================================
// 绘制一颗棋子
// ============================================================
function drawStone(row, col, color, scaleX) {
  if (scaleX === undefined) scaleX = 1;
  const cx = padding + col * cellSize;
  const cy = padding + row * cellSize;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scaleX, 1);

  ctx.beginPath();
  ctx.arc(0, 0, stoneRadius, 0, Math.PI * 2);

  if (color === "black") {
    const gradient = ctx.createRadialGradient(-4, -4, 2, 0, 0, stoneRadius);
    gradient.addColorStop(0, "#555");
    gradient.addColorStop(1, "#111");
    ctx.fillStyle = gradient;
  } else {
    const gradient = ctx.createRadialGradient(-4, -4, 2, 0, 0, stoneRadius);
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(1, "#cccccc");
    ctx.fillStyle = gradient;
  }
  ctx.fill();

  ctx.strokeStyle = color === "black" ? "#000" : "#aaa";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
}

// ============================================================
// 在最后落子处绘制标记
// ============================================================
function drawLastMoveMark() {
  if (lastMoveRow < 0 || lastMoveCol < 0) return;
  const x = padding + lastMoveCol * cellSize;
  const y = padding + lastMoveRow * cellSize;

  // 红色圆点标记
  ctx.beginPath();
  ctx.arc(x, y, 3, 0, Math.PI * 2);
  ctx.fillStyle = "#ff4444";
  ctx.fill();

  // 白色细边框让标记在黑白子上都可见
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

// ============================================================
// 处理棋盘点击
// ============================================================
function onCanvasClick(e) {
  if (!gameStarted || gameOver || !myTurn || isAnimating) return;
  if (_dragMoved) { _dragMoved = false; return; }

  const pt = canvasToBoard(e.clientX, e.clientY);
  const col = Math.round((pt.x - padding) / cellSize);
  const row = Math.round((pt.y - padding) / cellSize);

  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return;
  if (board[row][col] !== null) return;

  stopMoveTimer();
  pendingUndoRequest = false;
  nudgeSent = false;

  placeStone(row, col, myColor, () => {
    sendToParent({
      type: "game_action",
      action: "place_stone",
      data: { row, col, color: myColor },
    });

    if (checkWin(row, col, myColor)) {
      gameOver = true;
      stopMoveTimer();
      document.getElementById("statusText").textContent = "你赢了！";
      document.getElementById("btnPlayAgain").classList.add("show");
      document.getElementById("btnSurrender").classList.remove("show");
      document.getElementById("btnUndo").classList.remove("show");
      document.getElementById("btnNudge").classList.remove("show");
      hideTurnHighlight();
      sendToParent({ type: "game_over", gameName: thisGameName, result: "win", isDraw: false });
      return;
    }

    if (isBoardFull()) {
      gameOver = true;
      stopMoveTimer();
      document.getElementById("statusText").textContent = "平局！";
      document.getElementById("btnPlayAgain").classList.add("show");
      document.getElementById("btnSurrender").classList.remove("show");
      document.getElementById("btnUndo").classList.remove("show");
      document.getElementById("btnNudge").classList.remove("show");
      hideTurnHighlight();
      sendToParent({ type: "game_over", gameName: thisGameName, result: "draw", isDraw: true });
      return;
    }

    myTurn = false;
    currentTurn = opponentInfo.username;
    document.getElementById("btnNudge").classList.add("show");
    updateTurnDisplay();
    startMoveTimer();
  });
}

// ============================================================
// 落子（带动画，接受回调）
// ============================================================
function placeStone(row, col, color, onDone) {
  // 无动画模式（悔棋等）
  if (!onDone) {
    board[row][col] = color;
    prevMoveRow = lastMoveRow;
    prevMoveCol = lastMoveCol;
    lastMoveRow = row;
    lastMoveCol = col;
    drawBoard();
    drawLastMoveMark();
    return;
  }

  // 动画模式
  board[row][col] = color;  // 立即更新数据（确保 checkWin 等可访问）
  prevMoveRow = lastMoveRow;
  prevMoveCol = lastMoveCol;
  lastMoveRow = row;
  lastMoveCol = col;

  isAnimating = true;
  animStone = { row, col, color };
  animStartTime = performance.now();
  animCallback = () => {
    isAnimating = false;
    animStone = null;
    animStartTime = 0;
    drawBoard();
    drawLastMoveMark();
    if (onDone) onDone();
  };

  playStoneSound(color);
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

  if (animStone) {
    // 棋子弹出
    const popT = Math.min(t / 0.625, 1);
    const scale = easeOutBack(popT);
    drawStone(animStone.row, animStone.col, animStone.color, scale);

    // 涟漪
    const rippleStart = 0.25;
    const rT = Math.max(0, Math.min(1, (t - rippleStart) / 0.75));
    if (rT > 0) {
      const cx = padding + animStone.col * cellSize;
      const cy = padding + animStone.row * cellSize;
      for (let i = 0; i < 2; i++) {
        const rp = Math.max(0, rT - i * 0.2);
        const radius = stoneRadius + rp * 20;
        const alpha = (1 - rp) * 0.4;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255," + alpha + ")";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }

  if (lastMoveRow >= 0 && animStone) {
    const mx = padding + animStone.col * cellSize;
    const my = padding + animStone.row * cellSize;
    ctx.beginPath();
    ctx.arc(mx, my, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#ff4444";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// ============================================================
// 落子音效 (Web Audio API)
// ============================================================
function playStoneSound(color) {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    const now = audioCtx.currentTime;
    const freq = color === "black" ? 600 : 800;

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  } catch (e) {
    // 静默忽略音效失败
  }
}

// ============================================================
// 五子连珠判定
// ============================================================
function checkWin(row, col, color) {
  // 四个方向：[行偏移, 列偏移]
  const directions = [
    [1, 0],   // 竖直
    [0, 1],   // 水平
    [1, 1],   // 右斜
    [1, -1],  // 左斜
  ];

  for (const [dr, dc] of directions) {
    let count = 1; // 当前棋子

    // 正方向延伸
    for (let i = 1; i < 5; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === color) {
        count++;
      } else break;
    }

    // 反方向延伸
    for (let i = 1; i < 5; i++) {
      const r = row - dr * i;
      const c = col - dc * i;
      if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && board[r][c] === color) {
        count++;
      } else break;
    }

    if (count >= 5) return true;
  }
  return false;
}

// ============================================================
// 检查棋盘是否已满
// ============================================================
function isBoardFull() {
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (board[row][col] === null) return false;
    }
  }
  return true;
}

// ============================================================
// 处理来自大厅（父页面）的消息
// ============================================================
function onParentMessage(event) {
  const msg = event.data;
  if (!msg || !msg.type) return;

  switch (msg.type) {

    // 房间更新：有玩家加入/离开
    case "room_update":
      handleRoomUpdate(msg);
      break;

    // 游戏开始
    case "game_start":
      handleGameStart(msg);
      break;

    // 对手操作
    case "game_action":
      handleGameAction(msg);
      break;
  }
}

// ============================================================
// 处理房间更新
// ============================================================
function handleRoomUpdate(msg) {
  // 更新对手信息
  for (const p of msg.players) {
    if (p.username !== myInfo.username) {
      opponentInfo = p;
    }
  }
  // 如果游戏还没开始，更新等待文字
  if (!gameStarted && msg.players.length < 2) {
    showWaiting("等待对手加入...（" + msg.players.length + "/" + msg.maxPlayers + "）");
  }
}

// ============================================================
// 处理游戏开始
// ============================================================
function handleGameStart(msg) {
  resetBoard();
  drawBoard();
  gameStarted = true;
  gameOver = false;
  hideWaiting();
  document.getElementById("btnPlayAgain").classList.remove("show");
  document.getElementById("btnSurrender").classList.add("show");
  document.getElementById("btnUndo").classList.remove("show");
  document.getElementById("btnNudge").classList.remove("show");
  document.getElementById("undoOverlay").classList.add("hidden");

  // 确定对手信息
  for (const p of msg.players) {
    if (p.username !== myInfo.username) {
      opponentInfo = p;
    }
  }

  // 确定双方执棋颜色：先手执黑
  if (msg.firstTurn === myInfo.username) {
    myColor = "black";
    myTurn = true;
    currentTurn = myInfo.username;
  } else {
    myColor = "white";
    myTurn = false;
    currentTurn = msg.firstTurn;
  }

  updateTurnDisplay();
  moveTimeLeft = 60;
  updateTimerDisplay();
  if (myTurn) {
    document.getElementById("btnUndo").classList.add("show");
    document.getElementById("btnNudge").classList.remove("show");
    startMoveTimer();
    document.getElementById("statusText").textContent = "轮到你了（黑棋）";
  } else {
    document.getElementById("btnUndo").classList.add("show");
    document.getElementById("btnNudge").classList.add("show");
    startMoveTimer();
    document.getElementById("statusText").textContent = "等待对手落子...";
  }
  renderPlayerInfo();
}

// ============================================================
// 处理对手操作
// ============================================================
function handleGameAction(msg) {
  if (msg.action === "place_stone") {
    stopMoveTimer();
    const { row, col, color } = msg.data;
    placeStone(row, col, color, () => {
      if (checkWin(row, col, color)) {
        gameOver = true;
        document.getElementById("statusText").textContent = "对手获胜！";
        document.getElementById("btnPlayAgain").classList.add("show");
        document.getElementById("btnSurrender").classList.remove("show");
        document.getElementById("btnUndo").classList.remove("show");
        document.getElementById("btnNudge").classList.remove("show");
        hideTurnHighlight();
        return;
      }

      if (isBoardFull()) {
        gameOver = true;
        document.getElementById("statusText").textContent = "平局！";
        document.getElementById("btnPlayAgain").classList.add("show");
        document.getElementById("btnSurrender").classList.remove("show");
        document.getElementById("btnUndo").classList.remove("show");
        document.getElementById("btnNudge").classList.remove("show");
        hideTurnHighlight();
        return;
      }

      myTurn = true;
      currentTurn = myInfo.username;
      nudgeSent = false;
      pendingUndoRequest = false;
      document.getElementById("btnUndo").classList.add("show");
      document.getElementById("btnNudge").classList.remove("show");
      updateTurnDisplay();
      startMoveTimer();
      document.getElementById("statusText").textContent = "轮到你了（" +
        (myColor === "black" ? "黑棋" : "白棋") + "）";
    });
  } else if (msg.action === "surrender") {
    stopMoveTimer();
    gameOver = true;
    myTurn = false;
    hideTurnHighlight();
    document.getElementById("statusText").textContent = "对手认输，你赢了！";
    document.getElementById("btnPlayAgain").classList.add("show");
    document.getElementById("btnSurrender").classList.remove("show");
    document.getElementById("btnUndo").classList.remove("show");
    document.getElementById("btnNudge").classList.remove("show");
  } else if (msg.action === "request_undo") {
    // 对手请求悔棋
    if (gameOver) return;
    pendingUndoTwoStones = msg.data && msg.data.undoTwoStones;
    document.getElementById("undoOverlay").classList.remove("hidden");
  } else if (msg.action === "undo_accepted") {
    // 对手同意悔棋
    const undoTwoStones = msg.data && msg.data.undoTwoStones;
    performUndo(undoTwoStones);
  } else if (msg.action === "undo_rejected") {
    document.getElementById("statusText").textContent = "对手拒绝悔棋";
    setTimeout(() => {
      if (!gameOver) {
        document.getElementById("statusText").textContent = "轮到你了（" +
          (myColor === "black" ? "黑棋" : "白棋") + "）";
      }
    }, 1500);
  } else if (msg.action === "nudge") {
    // 对手提醒
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
    document.getElementById("btnUndo").classList.remove("show");
    document.getElementById("btnNudge").classList.remove("show");
  } else if (msg.action === "player_left") {
    stopMoveTimer();
    gameStarted = false;
    gameOver = true;
    showWaiting("对手离开了房间");
    document.getElementById("statusText").textContent = "对手断线";
    document.getElementById("btnPlayAgain").classList.remove("show");
    document.getElementById("btnSurrender").classList.remove("show");
    document.getElementById("btnUndo").classList.remove("show");
    document.getElementById("btnNudge").classList.remove("show");
  }
}

// ============================================================
// 更新回合高亮显示
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

// ============================================================
// 渲染玩家信息（头像 + 执棋颜色）
// ============================================================
function renderPlayerInfo() {
  // 我的信息
  document.getElementById("myAvatar").textContent = myInfo.avatarText;
  document.getElementById("myAvatar").style.borderColor = myInfo.borderColor;
  document.getElementById("myAvatar").style.color = myInfo.textColor;
  document.getElementById("myName").textContent = myInfo.username + "（你）";
  const myStone = document.getElementById("myStone");
  myStone.className = "player-stone " +
    (myColor === "black" ? "stone-black" : "stone-white");

  // 对手信息
  if (opponentInfo) {
    document.getElementById("opAvatar").textContent = opponentInfo.avatarText;
    document.getElementById("opAvatar").style.borderColor = opponentInfo.borderColor;
    document.getElementById("opAvatar").style.color = opponentInfo.textColor;
    document.getElementById("opName").textContent = opponentInfo.username;
    const opStone = document.getElementById("opStone");
    opStone.className = "player-stone " +
      (myColor === "black" ? "stone-white" : "stone-black");
  }
}

// ============================================================
// 等待界面显示/隐藏
// ============================================================
function showWaiting(text) {
  document.getElementById("waitingText").textContent = text;
  document.getElementById("waitingOverlay").classList.remove("hidden");
}

function hideWaiting() {
  document.getElementById("waitingOverlay").classList.add("hidden");
}

// ============================================================
// 向父页面（大厅）发送消息
// ============================================================
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
  document.getElementById("btnUndo").classList.remove("show");
  document.getElementById("btnNudge").classList.remove("show");
  document.getElementById("undoOverlay").classList.add("hidden");
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

  sendToParent({
    type: "game_action",
    action: "surrender",
    data: {},
  });

  document.getElementById("statusText").textContent = "你认输了";
  document.getElementById("btnPlayAgain").classList.add("show");
  document.getElementById("btnSurrender").classList.remove("show");
  document.getElementById("btnUndo").classList.remove("show");
  document.getElementById("btnNudge").classList.remove("show");

  sendToParent({ type: "game_over", gameName: thisGameName, result: "loss", isDraw: false });
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
    if (moveTimeLeft <= 10) {
      timerEl.classList.add("urgent");
    }
    if (moveTimeLeft <= 0) {
      timeoutLoss();
    }
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
  document.getElementById("btnUndo").classList.remove("show");
  document.getElementById("btnNudge").classList.remove("show");
  sendToParent({ type: "game_action", action: "timeout", data: {} });
  sendToParent({ type: "game_over", gameName: thisGameName, result: "loss", isDraw: false });
}

// ============================================================
// 悔棋
// ============================================================
function requestUndo() {
  if (gameOver || pendingUndoRequest || lastMoveRow < 0) return;
  // 己方回合悔棋需要至少2步（对方1步 + 己方上1步）
  if (myTurn && prevMoveRow < 0) return;
  pendingUndoRequest = true;
  const undoTwoStones = myTurn;
  sendToParent({ type: "game_action", action: "request_undo", data: { undoTwoStones } });
  document.getElementById("statusText").textContent = "已发送悔棋请求，等待对手回应...";
  document.getElementById("btnUndo").classList.remove("show");
}

function acceptUndo() {
  document.getElementById("undoOverlay").classList.add("hidden");
  const undoTwoStones = pendingUndoTwoStones;
  sendToParent({ type: "game_action", action: "undo_accepted", data: { undoTwoStones } });
  performUndo(undoTwoStones);
}

function rejectUndo() {
  document.getElementById("undoOverlay").classList.add("hidden");
  sendToParent({ type: "game_action", action: "undo_rejected", data: {} });
}

function performUndo(undoTwoStones) {
  if (undoTwoStones) {
    // 撤2子：对方最后1步 + 己方上1步
    if (lastMoveRow >= 0 && lastMoveCol >= 0) {
      board[lastMoveRow][lastMoveCol] = null;
    }
    if (prevMoveRow >= 0 && prevMoveCol >= 0) {
      board[prevMoveRow][prevMoveCol] = null;
    }
    lastMoveRow = -1;
    lastMoveCol = -1;
    prevMoveRow = -1;
    prevMoveCol = -1;
    // 回合不变，仍为己方回合
  } else {
    // 撤1子：己方最后1步
    if (lastMoveRow >= 0 && lastMoveCol >= 0) {
      board[lastMoveRow][lastMoveCol] = null;
    }
    lastMoveRow = prevMoveRow;
    lastMoveCol = prevMoveCol;
    prevMoveRow = -1;
    prevMoveCol = -1;
  }
  drawBoard();
  if (lastMoveRow >= 0) drawLastMoveMark();

  // 撤2子回合不变（请求方本来就是当前回合），撤1子回合翻转
  if (!undoTwoStones) {
    myTurn = !myTurn;
  }
  currentTurn = myTurn ? myInfo.username : opponentInfo.username;
  nudgeSent = false;
  pendingUndoRequest = false;
  updateTurnDisplay();
  document.getElementById("btnUndo").classList.add("show");
  if (myTurn) {
    document.getElementById("btnNudge").classList.remove("show");
    document.getElementById("statusText").textContent = "悔棋成功，轮到你了";
  } else {
    document.getElementById("btnNudge").classList.add("show");
    document.getElementById("statusText").textContent = "等待对手落子...";
  }
  startMoveTimer();
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

// ============================================================
// 提醒提示弹层
// ============================================================
function showNudgeToast() {
  const wrapper = document.getElementById("boardWrapper") || document.querySelector(".board-wrapper");
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
// 页面加载完成后初始化
// ============================================================
window.addEventListener("DOMContentLoaded", init);

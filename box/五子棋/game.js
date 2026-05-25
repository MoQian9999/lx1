// ============================================================
// 五子棋 - 游戏逻辑
// 15×15 标准棋盘，Canvas 绘制，通过 postMessage 与大厅通信
// ============================================================

// ---------- 游戏常量 ----------
const BOARD_SIZE = 15;        // 棋盘 15×15
const CELL_SIZE = 36;         // 每格像素大小
const PADDING = 28;           // 棋盘边距
const STONE_RADIUS = 15;      // 棋子半径

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

  // 计算 Canvas 尺寸并绘制
  const canvasSize = BOARD_SIZE * CELL_SIZE + PADDING * 2;
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  drawBoard();

  // 设置点击事件
  canvas.addEventListener("click", onCanvasClick);

  // 监听来自大厅（父页面）的消息
  window.addEventListener("message", onParentMessage);

  // 通知父页面：iframe 已就绪
  sendToParent({ type: "game_ready" });

  // 显示等待界面
  showWaiting("等待对手加入...");

  document.getElementById("statusText").textContent =
    "玩家：" + myInfo.username;
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

  // 背景色（木色）
  ctx.fillStyle = "#dcb35c";
  ctx.fillRect(0, 0, w, h);

  // 棋盘网格线
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;
  for (let i = 0; i < BOARD_SIZE; i++) {
    const pos = PADDING + i * CELL_SIZE;
    ctx.beginPath();
    ctx.moveTo(PADDING, pos);
    ctx.lineTo(PADDING + (BOARD_SIZE - 1) * CELL_SIZE, pos);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pos, PADDING);
    ctx.lineTo(pos, PADDING + (BOARD_SIZE - 1) * CELL_SIZE);
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
    ctx.arc(PADDING + c * CELL_SIZE, PADDING + r * CELL_SIZE, 3, 0, Math.PI * 2);
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
}

// ============================================================
// 绘制一颗棋子
// ============================================================
function drawStone(row, col, color, scaleX) {
  if (scaleX === undefined) scaleX = 1;
  const cx = PADDING + col * CELL_SIZE;
  const cy = PADDING + row * CELL_SIZE;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scaleX, 1);

  ctx.beginPath();
  ctx.arc(0, 0, STONE_RADIUS, 0, Math.PI * 2);

  if (color === "black") {
    const gradient = ctx.createRadialGradient(-4, -4, 2, 0, 0, STONE_RADIUS);
    gradient.addColorStop(0, "#555");
    gradient.addColorStop(1, "#111");
    ctx.fillStyle = gradient;
  } else {
    const gradient = ctx.createRadialGradient(-4, -4, 2, 0, 0, STONE_RADIUS);
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
  const x = PADDING + lastMoveCol * CELL_SIZE;
  const y = PADDING + lastMoveRow * CELL_SIZE;

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

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const mx = (e.clientX - rect.left) * scaleX;
  const my = (e.clientY - rect.top) * scaleY;

  const col = Math.round((mx - PADDING) / CELL_SIZE);
  const row = Math.round((my - PADDING) / CELL_SIZE);

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
      const cx = PADDING + animStone.col * CELL_SIZE;
      const cy = PADDING + animStone.row * CELL_SIZE;
      for (let i = 0; i < 2; i++) {
        const rp = Math.max(0, rT - i * 0.2);
        const radius = STONE_RADIUS + rp * 20;
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
    const mx = PADDING + animStone.col * CELL_SIZE;
    const my = PADDING + animStone.row * CELL_SIZE;
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

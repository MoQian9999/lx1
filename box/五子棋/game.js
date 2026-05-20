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
let thisGameName = "五子棋";   // 游戏名（从 URL 参数获取）
let canvas = null;
let ctx = null;
let roomId = null;

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
}

// ============================================================
// 绘制棋盘（线 + 星位点）
// ============================================================
function drawBoard() {
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
    // 横线
    ctx.beginPath();
    ctx.moveTo(PADDING, pos);
    ctx.lineTo(PADDING + (BOARD_SIZE - 1) * CELL_SIZE, pos);
    ctx.stroke();
    // 竖线
    ctx.beginPath();
    ctx.moveTo(pos, PADDING);
    ctx.lineTo(pos, PADDING + (BOARD_SIZE - 1) * CELL_SIZE);
    ctx.stroke();
  }

  // 星位点（天元和四角星）
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

  // 重新绘制所有已放置的棋子
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (board[row][col]) {
        drawStone(row, col, board[row][col]);
      }
    }
  }
}

// ============================================================
// 绘制一颗棋子
// ============================================================
function drawStone(row, col, color) {
  const x = PADDING + col * CELL_SIZE;
  const y = PADDING + row * CELL_SIZE;

  ctx.beginPath();
  ctx.arc(x, y, STONE_RADIUS, 0, Math.PI * 2);

  if (color === "black") {
    const gradient = ctx.createRadialGradient(
      x - 4, y - 4, 2, x, y, STONE_RADIUS
    );
    gradient.addColorStop(0, "#555");
    gradient.addColorStop(1, "#111");
    ctx.fillStyle = gradient;
  } else {
    const gradient = ctx.createRadialGradient(
      x - 4, y - 4, 2, x, y, STONE_RADIUS
    );
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(1, "#cccccc");
    ctx.fillStyle = gradient;
  }
  ctx.fill();

  // 边缘
  ctx.strokeStyle = color === "black" ? "#000" : "#aaa";
  ctx.lineWidth = 1;
  ctx.stroke();
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
  if (!gameStarted || gameOver || !myTurn) return;

  const rect = canvas.getBoundingClientRect();
  // 考虑 Canvas 可能被缩放（CSS 尺寸 vs 实际尺寸）
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const mx = (e.clientX - rect.left) * scaleX;
  const my = (e.clientY - rect.top) * scaleY;

  // 找到最近的交叉点
  const col = Math.round((mx - PADDING) / CELL_SIZE);
  const row = Math.round((my - PADDING) / CELL_SIZE);

  // 越界检查
  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return;
  // 已有棋子
  if (board[row][col] !== null) return;

  // 落子
  placeStone(row, col, myColor);

  // 通知对手（通过父页面转发）
  sendToParent({
    type: "game_action",
    action: "place_stone",
    data: { row, col, color: myColor },
  });

  // 检查胜负
  if (checkWin(row, col, myColor)) {
    gameOver = true;
    document.getElementById("statusText").textContent = "你赢了！";
    document.getElementById("btnPlayAgain").classList.add("show");
    document.getElementById("btnSurrender").classList.remove("show");
    hideTurnHighlight();
    sendToParent({ type: "game_over", gameName: thisGameName, result: "win", isDraw: false });
    return;
  }

  // 检查平局（棋盘满了）
  if (isBoardFull()) {
    gameOver = true;
    document.getElementById("statusText").textContent = "平局！";
    document.getElementById("btnPlayAgain").classList.add("show");
    document.getElementById("btnSurrender").classList.remove("show");
    hideTurnHighlight();
    sendToParent({ type: "game_over", gameName: thisGameName, result: "draw", isDraw: true });
    return;
  }

  // 切换到对手回合
  myTurn = false;
  currentTurn = opponentInfo.username;
  updateTurnDisplay();
}

// ============================================================
// 落子（仅更新数据和绘制，不做校验）
// ============================================================
function placeStone(row, col, color) {
  board[row][col] = color;
  lastMoveRow = row;
  lastMoveCol = col;
  drawBoard(); // 重绘整个棋盘（含新棋子）
  drawLastMoveMark(); // 在最后落子上绘制标记
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
  document.getElementById("statusText").textContent =
    myTurn ? "轮到你了（黑棋）" : "等待对手落子...";
  renderPlayerInfo();
}

// ============================================================
// 处理对手操作
// ============================================================
function handleGameAction(msg) {
  if (msg.action === "place_stone") {
    // 对手落子
    const { row, col, color } = msg.data;
    placeStone(row, col, color);

    if (checkWin(row, col, color)) {
      gameOver = true;
      document.getElementById("statusText").textContent = "对手获胜！";
      document.getElementById("btnPlayAgain").classList.add("show");
      document.getElementById("btnSurrender").classList.remove("show");
      hideTurnHighlight();
      return;
    }

    if (isBoardFull()) {
      gameOver = true;
      document.getElementById("statusText").textContent = "平局！";
      document.getElementById("btnPlayAgain").classList.add("show");
      document.getElementById("btnSurrender").classList.remove("show");
      hideTurnHighlight();
      return;
    }

    // 轮到我
    myTurn = true;
    currentTurn = myInfo.username;
    updateTurnDisplay();
    document.getElementById("statusText").textContent = "轮到你了（" +
      (myColor === "black" ? "黑棋" : "白棋") + "）";
  } else if (msg.action === "surrender") {
    // 对手认输
    gameOver = true;
    myTurn = false;
    hideTurnHighlight();
    document.getElementById("statusText").textContent = "对手认输，你赢了！";
    document.getElementById("btnPlayAgain").classList.add("show");
    document.getElementById("btnSurrender").classList.remove("show");
  } else if (msg.action === "player_left") {
    // 对手离开
    gameStarted = false;
    gameOver = true;
    showWaiting("对手离开了房间");
    document.getElementById("statusText").textContent = "对手断线";
    document.getElementById("btnPlayAgain").classList.remove("show");
    document.getElementById("btnSurrender").classList.remove("show");
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
  sendToParent({ type: "play_again" });
  document.getElementById("btnPlayAgain").classList.remove("show");
  document.getElementById("btnSurrender").classList.remove("show");
}

// ============================================================
// 认输
// ============================================================
function surrender() {
  if (!gameStarted || gameOver) return;

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

  sendToParent({ type: "game_over", gameName: thisGameName, result: "loss", isDraw: false });
}

// ============================================================
// 页面加载完成后初始化
// ============================================================
window.addEventListener("DOMContentLoaded", init);

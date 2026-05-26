// ============================================================
// 飞行棋 (Ludo) — 游戏逻辑
// 2-4 人，Canvas 绘制，postMessage 通信
// ============================================================

// ---------- 常量 ----------
const GRID = 15;
const MAX_CELL = 42;
const MIN_CELL = 22;
const TRACK_COUNT = 52;
const HOME_COUNT = 6;
// 动态尺寸（根据视口自动调整）
let cell = MAX_CELL;
let margin = 36;
let pieceR = 13;

// 52 个轨道位置（顺时针，15x15 网格坐标 [row, col]）
const TRACK_POSITIONS = [
  [0,8], [1,8], [2,8], [3,8], [4,8], [5,8],   // 0-5: 顶臂右缘下行
  [5,9],                                         // 6: 顶右角
  [6,9], [6,10], [6,11], [6,12], [6,13], [6,14], // 7-12: 右臂上缘右行
  [8,14], [8,13], [8,12], [8,11], [8,10], [8,9], // 13-18: 右臂下缘左行
  [9,9],                                         // 19: 底右角
  [9,8], [10,8], [11,8], [12,8], [13,8], [14,8], // 20-25: 底臂右缘下行
  [14,6], [13,6], [12,6], [11,6], [10,6], [9,6], // 26-31: 底臂左缘上行
  [9,5],                                         // 32: 底左角
  [8,5], [8,4], [8,3], [8,2], [8,1], [8,0],     // 33-38: 左臂下缘左行
  [6,0], [6,1], [6,2], [6,3], [6,4], [6,5],     // 39-44: 左臂上缘右行
  [5,5],                                         // 45: 顶左角
  [5,6], [4,6], [3,6], [2,6], [1,6], [0,6],     // 46-51: 顶臂左缘上行
];

// 玩家配置 [入口轨道位置, 颜色, 主场列, 基地位置]
const PLAYER_CONFIG = [
  { entryPos: 0,  color: "#e74c3c", name: "红", homeCol: [[1,7],[2,7],[3,7],[4,7],[5,7],[6,7]], base: [[1,1],[1,2],[2,1],[2,2]] },
  { entryPos: 13, color: "#3498db", name: "蓝", homeCol: [[7,13],[7,12],[7,11],[7,10],[7,9],[7,8]], base: [[1,12],[1,13],[2,12],[2,13]] },
  { entryPos: 26, color: "#2ecc71", name: "绿", homeCol: [[13,7],[12,7],[11,7],[10,7],[9,7],[8,7]], base: [[12,12],[12,13],[13,12],[13,13]] },
  { entryPos: 39, color: "#f1c40f", name: "黄", homeCol: [[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]], base: [[12,1],[12,2],[13,1],[13,2]] },
];

// 飞点 = 各玩家入口位置（轨道索引）
const FLY_POINTS = [0, 13, 26, 39];

// 安全格 = 入口 + 四角
const SAFE_SQUARES = new Set([0, 6, 13, 19, 26, 32, 39, 45]);

// ============================================================
// 状态变量
// ============================================================
let myInfo = null;
let allPlayers = [];          // [{ username, avatarText, textColor, borderColor, playerIndex }]
let myPlayerIndex = -1;
let playerCount = 0;
let isHost = false;
let hostUsername = null;
let ruleFlags = {
  flyOnFive: false,
  overstepHome: false,
  singleStackBothBack: false,
  homeStacking: false,
  dualColors: false,
  teamMode: false,
};
let myReady = false;

// 每个颜色的 4 颗棋子: pieces[colorIndex][pieceIndex] = { state, pos }
// colorIndex: 0=红 1=蓝 2=绿 3=黄
// playerControls[playerIndex] = [colorIndex, ...]
let pieces = [[], [], [], []];
let playerControls = [];

// 回合管理
let turnOrder = [];           // 玩家索引的有序数组
let currentPlayerIndex = -1;
let myTurn = false;
let gameStarted = false;
let gameOver = false;
let turnPhase = "roll";       // "roll" | "move" | "pass"
let diceValue = 1;
let diceRolled = false;
let consecutiveSixes = 0;
let lastMovedPiece = null;    // { playerIndex, pieceIndex }
let validMoves = [];
let selectedPieceIndex = -1;
let selectedColorIndex = -1;

// ---------- 缩放/平移状态 ----------
let zoomLevel = 1, panX = 0, panY = 0;
const ZOOM_MIN = 0.5, ZOOM_MAX = 3.0, ZOOM_STEP = 0.25;
let _touches = {}, _pinchStartDist = 0, _pinchStartZoom = 1, _pinchCenter = null;
let _dragging = false, _dragStart = null, _dragMoved = false;

// Canvas
let canvas = null;
let ctx = null;
let diceCanvas = null;
let diceCtx = null;

// 杂项
let roomId = null;
let thisGameName = "飞行棋";
let nudgeSent = false;
let moveTimeLeft = 60;
let moveTimerInterval = null;
let nudgeToastTimeout = null;

// ============================================================
// 初始化
// ============================================================
function init() {
  canvas = document.getElementById("boardCanvas");
  ctx = canvas.getContext("2d");
  diceCanvas = document.getElementById("diceCanvas");
  diceCtx = diceCanvas.getContext("2d");

  const params = new URLSearchParams(window.location.search);
  roomId = params.get("roomId");
  thisGameName = params.get("gameName") || "飞行棋";
  myInfo = {
    username: params.get("username"),
    avatarText: params.get("avatarText"),
    textColor: params.get("textColor"),
    borderColor: params.get("borderColor"),
  };

  fitCanvasToViewport();
  drawDie(1);

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

  // 初始化赛前界面
  buildRulePanel();
  showWaiting("等待玩家加入...");
}

function fitCanvasToViewport() {
  const maxWidth = Math.min(window.innerWidth - 24, 702);
  const maxHeight = Math.min(window.innerHeight - 220, 800);
  const cellByW = Math.floor((maxWidth - 72) / GRID);
  const cellByH = Math.floor((maxHeight - 72) / GRID);
  cell = Math.min(MAX_CELL, cellByW, cellByH);
  cell = Math.max(MIN_CELL, cell);
  margin = Math.max(18, Math.floor(cell * 0.86));
  pieceR = Math.floor(cell * 0.31);
  const w = GRID * cell + margin * 2;
  canvas.width = w;
  canvas.height = w;
  if (gameStarted) drawBoard();
}

let _resizeTimeout = null;
function onWindowResize() {
  clearTimeout(_resizeTimeout);
  _resizeTimeout = setTimeout(() => {
    fitCanvasToViewport();
    if (gameStarted) updatePlayerHeader();
  }, 200);
}

// ---------- 缩放/平移 ----------
function canvasToBoard(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const sX = canvas.width / rect.width, sY = canvas.height / rect.height;
  return { x: ((clientX - rect.left) * sX - panX) / zoomLevel, y: ((clientY - rect.top) * sY - panY) / zoomLevel };
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
  if (e.touches.length >= 2 || zoomLevel > 1) {
    e.preventDefault();
  }
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

// ============================================================
// 工具函数
// ============================================================
function cellToPixel(row, col) {
  return { x: margin + col * cell + cell / 2, y: margin + row * cell + cell / 2 };
}

function sendToParent(msg) {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage(msg, "*");
  }
}

function showWaiting(text) {
  document.getElementById("waitingText").textContent = text;
  document.getElementById("waitingOverlay").classList.remove("hidden");
}

function hideWaiting() {
  document.getElementById("waitingOverlay").classList.add("hidden");
}

function isFriendly(p1, p2) {
  if (p1 === p2) return true;
  if (ruleFlags.dualColors && playerCount === 2) {
    const side1 = p1 % 2;
    const side2 = p2 % 2;
    return side1 === side2;
  }
  if (ruleFlags.teamMode && playerCount === 4) {
    const team1 = p1 % 2;
    const team2 = p2 % 2;
    return team1 === team2;
  }
  return false;
}

function countPiecesAt(colorIndex, state, pos) {
  if (!pieces[colorIndex]) return 0;
  let count = 0;
  for (const p of pieces[colorIndex]) {
    if (p.state === state && p.pos === pos) count++;
  }
  return count;
}

function getPlayerColors(playerIndex) {
  if (!playerControls[playerIndex]) return [playerIndex];
  return playerControls[playerIndex];
}

function hasOpponentStack(myPlayerIndex, trackPos) {
  const myColors = new Set(getPlayerColors(myPlayerIndex));
  for (let ci = 0; ci < 4; ci++) {
    if (myColors.has(ci)) continue;
    if (isFriendlyColor(myPlayerIndex, ci)) continue;
    if (countPiecesAt(ci, "track", trackPos) > 0) return true;
  }
  return false;
}

function hasFriendlyPieceAt(myPlayerIndex, state, pos) {
  const myColors = getPlayerColors(myPlayerIndex);
  for (const ci of myColors) {
    if (countPiecesAt(ci, state, pos) > 0) return true;
  }
  return false;
}

function isFriendlyColor(playerIndex, colorIndex) {
  const colors = getPlayerColors(playerIndex);
  return colors.includes(colorIndex);
}

function getMyControlledColors() {
  return getPlayerColors(myPlayerIndex);
}

function getMyAllPiecesFinished() {
  for (const ci of getMyControlledColors()) {
    for (const p of pieces[ci]) {
      if (p.state !== "finished") return false;
    }
  }
  return true;
}

function getTeamAllFinished(teamIndex) {
  const members = teamIndex === 0 ? [0, 2] : [1, 3];
  for (const ci of members) {
    for (const p of pieces[ci]) {
      if (p.state !== "finished") return false;
    }
  }
  return true;
}

function isFriendly(p1, p2) {
  if (p1 === p2) return true;
  if (ruleFlags.dualColors && playerCount === 2) {
    const colors1 = getPlayerColors(p1);
    const colors2 = getPlayerColors(p2);
    const sameSide = (colors1[0] % 2) === (colors2[0] % 2);
    return sameSide;
  }
  if (ruleFlags.teamMode && playerCount === 4) {
    const colors1 = getPlayerColors(p1);
    const colors2 = getPlayerColors(p2);
    return (colors1[0] % 2) === (colors2[0] % 2);
  }
  return false;
}

// ============================================================
// 赛前界面
// ============================================================
function buildRulePanel() {
  const ruleList = document.getElementById("ruleList");
  const rules = [
    { field: "flyOnFive", label: "五点可飞", hint: "掷出5时可选择飞行" },
    { field: "overstepHome", label: "允许超步直达", hint: "超出步数仍可进家" },
    { field: "singleStackBothBack", label: "单撞叠一起回", hint: "ON=单撞叠→双方都回；OFF=自己回" },
    { field: "homeStacking", label: "主场可叠子", hint: "ON=主场列允许叠子" },
    { field: "dualColors", label: "双人双色（2人）", hint: "每人控2色8棋子" },
    { field: "teamMode", label: "组队模式（4人）", hint: "红+绿 vs 蓝+黄" },
  ];

  ruleList.innerHTML = "";
  for (const rule of rules) {
    const div = document.createElement("div");
    div.className = "rule-item";
    div.id = "ruleItem_" + rule.field;

    const label = document.createElement("span");
    label.className = "rule-label";
    label.textContent = rule.label;

    const hint = document.createElement("span");
    hint.className = "rule-mode-hint";
    hint.textContent = rule.hint;

    const indicator = document.createElement("span");
    indicator.className = "rule-indicator off";
    indicator.id = "ruleInd_" + rule.field;
    indicator.textContent = "✗";

    div.appendChild(label);
    div.appendChild(hint);
    div.appendChild(indicator);

    // 房主可点击切换
    if (isHost) {
      div.style.cursor = "pointer";
      div.addEventListener("click", (function(f) { return function() { onRuleToggle(f); }; })(rule.field));
    }

    ruleList.appendChild(div);
  }
}

function updateRuleIndicators() {
  for (const field of Object.keys(ruleFlags)) {
    const ind = document.getElementById("ruleInd_" + field);
    if (!ind) continue;
    const val = ruleFlags[field];
    ind.textContent = val ? "✓" : "✗";
    ind.className = "rule-indicator " + (val ? "on" : "off");
  }
}

function onRuleToggle(field) {
  if (!isHost) return;
  ruleFlags[field] = !ruleFlags[field];

  // 互斥限制：dualColors 和 teamMode 不能同时开启
  if (field === "dualColors" && ruleFlags.dualColors) {
    ruleFlags.teamMode = false;
  }
  if (field === "teamMode" && ruleFlags.teamMode) {
    ruleFlags.dualColors = false;
  }

  updateRuleIndicators();
  updatePrePlayerList(allPlayers);

  sendToParent({ type: "game_action", action: "rule_change", data: { field: field, value: ruleFlags[field] } });
}

function updatePrePlayerList(players) {
  allPlayers = players;
  if (!allPlayers || allPlayers.length === 0) return;
  playerCount = allPlayers.length;

  // 更新房主
  if (!hostUsername && allPlayers.length > 0) {
    hostUsername = allPlayers[0].username;
    isHost = (myInfo.username === hostUsername);
    buildRulePanel();
  }

  const container = document.getElementById("prePlayerItems");
  container.innerHTML = "";

  for (let i = 0; i < allPlayers.length; i++) {
    const p = allPlayers[i];
    const div = document.createElement("div");
    div.className = "pre-player-item";

    const avatar = document.createElement("div");
    avatar.className = "pre-player-avatar";
    avatar.style.backgroundColor = p.borderColor || "#ccc";
    avatar.style.color = p.textColor || "#fff";
    avatar.textContent = (p.avatarText || p.username || "?").substring(0, 6);

    const name = document.createElement("span");
    name.className = "pre-player-name";
    name.textContent = p.username;

    const ready = document.createElement("span");
    ready.className = "pre-player-ready waiting";
    ready.textContent = p.ready ? "✓ 已准备" : "⏳ 等待中";
    if (p.ready) ready.classList.add("ready");

    div.appendChild(avatar);
    div.appendChild(name);
    if (p.username === hostUsername) {
      const hostTag = document.createElement("span");
      hostTag.className = "pre-player-host";
      hostTag.textContent = "房主";
      div.appendChild(hostTag);
    }
    div.appendChild(ready);
    container.appendChild(div);
  }

  updateRuleIndicators();
}

function toggleReady() {
  myReady = !myReady;
  sendToParent({ type: "set_ready", ready: myReady });
  const btn = document.getElementById("btnReady");
  if (myReady) {
    btn.textContent = "取消准备";
    btn.classList.add("is-ready");
  } else {
    btn.textContent = "准备";
    btn.classList.remove("is-ready");
  }
}

function leaveRoom() {
  sendToParent({ type: "leave_room" });
}

// ============================================================
// 对局界面
// ============================================================
function buildPlayerHeader() {
  const header = document.getElementById("playerHeader");
  header.innerHTML = "";

  for (let i = 0; i < playerCount; i++) {
    const cfg = PLAYER_CONFIG[i];
    const ap = allPlayers[i];
    const div = document.createElement("div");
    div.className = "player-info";
    div.id = "playerInfo_" + i;

    const dot = document.createElement("div");
    dot.className = "player-color-dot";
    dot.style.backgroundColor = cfg.color;

    const avatar = document.createElement("div");
    avatar.className = "player-avatar";
    avatar.style.backgroundColor = ap.borderColor || "#ccc";
    avatar.style.color = ap.textColor || "#fff";
    avatar.textContent = (ap.avatarText || ap.username || "?").substring(0, 3);

    const name = document.createElement("span");
    name.className = "player-name";
    name.textContent = ap.username;

    const progress = document.createElement("span");
    progress.className = "player-progress";
    progress.id = "playerProgress_" + i;
    progress.textContent = "0/4";

    div.appendChild(dot);
    div.appendChild(avatar);
    div.appendChild(name);
    div.appendChild(progress);
    header.appendChild(div);
  }
}

function updatePlayerHeader() {
  for (let i = 0; i < playerCount; i++) {
    const info = document.getElementById("playerInfo_" + i);
    const progress = document.getElementById("playerProgress_" + i);
    if (!info || !progress) continue;

    if (i === currentPlayerIndex && !gameOver) {
      info.classList.add("current-turn");
    } else {
      info.classList.remove("current-turn");
    }

    const colors = getPlayerColors(i);
    let finished = 0;
    let total = colors.length * 4;
    for (const ci of colors) {
      for (const p of pieces[ci]) {
        if (p.state === "finished") finished++;
      }
    }
    progress.textContent = finished + "/" + total;

    if (finished === total) {
      info.classList.add("finished");
    } else {
      info.classList.remove("finished");
    }
  }
}

// ============================================================
// Canvas 渲染
// ============================================================
function drawBoard() {
  const w = canvas.width;
  const h = canvas.height;
  ctx.save();
  ctx.setTransform(zoomLevel, 0, 0, zoomLevel, panX, panY);
  ctx.clearRect(0, 0, w, h);

  // 背景
  ctx.fillStyle = "#f0d9b5";
  ctx.fillRect(0, 0, w, h);

  drawCrossCells();
  drawTrackCells();
  drawHomeColumns();
  drawBaseAreas();
  drawCenter();
  drawPieces();

  // 绘制高亮目标
  if (turnPhase === "move" && selectedPieceIndex >= 0) {
    drawMoveHighlights();
  }

  ctx.restore();
  if (Math.abs(zoomLevel - 1) > 0.005) {
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(Math.round(zoomLevel * 100) + "%", 8, canvas.height - 8);
  }
}

function drawCrossCells() {
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const inCross = (c >= 6 && c <= 8) || (r >= 6 && r <= 8);
      if (inCross) {
        // 检查是否是主场列
        const isHomeCol = isHomeColumnCell(r, c);
        const pos = cellToPixel(r, c);
        ctx.fillStyle = isHomeCol ? "#e8dcc8" : "#f5e6cc";
        ctx.fillRect(pos.x - cell / 2 + 1, pos.y - cell / 2 + 1, cell - 2, cell - 2);
        ctx.strokeStyle = "#d4c4a8";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(pos.x - cell / 2, pos.y - cell / 2, cell, cell);
      }
    }
  }
}

function isHomeColumnCell(r, c) {
  for (let pi = 0; pi < 4; pi++) {
    for (const hc of PLAYER_CONFIG[pi].homeCol) {
      if (hc[0] === r && hc[1] === c) return pi;
    }
  }
  return -1;
}

function drawTrackCells() {
  for (let i = 0; i < TRACK_COUNT; i++) {
    const [r, c] = TRACK_POSITIONS[i];
    const pos = cellToPixel(r, c);
    const isFly = FLY_POINTS.includes(i);
    const isSafe = SAFE_SQUARES.has(i);
    const isCorner = [6, 19, 32, 45].includes(i);

    // 飞点 / 入口着色
    if (isFly) {
      const ownerIdx = FLY_POINTS.indexOf(i);
      ctx.fillStyle = PLAYER_CONFIG[ownerIdx].color;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, cell / 2 - 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 轨道点
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#999";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 角落特殊标记
    if (isCorner) {
      ctx.fillStyle = "#333";
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // 飞点星标 + 入口标签
    if (isFly) {
      const ownerIdx = FLY_POINTS.indexOf(i);
      ctx.fillStyle = PLAYER_CONFIG[ownerIdx].color;
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("★", pos.x, pos.y);
      // 入口颜色名称缩写
      ctx.fillStyle = "#333";
      ctx.font = "7px sans-serif";
      ctx.fillText(PLAYER_CONFIG[ownerIdx].name + "入", pos.x, pos.y - 12);
    }
  }

  // 绘制轨道方向箭头（每隔 4 格画一个，帮助理解顺时针路径）
  for (let i = 0; i < TRACK_COUNT; i += 4) {
    const [r0, c0] = TRACK_POSITIONS[i];
    const [r1, c1] = TRACK_POSITIONS[(i + 1) % TRACK_COUNT];
    const p0 = cellToPixel(r0, c0);
    const p1 = cellToPixel(r1, c1);
    const midX = (p0.x + p1.x) / 2;
    const midY = (p0.y + p1.y) / 2;
    const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    ctx.fillStyle = "rgba(100,100,100,0.5)";
    ctx.beginPath();
    ctx.moveTo(midX + Math.cos(angle) * 5, midY + Math.sin(angle) * 5);
    ctx.lineTo(midX + Math.cos(angle + 2.3) * 4, midY + Math.sin(angle + 2.3) * 4);
    ctx.lineTo(midX + Math.cos(angle - 2.3) * 4, midY + Math.sin(angle - 2.3) * 4);
    ctx.closePath();
    ctx.fill();
  }
}

function drawHomeColumns() {
  const activeColors = getActiveColors();
  for (const ci of activeColors) {
    const cfg = PLAYER_CONFIG[ci];
    for (let h = 0; h < HOME_COUNT; h++) {
      const [r, c] = cfg.homeCol[h];
      const pos = cellToPixel(r, c);
      ctx.fillStyle = cfg.color;
      ctx.globalAlpha = 0.25;
      ctx.fillRect(pos.x - cell / 2 + 1, pos.y - cell / 2 + 1, cell - 2, cell - 2);
      ctx.globalAlpha = 1;

      // 圆点
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = cfg.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 终点标记（最后一格）
      if (h === HOME_COUNT - 1) {
        ctx.fillStyle = cfg.color;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawBaseAreas() {
  const activeColors = getActiveColors();
  for (const ci of activeColors) {
    const cfg = PLAYER_CONFIG[ci];
    // 绘制基地背景
    const [r0, c0] = cfg.base[0];
    const [r3, c3] = cfg.base[3];
    const p0 = cellToPixel(r0, c0);
    const p3 = cellToPixel(r3, c3);

    const x = Math.min(p0.x, p3.x) - cell / 2 - 4;
    const y = Math.min(p0.y, p3.y) - cell / 2 - 4;
    const bw = Math.abs(p3.x - p0.x) + cell + 8;
    const bh = Math.abs(p3.y - p0.y) + cell + 8;

    ctx.fillStyle = cfg.color;
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.roundRect(x, y, bw, bh, 8);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = cfg.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, bw, bh, 8);
    ctx.stroke();

    // 4 个棋子槽
    for (const [br, bc] of cfg.base) {
      const bp = cellToPixel(br, bc);
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = cfg.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(bp.x, bp.y, pieceR + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}

function drawCenter() {
  const center = cellToPixel(7, 7);
  // 四色三角形
  const colors = [
    PLAYER_CONFIG[0].color,
    PLAYER_CONFIG[1].color,
    PLAYER_CONFIG[2].color,
    PLAYER_CONFIG[3].color,
  ];
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2 - Math.PI / 4;
    const size = cell * 1.2;
    ctx.fillStyle = colors[i];
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.arc(center.x, center.y, size, angle, angle + Math.PI / 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 中心圆
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(center.x, center.y, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 中心：显示各颜色进度
  ctx.fillStyle = "#333";
  ctx.font = "bold 10px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const actColorsArr = [...getActiveColors()];
  if (actColorsArr.length <= 2) {
    ctx.fillText("终点", center.x, center.y - 2);
    ctx.font = "6px sans-serif";
    ctx.fillText("finish", center.x, center.y + 8);
  } else {
    ctx.fillText("终", center.x, center.y - 1);
    ctx.font = "6px sans-serif";
    ctx.fillText("点", center.x, center.y + 8);
  }
}

function getActiveColors() {
  const colors = new Set();
  for (const ctr of playerControls) {
    for (const ci of ctr) colors.add(ci);
  }
  return colors;
}

function drawPieces() {
  let hasSelected = selectedPieceIndex >= 0;
  const activeColors = getActiveColors();

  for (const ci of activeColors) {
    const cfg = PLAYER_CONFIG[ci];

    for (let i = 0; i < (pieces[ci] ? pieces[ci].length : 0); i++) {
      const piece = pieces[ci][i];
      let px, py;

      if (piece.state === "base") {
        const [br, bc] = cfg.base[i];
        const bp = cellToPixel(br, bc);
        const ox = (i % 2) * 6 - 3;
        const oy = (Math.floor(i / 2) % 2) * 6 - 3;
        px = bp.x + ox;
        py = bp.y + oy;
      } else if (piece.state === "track") {
        const [tr, tc] = TRACK_POSITIONS[piece.pos];
        const tp = cellToPixel(tr, tc);
        const stackIdx = getStackOffset(ci, "track", piece.pos, i);
        px = tp.x + stackIdx * 5;
        py = tp.y + stackIdx * 3;
      } else if (piece.state === "home") {
        const [hr, hc] = cfg.homeCol[piece.pos];
        const hp = cellToPixel(hr, hc);
        const stackIdx = ruleFlags.homeStacking ? getStackOffset(ci, "home", piece.pos, i) : 0;
        px = hp.x + stackIdx * 4;
        py = hp.y + stackIdx * 2;
      } else if (piece.state === "finished") {
        const cp = cellToPixel(7, 7);
        const fi = getFinishedOffset(ci, i);
        px = cp.x + (fi % 4 - 1.5) * 10;
        py = cp.y + (Math.floor(fi / 4) - 1.5) * 10;
      } else {
        continue;
      }

      // Determine if player controls this color for selection highlight
      const ownerPlayer = findPlayerByColor(ci);
      const isSelected = hasSelected && myTurn && ownerPlayer === myPlayerIndex && ci === (selectedColorIndex || -1) && i === selectedPieceIndex;
      if (isSelected) {
        ctx.shadowColor = "#f1c40f";
        ctx.shadowBlur = 12;
      }

      const grad = ctx.createRadialGradient(px - 2, py - 2, 1, px, py, pieceR);
      grad.addColorStop(0, "#fff");
      grad.addColorStop(0.4, cfg.color);
      grad.addColorStop(1, "#000");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(px, py, pieceR, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#333";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;

      ctx.fillStyle = "#fff";
      ctx.font = "bold 9px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText((i + 1).toString(), px, py);

      const stackSize = countPiecesAt(ci, piece.state, piece.pos);
      if (stackSize > 1 && i === getFirstPieceInStack(ci, piece.state, piece.pos)) {
        ctx.fillStyle = "#fff";
        ctx.font = "bold 12px sans-serif";
        ctx.fillText("×" + stackSize, px + pieceR + 4, py - pieceR);
      }
    }
  }
}

function getStackOffset(colorIndex, state, pos, pieceIndex) {
  let count = 0;
  for (let i = 0; i < pieceIndex; i++) {
    if (pieces[colorIndex][i].state === state && pieces[colorIndex][i].pos === pos) count++;
  }
  return count;
}

function getFirstPieceInStack(colorIndex, state, pos) {
  for (let i = 0; i < pieces[colorIndex].length; i++) {
    if (pieces[colorIndex][i].state === state && pieces[colorIndex][i].pos === pos) return i;
  }
  return -1;
}

function getFinishedOffset(colorIndex, pieceIndex) {
  return colorIndex * 4 + pieceIndex;
}

function drawMoveHighlights() {
  for (const move of validMoves) {
    if (move.pieceIndex !== selectedPieceIndex || move.colorIndex !== selectedColorIndex) continue;
    let px, py;
    if (move.toState === "track") {
      const [tr, tc] = TRACK_POSITIONS[move.toPos];
      const tp = cellToPixel(tr, tc);
      px = tp.x; py = tp.y;
    } else if (move.toState === "home") {
      const cfg = PLAYER_CONFIG[move.colorIndex];
      const [hr, hc] = cfg.homeCol[move.toPos];
      const hp = cellToPixel(hr, hc);
      px = hp.x; py = hp.y;
    } else if (move.toState === "finished") {
      const cp = cellToPixel(7, 7);
      px = cp.x; py = cp.y;
    } else {
      continue;
    }

    ctx.fillStyle = "rgba(241, 196, 15, 0.5)";
    ctx.strokeStyle = "#f1c40f";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, pieceR + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

// ============================================================
// 骰子绘制
// ============================================================
function drawDie(value) {
  const dctx = diceCtx;
  const dw = diceCanvas.width;
  const dh = diceCanvas.height;
  dctx.clearRect(0, 0, dw, dh);

  // 背景
  dctx.fillStyle = "#f5f0e8";
  dctx.beginPath();
  dctx.roundRect(2, 2, dw - 4, dh - 4, 8);
  dctx.fill();

  dctx.strokeStyle = "#999";
  dctx.lineWidth = 2;
  dctx.beginPath();
  dctx.roundRect(2, 2, dw - 4, dh - 4, 8);
  dctx.stroke();

  // 点数
  const cx = dw / 2;
  const cy = dh / 2;
  const r = 5;
  const positions = {
    1: [[cx, cy]],
    2: [[cx - 12, cy - 12], [cx + 12, cy + 12]],
    3: [[cx - 12, cy - 12], [cx, cy], [cx + 12, cy + 12]],
    4: [[cx - 12, cy - 12], [cx + 12, cy - 12], [cx - 12, cy + 12], [cx + 12, cy + 12]],
    5: [[cx - 12, cy - 12], [cx + 12, cy - 12], [cx, cy], [cx - 12, cy + 12], [cx + 12, cy + 12]],
    6: [[cx - 12, cy - 12], [cx + 12, cy - 12], [cx - 12, cy], [cx + 12, cy], [cx - 12, cy + 12], [cx + 12, cy + 12]],
  };

  dctx.fillStyle = "#333";
  for (const [px, py] of (positions[value] || positions[1])) {
    dctx.beginPath();
    dctx.arc(px, py, r, 0, Math.PI * 2);
    dctx.fill();
  }
}

// ============================================================
// 移动验证
// ============================================================
function getValidMoves(playerIndex, dieVal) {
  const moves = [];
  const colors = getPlayerColors(playerIndex);

  for (const ci of colors) {
    const entryPos = PLAYER_CONFIG[ci].entryPos;

    for (let i = 0; i < 4; i++) {
      const piece = pieces[ci][i];
      if (piece.state === "finished") continue;

      if (piece.state === "base") {
        if (dieVal === 6) {
          const oppStack = getOpponentStackSizeAt(playerIndex, entryPos);
          if (oppStack > 0 && !ruleFlags.singleStackBothBack) {
            continue;
          }
          moves.push({ colorIndex: ci, pieceIndex: i, fromState: "base", toState: "track", toPos: entryPos });
        }
        continue;
      }

      if (piece.state === "track") {
        const stepsToHome = (entryPos - 1 - piece.pos + TRACK_COUNT) % TRACK_COUNT;

        if (dieVal <= stepsToHome) {
          const newPos = (piece.pos + dieVal) % TRACK_COUNT;
          if (isPathBlocked(playerIndex, piece.pos, newPos, dieVal)) continue;

          const myStackSize = countPiecesAt(ci, "track", piece.pos);
          const oppStackSize = getOpponentStackSizeAt(playerIndex, newPos);
          if (oppStackSize > 0 && myStackSize === 1 && oppStackSize > 1 && !ruleFlags.singleStackBothBack) {
            continue;
          }

          // Check safe squares
          if (SAFE_SQUARES.has(newPos)) {
            moves.push({ colorIndex: ci, pieceIndex: i, fromState: "track", fromPos: piece.pos, toState: "track", toPos: newPos });
          } else {
            moves.push({ colorIndex: ci, pieceIndex: i, fromState: "track", fromPos: piece.pos, toState: "track", toPos: newPos });
          }
        } else {
          const overshoot = dieVal - stepsToHome;
          if (overshoot >= 1 && overshoot <= HOME_COUNT) {
            const homeIdx = overshoot - 1;
            if (!ruleFlags.homeStacking && hasFriendlyPieceAt(playerIndex, "home", homeIdx)) continue;
            moves.push({ colorIndex: ci, pieceIndex: i, fromState: "track", fromPos: piece.pos, toState: "home", toPos: homeIdx });
          } else if (overshoot === HOME_COUNT + 1) {
            moves.push({ colorIndex: ci, pieceIndex: i, fromState: "track", fromPos: piece.pos, toState: "finished", toPos: -1 });
          } else if (overshoot > HOME_COUNT + 1) {
            if (ruleFlags.overstepHome) {
              moves.push({ colorIndex: ci, pieceIndex: i, fromState: "track", fromPos: piece.pos, toState: "finished", toPos: -1 });
            }
          }
        }
      }

      if (piece.state === "home") {
        const newHomeIdx = piece.pos + dieVal;
        if (newHomeIdx === HOME_COUNT) {
          moves.push({ colorIndex: ci, pieceIndex: i, fromState: "home", fromPos: piece.pos, toState: "finished", toPos: -1 });
        } else if (newHomeIdx < HOME_COUNT) {
          if (!ruleFlags.homeStacking && hasFriendlyPieceAt(playerIndex, "home", newHomeIdx)) continue;
          moves.push({ colorIndex: ci, pieceIndex: i, fromState: "home", fromPos: piece.pos, toState: "home", toPos: newHomeIdx });
        }
      }
    }
  }

  return moves;
}

function isPathBlocked(playerIndex, fromPos, toPos, steps) {
  for (let s = 1; s < steps; s++) {
    const midPos = (fromPos + s) % TRACK_COUNT;
    if (hasOpponentStack(playerIndex, midPos)) return true;
  }
  return false;
}

function getOpponentStackSizeAt(myPlayerIndex, trackPos) {
  const myColors = new Set(getPlayerColors(myPlayerIndex));
  let maxSize = 0;
  for (let ci = 0; ci < 4; ci++) {
    if (myColors.has(ci) || isFriendlyColor(myPlayerIndex, ci)) continue;
    const sz = countPiecesAt(ci, "track", trackPos);
    if (sz > maxSize) maxSize = sz;
  }
  return maxSize;
}

// ============================================================
// 移动执行
// ============================================================
function executeMove(colorIndex, pieceIndex, move) {
  const piece = pieces[colorIndex][pieceIndex];
  piece.state = move.toState;
  piece.pos = move.toState === "finished" ? -1 : move.toPos;
  lastMovedPiece = { colorIndex, pieceIndex };

  // 检测飞行（落在飞点）
  if (move.toState === "track" && FLY_POINTS.includes(move.toPos)) {
    const flyIdx = FLY_POINTS.indexOf(move.toPos);
    if (flyIdx === colorIndex) {
      const nextFly = (move.toPos + 13) % TRACK_COUNT;
      if (FLY_POINTS.includes(nextFly)) {
        piece.pos = nextFly;
      }
    }
  }

  // 检测踩回
  if (move.toState === "track") {
    const myStackSize = countPiecesAt(colorIndex, "track", piece.pos);
    checkCapture(colorIndex, piece.pos, myStackSize);
  }

  // 检测飞行连锁（飞后落飞点）
  if (piece.state === "track" && FLY_POINTS.includes(piece.pos)) {
    const flyIdx = FLY_POINTS.indexOf(piece.pos);
    if (flyIdx === colorIndex) {
      const nextFly = (piece.pos + 13) % TRACK_COUNT;
      if (FLY_POINTS.includes(nextFly)) {
        piece.pos = nextFly;
        if (piece.state === "track") {
          const myStackSize = countPiecesAt(colorIndex, "track", piece.pos);
          checkCapture(colorIndex, piece.pos, myStackSize);
        }
      }
    }
  }
}

function checkCapture(colorIndex, trackPos, myStackSize) {
  if (SAFE_SQUARES.has(trackPos)) return;

  const myPlayer = findPlayerByColor(colorIndex);

  for (let ci = 0; ci < 4; ci++) {
    if (ci === colorIndex || isFriendlyColor(myPlayer, ci)) continue;

    const oppStackSize = countPiecesAt(ci, "track", trackPos);
    if (oppStackSize === 0) continue;

    if (myStackSize === 1 && oppStackSize > 1) {
      if (ruleFlags.singleStackBothBack) {
        sendPiecesToBase(colorIndex, "track", trackPos);
        sendPiecesToBase(ci, "track", trackPos);
      } else {
        sendPiecesToBase(colorIndex, "track", trackPos);
      }
    } else if (myStackSize >= oppStackSize) {
      sendPiecesToBase(ci, "track", trackPos);
    } else {
      sendPiecesToBase(colorIndex, "track", trackPos);
    }
  }
}

function sendPiecesToBase(colorIndex, state, pos) {
  for (const p of pieces[colorIndex]) {
    if (p.state === state && p.pos === pos) {
      p.state = "base";
      p.pos = -1;
    }
  }
}

function findPlayerByColor(colorIndex) {
  for (let pi = 0; pi < playerControls.length; pi++) {
    if (playerControls[pi].includes(colorIndex)) return pi;
  }
  return colorIndex;
}

function checkWinForPlayer(playerIndex) {
  const colors = getPlayerColors(playerIndex);
  for (const ci of colors) {
    for (const p of pieces[ci]) {
      if (p.state !== "finished") return false;
    }
  }
  return true;
}

function checkWinForColor(colorIndex) {
  return pieces[colorIndex].every(p => p.state === "finished");
}

function checkTeamWin(teamIndex) {
  return getTeamAllFinished(teamIndex);
}

function checkDualColorWin(playerIndex) {
  return checkWinForPlayer(playerIndex);
}

// ============================================================
// 回合管理
// ============================================================
function advanceTurn() {
  if (gameOver) return;
  selectedPieceIndex = -1;
  selectedColorIndex = -1;
  validMoves = [];
  turnPhase = "roll";
  diceRolled = false;
  nudgeSent = false;

  // 重置连续 6 计数（如果非 6 或惩罚）
  if (diceValue !== 6 || consecutiveSixes === 0) {
    // consecutiveSixes already reset if not 6
  }

  // 额外回合？
  if (diceValue === 6 && consecutiveSixes < 3) {
    // 同一玩家继续
    myTurn = (currentPlayerIndex === myPlayerIndex);
  } else {
    // 下一个玩家
    const idx = turnOrder.indexOf(currentPlayerIndex);
    const nextIdx = (idx + 1) % turnOrder.length;
    currentPlayerIndex = turnOrder[nextIdx];
    myTurn = (currentPlayerIndex === myPlayerIndex);
    consecutiveSixes = 0;
  }

  updateTurnUI();
  if (myTurn) {
    startMoveTimer();
  }
  drawBoard();
  updatePlayerHeader();
}

function updateTurnUI() {
  const rollBtn = document.getElementById("btnRoll");
  const flyBtn = document.getElementById("btnFly");
  const nudgeBtn = document.getElementById("btnNudge");
  const status = document.getElementById("statusText");

  if (myTurn && turnPhase === "roll") {
    rollBtn.disabled = false;
    rollBtn.style.display = "";
    flyBtn.style.display = "none";
    nudgeBtn.classList.remove("show");
    status.textContent = "请掷骰子";
  } else if (myTurn && turnPhase === "move") {
    rollBtn.disabled = true;
    const canFly = (diceValue === 5 && ruleFlags.flyOnFive);
    flyBtn.style.display = canFly ? "" : "none";
    nudgeBtn.classList.remove("show");
    if (canFly) {
      status.textContent = '请移动棋子或点击"飞行"（骰子: 5）';
      flyBtn.style.background = "#e67e22";
      flyBtn.style.animation = "pulse 1s ease-in-out 3";
    } else {
      flyBtn.style.background = "#3498db";
      flyBtn.style.animation = "";
      status.textContent = "请选择棋子移动（骰子: " + diceValue + "）";
    }
  } else if (!myTurn && !gameOver) {
    rollBtn.disabled = true;
    flyBtn.style.display = "none";
    nudgeBtn.classList.add("show");
    const cp = allPlayers[currentPlayerIndex];
    status.textContent = "等待 " + (cp ? cp.username : "?") + " 行动...";
  }

  updatePlayerHeader();
}

// ============================================================
// 用户交互
// ============================================================
function rollDice() {
  if (!myTurn || turnPhase !== "roll" || gameOver) return;

  const value = Math.floor(Math.random() * 6) + 1;

  // 发送并本地应用
  sendToParent({ type: "game_action", action: "dice_roll", data: { value: value } });
  applyDiceRoll(value);
}

function applyDiceRoll(value) {
  diceValue = value;
  drawDie(value);
  diceRolled = true;

  if (value === 6) {
    consecutiveSixes++;
  } else {
    consecutiveSixes = 0;
  }

  // 连掷三次 6 惩罚
  if (consecutiveSixes === 3) {
    if (lastMovedPiece) {
      const lp = pieces[lastMovedPiece.colorIndex][lastMovedPiece.pieceIndex];
      if (lp.state !== "base" && lp.state !== "finished") {
        lp.state = "base";
        lp.pos = -1;
      }
    }
    consecutiveSixes = 0;
    lastMovedPiece = null;
    if (myTurn) {
      showSixPenalty();
      sendToParent({ type: "game_action", action: "advance_turn", data: { reason: "six_penalty" } });
      setTimeout(() => { hideSixPenalty(); advanceTurn(); }, 1500);
    }
    return;
  }

  // 计算合法移动（仅当前回合玩家需要交互，其他玩家仅更新状态）
  if (myTurn) {
    validMoves = getValidMoves(currentPlayerIndex, value);

    if (validMoves.length === 0) {
      // 五点可飞：即使无合法移动，只要有在轨棋子仍可飞行
      const canFlyNow = (value === 5 && ruleFlags.flyOnFive && hasFlyablePiece());
      if (canFlyNow) {
        turnPhase = "move";
        selectedPieceIndex = -1;
        selectedColorIndex = -1;
        updateTurnUI();
        drawBoard();
        return;
      }
      turnPhase = "pass";
      updateTurnUI();
      document.getElementById("statusText").textContent = "无合法移动，跳过回合";
      sendToParent({ type: "game_action", action: "advance_turn" });
      setTimeout(() => advanceTurn(), 1000);
      return;
    }

    turnPhase = "move";
    selectedPieceIndex = -1;
    selectedColorIndex = -1;
    updateTurnUI();
    drawBoard();

    const uniqueKeys = [...new Set(validMoves.map(m => m.colorIndex + ":" + m.pieceIndex))];
    if (uniqueKeys.length === 1) {
      const [ci, pi] = uniqueKeys[0].split(":").map(Number);
      selectedColorIndex = ci;
      selectedPieceIndex = pi;
      drawBoard();
    }
  } else {
    // 远程玩家：只更新显示
    validMoves = [];
    selectedPieceIndex = -1;
    updateTurnUI();
    drawBoard();
    updatePlayerHeader();
  }
}

function hasFlyablePiece() {
  const myColors = getMyControlledColors();
  for (const ci of myColors) {
    for (let i = 0; i < 4; i++) {
      const p = pieces[ci][i];
      if (p.state === "track") return true;
    }
  }
  return false;
}

function chooseFly() {
  if (!myTurn || turnPhase !== "move" || diceValue !== 5 || !ruleFlags.flyOnFive || gameOver) return;

  const myColors = getMyControlledColors();
  for (const ci of myColors) {
    for (let i = 0; i < 4; i++) {
      const p = pieces[ci][i];
      if (p.state === "track") {
        let nextFly = -1;
        for (const fp of FLY_POINTS) {
          if (fp > p.pos) { nextFly = fp; break; }
        }
        if (nextFly === -1) nextFly = FLY_POINTS[0];

        const move = { colorIndex: ci, pieceIndex: i, fromState: "track", fromPos: p.pos, toState: "track", toPos: nextFly };
        executeMove(ci, i, move);
        // 发送实际最终位置（executeMove 可能触发自动飞行链）
        sendToParent({ type: "game_action", action: "piece_fly", data: { colorIndex: ci, pieceIndex: i, toPos: pieces[ci][i].pos } });

        if (checkWinForPlayer(myPlayerIndex)) {
          handleMyWin();
        } else {
          advanceTurn();
        }
        return;
      }
    }
  }
  document.getElementById("statusText").textContent = "无可飞行的棋子";
}

function onCanvasClick(e) {
  if (!myTurn || turnPhase !== "move" || gameOver) return;
  if (_dragMoved) { _dragMoved = false; return; }

  const pt = canvasToBoard(e.clientX, e.clientY);
  const mx = pt.x, my = pt.y;

  // Check if clicked a highlighted target
  if (selectedPieceIndex >= 0 && selectedColorIndex >= 0) {
    for (const move of validMoves) {
      if (move.pieceIndex !== selectedPieceIndex || move.colorIndex !== selectedColorIndex) continue;
      const target = getMoveTargetPixel(move);
      const dist = Math.hypot(mx - target.x, my - target.y);
      if (dist < pieceR + 10) {
        executeSelectedMove(move);
        return;
      }
    }
  }

  // Check if clicked own piece
  const myColors = getMyControlledColors();
  let clickedPiece = -1, clickedCI = -1;
  let minDist = Infinity;

  for (const ci of myColors) {
    for (let i = 0; i < 4; i++) {
      const p = pieces[ci][i];
      if (p.state === "finished") continue;
      const pos = getPiecePixel(ci, i);
      if (!pos) continue;
      const dist = Math.hypot(mx - pos.x, my - pos.y);
      if (dist < pieceR + 5 && dist < minDist) {
        minDist = dist;
        clickedPiece = i;
        clickedCI = ci;
      }
    }
  }

  if (clickedCI >= 0) {
    const hasMoves = validMoves.some(m => m.colorIndex === clickedCI && m.pieceIndex === clickedPiece);
    if (hasMoves) {
      selectedColorIndex = clickedCI;
      selectedPieceIndex = clickedPiece;
      drawBoard();
    }
  } else {
    selectedColorIndex = -1;
    selectedPieceIndex = -1;
    drawBoard();
  }
}

function getMoveTargetPixel(move) {
  if (move.toState === "track") {
    const [r, c] = TRACK_POSITIONS[move.toPos];
    return cellToPixel(r, c);
  } else if (move.toState === "home") {
    const cfg = PLAYER_CONFIG[move.colorIndex];
    const [r, c] = cfg.homeCol[move.toPos];
    return cellToPixel(r, c);
  } else {
    return cellToPixel(7, 7);
  }
}

function getPiecePixel(colorIndex, pieceIndex) {
  const piece = pieces[colorIndex][pieceIndex];
  const cfg = PLAYER_CONFIG[colorIndex];
  if (piece.state === "base") {
    const [r, c] = cfg.base[pieceIndex];
    return cellToPixel(r, c);
  } else if (piece.state === "track") {
    const [r, c] = TRACK_POSITIONS[piece.pos];
    return cellToPixel(r, c);
  } else if (piece.state === "home") {
    const [r, c] = cfg.homeCol[piece.pos];
    return cellToPixel(r, c);
  } else {
    return cellToPixel(7, 7);
  }
}

function executeSelectedMove(move) {
  stopMoveTimer();

  sendToParent({ type: "game_action", action: "piece_move", data: {
    colorIndex: move.colorIndex,
    pieceIndex: move.pieceIndex,
    toState: move.toState,
    toPos: move.toPos,
  }});

  executeMove(move.colorIndex, move.pieceIndex, move);

  if (checkWinForPlayer(myPlayerIndex)) {
    handleMyWin();
    return;
  }

  if (ruleFlags.teamMode && playerCount === 4) {
    const teamIdx = myPlayerIndex % 2;
    if (checkTeamWin(teamIdx)) {
      handleTeamWin(teamIdx);
      return;
    }
  }

  advanceTurn();
}

function handleMyWin() {
  gameOver = true;
  stopMoveTimer();
  myTurn = false;
  document.getElementById("statusText").textContent = "你赢了！";
  document.getElementById("btnSurrender").classList.remove("show");
  document.getElementById("btnNudge").classList.remove("show");
  document.getElementById("btnPlayAgain").classList.add("show");
  document.getElementById("btnRoll").disabled = true;

  if (ruleFlags.teamMode && playerCount === 4) {
    const teamIdx = myPlayerIndex % 2;
    const winners = allPlayers.filter((_, i) => i % 2 === teamIdx).map(p => p.username);
    sendToParent({ type: "game_over", gameName: thisGameName, result: "win", isDraw: false, winners: winners });
  } else {
    sendToParent({ type: "game_over", gameName: thisGameName, result: "win", isDraw: false });
  }
  drawBoard();
  updatePlayerHeader();
}

function handleTeamWin(teamIdx) {
  gameOver = true;
  stopMoveTimer();
  myTurn = false;

  const iAmWinner = (myPlayerIndex % 2 === teamIdx);
  document.getElementById("statusText").textContent = iAmWinner ? "你们队赢了！" : "对方队伍赢了！";
  document.getElementById("btnSurrender").classList.remove("show");
  document.getElementById("btnNudge").classList.remove("show");
  document.getElementById("btnPlayAgain").classList.add("show");
  document.getElementById("btnRoll").disabled = true;

  const winners = allPlayers.filter((_, i) => i % 2 === teamIdx).map(p => p.username);
  sendToParent({ type: "game_over", gameName: thisGameName, result: iAmWinner ? "win" : "loss", isDraw: false, winners: winners });
  drawBoard();
  updatePlayerHeader();
}

function showSixPenalty() {
  const toast = document.getElementById("sixPenaltyToast");
  toast.style.display = "";
  toast.style.transform = "translate(-50%, -50%) scale(1)";
}

function hideSixPenalty() {
  const toast = document.getElementById("sixPenaltyToast");
  toast.style.display = "none";
  toast.style.transform = "translate(-50%, -50%) scale(0)";
}

// ============================================================
// 消息处理
// ============================================================
function onParentMessage(event) {
  const msg = event.data;
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case "room_update": handleRoomUpdate(msg); break;
    case "game_start": handleGameStart(msg); break;
    case "game_action": handleGameAction(msg); break;
    case "ready_update": handleReadyUpdate(msg); break;
  }
}

function handleRoomUpdate(msg) {
  const players = msg.players || [];
  updatePrePlayerList(players);

  if (players.length > 0) {
    showWaiting("等待玩家加入... (" + players.length + "/" + (playerCount || "?") + ")");
  }
}

function handleReadyUpdate(msg) {
  const players = msg.players || [];
  // 更新玩家准备状态
  for (const rp of players) {
    const ap = allPlayers.find(p => p.username === rp.username);
    if (ap) ap.ready = rp.ready;
  }
  updatePrePlayerList(allPlayers);

  const readyCount = players.filter(p => p.ready).length;
  document.getElementById("preGameStatus").textContent =
    "等待所有玩家准备...（" + readyCount + "/" + players.length + "）";

  // 再来一局：游戏进行中/结束时，全部玩家变为未准备 → 重置到赛前界面
  if (gameStarted && readyCount === 0) {
    resetToPreGame();
  }
}

function resetToPreGame() {
  stopMoveTimer();
  gameStarted = false;
  gameOver = false;
  myTurn = false;
  diceValue = 1;
  diceRolled = false;
  consecutiveSixes = 0;
  lastMovedPiece = null;
  validMoves = [];
  selectedPieceIndex = -1;
  selectedColorIndex = -1;
  nudgeSent = false;
  document.getElementById("gamePanel").style.display = "none";
  document.getElementById("preGamePanel").style.display = "";
  document.getElementById("btnPlayAgain").classList.remove("show");
  document.getElementById("btnSurrender").classList.remove("show");
  document.getElementById("btnNudge").classList.remove("show");
  document.getElementById("btnRoll").disabled = true;
  document.getElementById("btnFly").style.display = "none";
  document.getElementById("statusText").textContent = "";
  document.getElementById("moveTimer").textContent = "60s";
  document.getElementById("moveTimer").classList.remove("urgent");
  drawDie(1);
}

function handleGameStart(msg) {
  gameStarted = true;
  gameOver = false;
  allPlayers = msg.players || [];
  playerCount = allPlayers.length;

  // 分配玩家索引
  for (let i = 0; i < allPlayers.length; i++) {
    allPlayers[i].playerIndex = i;
    if (allPlayers[i].username === myInfo.username) {
      myPlayerIndex = i;
    }
  }

  // 初始化 playerControls
  playerControls = [];
  if (ruleFlags.dualColors && playerCount === 2) {
    playerControls[0] = [0, 2]; // 红+绿
    playerControls[1] = [1, 3]; // 蓝+黄
  } else {
    for (let i = 0; i < playerCount; i++) {
      playerControls[i] = [i];
    }
  }

  // 收集活跃颜色
  const activeColors = new Set();
  for (const colors of playerControls) {
    for (const ci of colors) activeColors.add(ci);
  }

  // 初始化棋子（仅活跃颜色）
  pieces = [[], [], [], []];
  for (const ci of activeColors) {
    for (let j = 0; j < 4; j++) {
      pieces[ci][j] = { state: "base", pos: -1 };
    }
  }

  // 回合顺序
  const firstUsername = msg.firstTurn;
  const firstIdx = allPlayers.findIndex(p => p.username === firstUsername);
  turnOrder = [];
  for (let i = 0; i < playerCount; i++) {
    turnOrder.push((firstIdx + i) % playerCount);
  }
  currentPlayerIndex = turnOrder[0];
  myTurn = (currentPlayerIndex === myPlayerIndex);

  // 隐藏赛前界面，显示对局界面
  document.getElementById("preGamePanel").style.display = "none";
  document.getElementById("gamePanel").style.display = "";
  hideWaiting();

  buildPlayerHeader();
  updatePlayerHeader();
  drawBoard();

  // 初始化按钮
  document.getElementById("btnSurrender").classList.add("show");
  document.getElementById("btnNudge").classList.remove("show");
  document.getElementById("btnPlayAgain").classList.remove("show");
  document.getElementById("btnRoll").disabled = !myTurn;
  document.getElementById("btnFly").style.display = "none";

  turnPhase = "roll";
  diceValue = 1;
  consecutiveSixes = 0;
  lastMovedPiece = null;
  validMoves = [];
  selectedPieceIndex = -1;
  drawDie(1);

  updateTurnUI();
  if (myTurn) startMoveTimer();

  document.getElementById("statusText").textContent = myTurn ? "请掷骰子" : "等待对手行动...";
}

function handleGameAction(msg) {
  if (!gameStarted) {
    // 赛前阶段的 rule_change
    if (msg.action === "rule_change") {
      ruleFlags[msg.data.field] = msg.data.value;
      updateRuleIndicators();
      updatePrePlayerList(allPlayers);
    }
    return;
  }

  const from = msg.from;
  const fromIdx = allPlayers.findIndex(p => p.username === from);
  if (fromIdx < 0) return;

  if (gameOver && (msg.action === "dice_roll" || msg.action === "piece_move" || msg.action === "piece_fly")) {
    return;
  }

  switch (msg.action) {
    case "dice_roll":
      if (fromIdx !== myPlayerIndex) {
        applyDiceRoll(msg.data.value);
      }
      break;

    case "piece_move": {
      const data = msg.data;
      executeMove(data.colorIndex, data.pieceIndex, {
        toState: data.toState,
        toPos: data.toPos,
      });

      if (ruleFlags.teamMode && playerCount === 4) {
        const teamIdx = data.colorIndex % 2;
        if (checkTeamWin(teamIdx)) {
          handleTeamWin(teamIdx);
          return;
        }
      } else if (checkWinForPlayer(fromIdx)) {
        gameOver = true;
        stopMoveTimer();
        myTurn = false;
        document.getElementById("statusText").textContent =
          (fromIdx === myPlayerIndex || isFriendly(fromIdx, myPlayerIndex)) ? "你赢了！" : "对手赢了！";
        document.getElementById("btnSurrender").classList.remove("show");
        document.getElementById("btnNudge").classList.remove("show");
        document.getElementById("btnPlayAgain").classList.add("show");
        document.getElementById("btnRoll").disabled = true;
        drawBoard();
        updatePlayerHeader();
        return;
      }

      if (fromIdx !== myPlayerIndex) {
        advanceTurn();
      }
      drawBoard();
      updatePlayerHeader();
      break;
    }

    case "piece_fly": {
      const data = msg.data;
      const p = pieces[data.colorIndex][data.pieceIndex];
      p.state = "track";
      p.pos = data.toPos;
      const myStackSize = countPiecesAt(data.colorIndex, "track", data.toPos);
      checkCapture(data.colorIndex, data.toPos, myStackSize);
      if (fromIdx !== myPlayerIndex) {
        advanceTurn();
      }
      drawBoard();
      updatePlayerHeader();
      break;
    }

    case "advance_turn":
      if (fromIdx !== myPlayerIndex) {
        if (msg.data && msg.data.reason === "six_penalty") {
          showSixPenalty();
          setTimeout(() => { hideSixPenalty(); advanceTurn(); drawBoard(); updatePlayerHeader(); }, 1500);
        } else {
          advanceTurn();
          drawBoard();
          updatePlayerHeader();
        }
      }
      break;

    case "surrender":
      gameOver = true;
      stopMoveTimer();
      myTurn = false;
      document.getElementById("statusText").textContent = from + " 认输！";
      document.getElementById("btnSurrender").classList.remove("show");
      document.getElementById("btnNudge").classList.remove("show");
      document.getElementById("btnPlayAgain").classList.add("show");
      document.getElementById("btnRoll").disabled = true;
      drawBoard();
      updatePlayerHeader();
      break;

    case "nudge":
      showNudgeToast(from);
      break;

    case "timeout":
      gameOver = true;
      stopMoveTimer();
      myTurn = false;
      document.getElementById("statusText").textContent = from + " 超时！";
      document.getElementById("btnSurrender").classList.remove("show");
      document.getElementById("btnNudge").classList.remove("show");
      document.getElementById("btnPlayAgain").classList.add("show");
      document.getElementById("btnRoll").disabled = true;
      drawBoard();
      updatePlayerHeader();
      break;

    case "player_left":
      document.getElementById("statusText").textContent = from + " 离开了游戏";
      break;

    case "rule_change":
      ruleFlags[msg.data.field] = msg.data.value;
      updateRuleIndicators();
      break;
  }
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
      document.getElementById("moveTimer").classList.add("urgent");
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
  document.getElementById("moveTimer").textContent = moveTimeLeft + "s";
}

function timeoutLoss() {
  stopMoveTimer();
  if (!myTurn) return;
  gameOver = true;
  myTurn = false;
  sendToParent({ type: "game_action", action: "timeout", data: {} });
  sendToParent({ type: "game_over", gameName: thisGameName, result: "loss", isDraw: false });
  document.getElementById("statusText").textContent = "你超时了！";
  document.getElementById("btnSurrender").classList.remove("show");
  document.getElementById("btnNudge").classList.remove("show");
  document.getElementById("btnPlayAgain").classList.add("show");
  document.getElementById("btnRoll").disabled = true;
  drawBoard();
}

// ============================================================
// 其他操作
// ============================================================
function surrender() {
  if (!gameStarted || gameOver) return;
  stopMoveTimer();
  gameOver = true;
  myTurn = false;
  sendToParent({ type: "game_action", action: "surrender", data: {} });

  if (ruleFlags.teamMode && playerCount === 4) {
    const oppTeam = (myPlayerIndex % 2 === 0) ? 1 : 0;
    const winners = [];
    for (let pi = 0; pi < playerCount; pi++) {
      if (pi % 2 === oppTeam) winners.push(allPlayers[pi].username);
    }
    sendToParent({ type: "game_over", gameName: thisGameName, result: "loss", isDraw: false, winners: winners });
  } else {
    sendToParent({ type: "game_over", gameName: thisGameName, result: "loss", isDraw: false });
  }

  document.getElementById("statusText").textContent = "你认输了";
  document.getElementById("btnSurrender").classList.remove("show");
  document.getElementById("btnNudge").classList.remove("show");
  document.getElementById("btnPlayAgain").classList.add("show");
  document.getElementById("btnRoll").disabled = true;
  drawBoard();
}

function nudgePlayer() {
  if (myTurn || gameOver || nudgeSent) return;
  nudgeSent = true;
  sendToParent({ type: "game_action", action: "nudge", data: {} });
  document.getElementById("btnNudge").classList.remove("show");
  document.getElementById("statusText").textContent = "已发送提醒";
  setTimeout(() => {
    if (!gameOver && !myTurn) {
      const cp = allPlayers[currentPlayerIndex];
      document.getElementById("statusText").textContent = "等待 " + (cp ? cp.username : "?") + " 行动...";
    }
  }, 2000);
}

function showNudgeToast(from) {
  const wrapper = document.getElementById("boardWrapper");
  if (!wrapper) return;
  let toast = document.getElementById("nudgeToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "nudgeToast";
    toast.className = "nudge-toast";
    toast.textContent = from + " 提醒你落子！";
    wrapper.appendChild(toast);
  }
  toast.classList.add("show");
  if (nudgeToastTimeout) clearTimeout(nudgeToastTimeout);
  nudgeToastTimeout = setTimeout(() => { toast.classList.remove("show"); }, 2000);
}

function playAgain() {
  sendToParent({ type: "play_again" });
  resetToPreGame();
  myReady = false;
  document.getElementById("btnReady").textContent = "准备";
  document.getElementById("btnReady").classList.remove("is-ready");
  document.getElementById("preGameStatus").textContent = "等待所有玩家准备...";
}

function toggleRulesPopup() {
  const popup = document.getElementById("rulesPopup");
  if (popup.style.display === "none") {
    // 填充当前规则
    const list = document.getElementById("rulesPopupList");
    list.innerHTML = "";
    const rules = [
      { field: "flyOnFive", label: "五点可飞" },
      { field: "overstepHome", label: "允许超步直达" },
      { field: "singleStackBothBack", label: "单撞叠一起回" },
      { field: "homeStacking", label: "主场可叠子" },
      { field: "dualColors", label: "双人双色" },
      { field: "teamMode", label: "组队模式" },
    ];
    for (const r of rules) {
      const div = document.createElement("div");
      div.className = "rule-item";
      div.innerHTML = '<span class="rule-label">' + r.label + '</span>' +
        '<span class="rule-indicator ' + (ruleFlags[r.field] ? 'on' : 'off') + '">' +
        (ruleFlags[r.field] ? '✓' : '✗') + '</span>';
      list.appendChild(div);
    }
    popup.style.display = "";
  } else {
    popup.style.display = "none";
  }
}

// ============================================================
// 入口
// ============================================================
init();

// ============================================================
// 象棋（Chinese Chess）— 游戏逻辑
// 10×9 棋盘，Canvas 绘制，通过 postMessage 与大厅通信
// ============================================================

// ---------- 常量 ----------
const COLS = 9;
const ROWS = 10;
const CELL_SIZE = 60;
const PADDING = 30;
const PIECE_RADIUS = 25;
const HINT_RADIUS = 8;

const PIECE_CHARS = {
  red: {
    king: "帅", advisor: "仕", elephant: "相",
    horse: "马", rook: "车", cannon: "炮", soldier: "兵",
  },
  black: {
    king: "将", advisor: "士", elephant: "象",
    horse: "马", rook: "车", cannon: "炮", soldier: "卒",
  },
};

// ---------- 状态 ----------
let myInfo = null;
let opponentInfo = null;
let myColor = null;           // "red" | "black"
let currentTurn = null;
let myTurn = false;
let board = [];               // null | { type, color }
let gameOver = false;
let gameStarted = false;
let thisGameName = "象棋";
let selectedRow = -1;
let selectedCol = -1;
let validMoves = [];          // [{row, col}]
let lastMoveFromRow = -1;
let lastMoveFromCol = -1;
let lastMoveToRow = -1;
let lastMoveToCol = -1;
let moveTimeLeft = 60;
let moveTimerInterval = null;
let nudgeSent = false;
let canvas = null;
let ctx = null;
let roomId = null;

// ---------- 动画状态 ----------
let isAnimating = false;
let animPiece = null;         // {row, col, piece}
let animStartTime = 0;
let animCallback = null;
const ANIM_DURATION = 250;

// ============================================================
// 初始化
// ============================================================
function init() {
  canvas = document.getElementById("boardCanvas");
  ctx = canvas.getContext("2d");

  const params = new URLSearchParams(window.location.search);
  roomId = params.get("roomId");
  thisGameName = params.get("gameName") || "象棋";
  myInfo = {
    username: params.get("username"),
    avatarText: params.get("avatarText"),
    textColor: params.get("textColor"),
    borderColor: params.get("borderColor"),
  };

  resetBoard();
  const canvasWidth = (COLS - 1) * CELL_SIZE + PADDING * 2;
  const canvasHeight = (ROWS - 1) * CELL_SIZE + PADDING * 2;
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  drawBoard();

  canvas.addEventListener("click", onCanvasClick);
  window.addEventListener("message", onParentMessage);
  sendToParent({ type: "game_ready" });
  showWaiting("等待对手加入...");
  document.getElementById("statusText").textContent = "玩家：" + myInfo.username;
}

function resetBoard() {
  initBoard();
  gameOver = false;
  gameStarted = false;
  myColor = null;
  currentTurn = null;
  myTurn = false;
  selectedRow = -1;
  selectedCol = -1;
  validMoves = [];
  lastMoveFromRow = -1;
  lastMoveFromCol = -1;
  lastMoveToRow = -1;
  lastMoveToCol = -1;
  nudgeSent = false;
  opponentInfo = null;
  isAnimating = false;
  animPiece = null;
  stopMoveTimer();
}

function initBoard() {
  board = [];
  for (let r = 0; r < ROWS; r++) board[r] = new Array(COLS).fill(null);

  // 黑方底线 (row 0)
  board[0][0] = { type: "rook", color: "black" };
  board[0][1] = { type: "horse", color: "black" };
  board[0][2] = { type: "elephant", color: "black" };
  board[0][3] = { type: "advisor", color: "black" };
  board[0][4] = { type: "king", color: "black" };
  board[0][5] = { type: "advisor", color: "black" };
  board[0][6] = { type: "elephant", color: "black" };
  board[0][7] = { type: "horse", color: "black" };
  board[0][8] = { type: "rook", color: "black" };

  // 黑炮 (row 2)
  board[2][1] = { type: "cannon", color: "black" };
  board[2][7] = { type: "cannon", color: "black" };

  // 黑卒 (row 3, cols 0,2,4,6,8)
  for (let c = 0; c < COLS; c += 2) {
    board[3][c] = { type: "soldier", color: "black" };
  }

  // 红兵 (row 6, cols 0,2,4,6,8)
  for (let c = 0; c < COLS; c += 2) {
    board[6][c] = { type: "soldier", color: "red" };
  }

  // 红炮 (row 7)
  board[7][1] = { type: "cannon", color: "red" };
  board[7][7] = { type: "cannon", color: "red" };

  // 红方底线 (row 9)
  board[9][0] = { type: "rook", color: "red" };
  board[9][1] = { type: "horse", color: "red" };
  board[9][2] = { type: "elephant", color: "red" };
  board[9][3] = { type: "advisor", color: "red" };
  board[9][4] = { type: "king", color: "red" };
  board[9][5] = { type: "advisor", color: "red" };
  board[9][6] = { type: "elephant", color: "red" };
  board[9][7] = { type: "horse", color: "red" };
  board[9][8] = { type: "rook", color: "red" };
}

// ============================================================
// 坐标转换：棋盘交叉点 <-> 画布像素
// ============================================================
function intersectionToPixel(row, col) {
  return {
    x: PADDING + col * CELL_SIZE,
    y: PADDING + row * CELL_SIZE,
  };
}

function pixelToIntersection(mx, my) {
  const col = Math.round((mx - PADDING) / CELL_SIZE);
  const row = Math.round((my - PADDING) / CELL_SIZE);
  return { row, col };
}

// ============================================================
// 绘制棋盘
// ============================================================
function drawBoard(skipAnimating) {
  const w = canvas.width;
  const h = canvas.height;

  // 背景
  ctx.fillStyle = "#dcb35c";
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;

  // 横线（10条）
  for (let r = 0; r < ROWS; r++) {
    const y = PADDING + r * CELL_SIZE;
    ctx.beginPath();
    ctx.moveTo(PADDING, y);
    ctx.lineTo(PADDING + (COLS - 1) * CELL_SIZE, y);
    ctx.stroke();
  }

  // 竖线（9条）：左右边框贯穿，内线在楚河汉界处断开
  for (let c = 0; c < COLS; c++) {
    const x = PADDING + c * CELL_SIZE;
    if (c === 0 || c === COLS - 1) {
      // 边框贯穿
      ctx.beginPath();
      ctx.moveTo(x, PADDING);
      ctx.lineTo(x, PADDING + (ROWS - 1) * CELL_SIZE);
      ctx.stroke();
    } else {
      // 内线断开（上半部分：行0-4）
      ctx.beginPath();
      ctx.moveTo(x, PADDING);
      ctx.lineTo(x, PADDING + 4 * CELL_SIZE);
      ctx.stroke();
      // 内线断开（下半部分：行5-9）
      ctx.beginPath();
      ctx.moveTo(x, PADDING + 5 * CELL_SIZE);
      ctx.lineTo(x, PADDING + (ROWS - 1) * CELL_SIZE);
      ctx.stroke();
    }
  }

  // 楚河汉界文字
  ctx.fillStyle = "#333";
  ctx.font = "bold 22px KaiTi, STKaiti, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const riverY = PADDING + 4.5 * CELL_SIZE;
  const leftX = PADDING + 1.5 * CELL_SIZE;
  const rightX = PADDING + 6.5 * CELL_SIZE;
  ctx.fillText("楚  河", leftX, riverY);
  ctx.fillText("汉  界", rightX, riverY);

  // 九宫格对角线
  ctx.strokeStyle = "#333";
  ctx.lineWidth = 1;
  // 黑方九宫 (rows 0-2, cols 3-5)
  drawPalaceDiagonals(0, 3, 2, 5);
  // 红方九宫 (rows 7-9, cols 3-5)
  drawPalaceDiagonals(7, 3, 9, 5);

  // 动画中跳过的棋子 key
  const skipKey = (skipAnimating && animPiece)
    ? (animPiece.row + "," + animPiece.col) : null;

  // 绘制所有棋子
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (skipKey && r === animPiece.row && c === animPiece.col) continue;
      if (board[r][c]) {
        drawPiece(r, c, board[r][c]);
      }
    }
  }

  // 选中高亮
  if (selectedRow >= 0 && selectedCol >= 0) {
    const { x, y } = intersectionToPixel(selectedRow, selectedCol);
    ctx.beginPath();
    ctx.arc(x, y, PIECE_RADIUS + 3, 0, Math.PI * 2);
    ctx.strokeStyle = "#f1c40f";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // 最后落子标记
  if (lastMoveToRow >= 0 && lastMoveToCol >= 0) {
    const { x, y } = intersectionToPixel(lastMoveToRow, lastMoveToCol);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#ff4444";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawPalaceDiagonals(topRow, leftCol, bottomRow, rightCol) {
  const p1 = intersectionToPixel(topRow, leftCol);
  const p2 = intersectionToPixel(bottomRow, rightCol);
  const p3 = intersectionToPixel(topRow, rightCol);
  const p4 = intersectionToPixel(bottomRow, leftCol);
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(p3.x, p3.y);
  ctx.lineTo(p4.x, p4.y);
  ctx.stroke();
}

// ============================================================
// 绘制棋子
// ============================================================
function drawPiece(row, col, piece, scaleX) {
  if (scaleX === undefined) scaleX = 1;
  const { x, y } = intersectionToPixel(row, col);

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scaleX, 1);

  // 棋子圆形
  ctx.beginPath();
  ctx.arc(0, 0, PIECE_RADIUS, 0, Math.PI * 2);

  if (piece.color === "red") {
    const grad = ctx.createRadialGradient(-4, -4, 2, 0, 0, PIECE_RADIUS);
    grad.addColorStop(0, "#f5c6a0");
    grad.addColorStop(0.7, "#d4956b");
    grad.addColorStop(1, "#a0522d");
    ctx.fillStyle = grad;
  } else {
    const grad = ctx.createRadialGradient(-4, -4, 2, 0, 0, PIECE_RADIUS);
    grad.addColorStop(0, "#e8e0d0");
    grad.addColorStop(0.7, "#c8bfa8");
    grad.addColorStop(1, "#6b6050");
    ctx.fillStyle = grad;
  }
  ctx.fill();

  ctx.strokeStyle = piece.color === "red" ? "#8b0000" : "#333";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 棋子内圈
  ctx.beginPath();
  ctx.arc(0, 0, PIECE_RADIUS - 4, 0, Math.PI * 2);
  ctx.strokeStyle = piece.color === "red" ? "#c0392b" : "#444";
  ctx.lineWidth = 1;
  ctx.stroke();

  // 文字
  const char = PIECE_CHARS[piece.color][piece.type];
  ctx.fillStyle = piece.color === "red" ? "#c0392b" : "#1a1a1a";
  ctx.font = "bold 20px KaiTi, STKaiti, Microsoft YaHei, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(char, 0, 1);

  ctx.restore();
}

// ============================================================
// 绘制合法走法提示
// ============================================================
function drawHints() {
  if (!myTurn || gameOver || selectedRow < 0 || validMoves.length === 0) return;
  for (const { row, col } of validMoves) {
    const { x, y } = intersectionToPixel(row, col);
    ctx.beginPath();
    ctx.arc(x, y, HINT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(46, 204, 113, 0.45)";
    ctx.fill();
    ctx.strokeStyle = "rgba(39, 174, 96, 0.6)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

// ============================================================
// 原始走法生成（不考虑将军）
// ============================================================

function inBounds(r, c) {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS;
}

function isOwn(board, r, c, color) {
  const p = board[r][c];
  return p && p.color === color;
}

function isEnemy(board, r, c, color) {
  const p = board[r][c];
  return p && p.color !== color;
}

function canMoveTo(board, r, c, color) {
  return !isOwn(board, r, c, color);
}

// 将/帅
function getKingMoves(board, row, col, color) {
  const moves = [];
  const minR = color === "red" ? 7 : 0;
  const maxR = color === "red" ? 9 : 2;
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dr, dc] of dirs) {
    const nr = row + dr, nc = col + dc;
    if (nr >= minR && nr <= maxR && nc >= 3 && nc <= 5 && canMoveTo(board, nr, nc, color)) {
      moves.push({ row: nr, col: nc });
    }
  }
  return moves;
}

// 仕/士
function getAdvisorMoves(board, row, col, color) {
  const moves = [];
  const minR = color === "red" ? 7 : 0;
  const maxR = color === "red" ? 9 : 2;
  const dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  for (const [dr, dc] of dirs) {
    const nr = row + dr, nc = col + dc;
    if (nr >= minR && nr <= maxR && nc >= 3 && nc <= 5 && canMoveTo(board, nr, nc, color)) {
      moves.push({ row: nr, col: nc });
    }
  }
  return moves;
}

// 相/象
function getElephantMoves(board, row, col, color) {
  const moves = [];
  const minR = color === "red" ? 5 : 0;
  const maxR = color === "red" ? 9 : 4;
  const dirs = [[-2, -2], [-2, 2], [2, -2], [2, 2]];
  const eyes = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  for (let i = 0; i < 4; i++) {
    const [dr, dc] = dirs[i];
    const [er, ec] = eyes[i];
    const nr = row + dr, nc = col + dc;
    if (!inBounds(nr, nc)) continue;
    if (nr < minR || nr > maxR) continue;
    // 塞眼检查
    if (board[row + er][col + ec] !== null) continue;
    if (canMoveTo(board, nr, nc, color)) {
      moves.push({ row: nr, col: nc });
    }
  }
  return moves;
}

// 马
function getHorseMoves(board, row, col, color) {
  const moves = [];
  // [firstStepDr, firstStepDc, destDr1, destDc1, destDr2, destDc2]
  const legs = [
    [-1, 0, -2, -1, -2, 1],
    [1, 0, 2, -1, 2, 1],
    [0, -1, -1, -2, 1, -2],
    [0, 1, -1, 2, 1, 2],
  ];
  for (const [lr, lc, d1r, d1c, d2r, d2c] of legs) {
    const legR = row + lr, legC = col + lc;
    if (!inBounds(legR, legC)) continue;
    // 蹩脚检查
    if (board[legR][legC] !== null) continue;
    for (const [dr, dc] of [[d1r, d1c], [d2r, d2c]]) {
      const nr = row + dr, nc = col + dc;
      if (inBounds(nr, nc) && canMoveTo(board, nr, nc, color)) {
        moves.push({ row: nr, col: nc });
      }
    }
  }
  return moves;
}

// 车
function getRookMoves(board, row, col, color) {
  const moves = [];
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dr, dc] of dirs) {
    let r = row + dr, c = col + dc;
    while (inBounds(r, c)) {
      if (board[r][c] === null) {
        moves.push({ row: r, col: c });
      } else {
        if (board[r][c].color !== color) moves.push({ row: r, col: c });
        break;
      }
      r += dr; c += dc;
    }
  }
  return moves;
}

// 炮
function getCannonMoves(board, row, col, color) {
  const moves = [];
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dr, dc] of dirs) {
    let r = row + dr, c = col + dc;
    // 非吃子移动：直线滑动直到遇子
    while (inBounds(r, c) && board[r][c] === null) {
      moves.push({ row: r, col: c });
      r += dr; c += dc;
    }
    // 吃子：找炮架
    if (inBounds(r, c) && board[r][c] !== null) {
      // 跳过炮架
      r += dr; c += dc;
      while (inBounds(r, c) && board[r][c] === null) {
        r += dr; c += dc;
      }
      if (inBounds(r, c) && board[r][c].color !== color) {
        moves.push({ row: r, col: c });
      }
    }
  }
  return moves;
}

// 兵/卒
function getSoldierMoves(board, row, col, color) {
  const moves = [];
  const forward = color === "red" ? -1 : 1;
  const crossed = color === "red" ? row <= 4 : row >= 5;

  // 向前
  const fr = row + forward;
  if (inBounds(fr, col) && canMoveTo(board, fr, col, color)) {
    moves.push({ row: fr, col: col });
  }

  // 过河后左右
  if (crossed) {
    for (const dc of [-1, 1]) {
      const fc = col + dc;
      if (inBounds(row, fc) && canMoveTo(board, row, fc, color)) {
        moves.push({ row: row, col: fc });
      }
    }
  }
  return moves;
}

function getRawMoves(board, row, col) {
  const piece = board[row][col];
  if (!piece) return [];
  switch (piece.type) {
    case "king":    return getKingMoves(board, row, col, piece.color);
    case "advisor": return getAdvisorMoves(board, row, col, piece.color);
    case "elephant":return getElephantMoves(board, row, col, piece.color);
    case "horse":   return getHorseMoves(board, row, col, piece.color);
    case "rook":    return getRookMoves(board, row, col, piece.color);
    case "cannon":  return getCannonMoves(board, row, col, piece.color);
    case "soldier": return getSoldierMoves(board, row, col, piece.color);
    default: return [];
  }
}

// ============================================================
// 将军检测
// ============================================================
function findKing(board, color) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (p && p.type === "king" && p.color === color) return { row: r, col: c };
    }
  }
  return null;
}

function isKingInCheck(board, color) {
  const king = findKing(board, color);
  if (!king) return false;
  const enemyColor = color === "red" ? "black" : "red";
  // 检查所有敌方棋子能否到达将的位置
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (!p || p.color !== enemyColor) continue;
      const moves = getRawMoves(board, r, c);
      for (const m of moves) {
        if (m.row === king.row && m.col === king.col) return true;
      }
    }
  }
  return false;
}

function kingsAreFacing(board) {
  const redKing = findKing(board, "red");
  const blackKing = findKing(board, "black");
  if (!redKing || !blackKing) return false;
  if (redKing.col !== blackKing.col) return false;
  // 检查两将之间是否有棋子
  const minR = Math.min(redKing.row, blackKing.row);
  const maxR = Math.max(redKing.row, blackKing.row);
  for (let r = minR + 1; r < maxR; r++) {
    if (board[r][redKing.col] !== null) return false;
  }
  return true;
}

// ============================================================
// 走法合法性（模拟落子→检查将军→恢复）
// ============================================================
function isMoveLegal(board, fromRow, fromCol, toRow, toCol, color) {
  const captured = board[toRow][toCol];
  board[toRow][toCol] = board[fromRow][fromCol];
  board[fromRow][fromCol] = null;
  const legal = !isKingInCheck(board, color) && !kingsAreFacing(board);
  board[fromRow][fromCol] = board[toRow][toCol];
  board[toRow][toCol] = captured;
  return legal;
}

function getLegalMoves(board, row, col) {
  const piece = board[row][col];
  if (!piece) return [];
  const raw = getRawMoves(board, row, col);
  return raw.filter(m => isMoveLegal(board, row, col, m.row, m.col, piece.color));
}

// ============================================================
// 终局判定
// ============================================================
function hasLegalMoves(board, color) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (p && p.color === color) {
        if (getLegalMoves(board, r, c).length > 0) return true;
      }
    }
  }
  return false;
}

// ============================================================
// 走子动画
// ============================================================
function animationLoop(now) {
  if (!isAnimating) return;
  const elapsed = now - animStartTime;
  const t = Math.min(elapsed / ANIM_DURATION, 1);
  renderAnimationFrame(t);
  if (t < 1) {
    requestAnimationFrame(animationLoop);
  } else {
    isAnimating = false;
    animPiece = null;
    animStartTime = 0;
    if (animCallback) animCallback();
  }
}

function renderAnimationFrame(t) {
  drawBoard(true);
  if (animPiece) {
    const popT = Math.min(t / 0.7, 1);
    const scale = easeOutBack(popT);
    drawPiece(animPiece.row, animPiece.col, animPiece.piece, scale);
  }
  drawHints();
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// ============================================================
// 执行走子
// ============================================================
function executeMove(fromRow, fromCol, toRow, toCol, onDone) {
  const piece = board[fromRow][fromCol];

  lastMoveFromRow = fromRow;
  lastMoveFromCol = fromCol;
  lastMoveToRow = toRow;
  lastMoveToCol = toCol;

  // 更新棋盘
  board[toRow][toCol] = piece;
  board[fromRow][fromCol] = null;

  clearSelection();

  // 落子弹出动画
  isAnimating = true;
  animPiece = { row: toRow, col: toCol, piece: piece };
  animStartTime = performance.now();
  animCallback = () => {
    isAnimating = false;
    animPiece = null;
    animStartTime = 0;
    drawBoard();
    drawHints();
    if (onDone) onDone();
  };
  requestAnimationFrame(animationLoop);
}

// ============================================================
// 走子后处理
// ============================================================
function afterLocalMove() {
  const opponentColor = myColor === "red" ? "black" : "red";

  if (!hasLegalMoves(board, opponentColor)) {
    gameOver = true;
    myTurn = false;
    stopMoveTimer();
    hideTurnHighlight();
    document.getElementById("statusText").textContent = isKingInCheck(board, opponentColor)
      ? "将杀！你赢了！" : "困毙！你赢了！";
    document.getElementById("btnPlayAgain").classList.add("show");
    document.getElementById("btnSurrender").classList.remove("show");
    document.getElementById("btnNudge").classList.remove("show");
    sendToParent({ type: "game_over", gameName: thisGameName, result: "win", isDraw: false });
    return;
  }

  myTurn = false;
  currentTurn = opponentInfo.username;
  nudgeSent = false;
  document.getElementById("btnNudge").classList.add("show");
  document.getElementById("btnSurrender").classList.add("show");
  updateTurnDisplay();
  startMoveTimer();
  const checkMsg = isKingInCheck(board, opponentColor) ? "将军！" : "";
  document.getElementById("statusText").textContent = checkMsg + "等待对手应着...";
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

  const { row, col } = pixelToIntersection(mx, my);
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;

  const clickedPiece = board[row][col];

  // Case 1: 点击己方棋子 → 选中
  if (clickedPiece && clickedPiece.color === myColor) {
    if (row === selectedRow && col === selectedCol) {
      clearSelection();
      drawBoard();
      drawHints();
    } else {
      selectedRow = row;
      selectedCol = col;
      validMoves = getLegalMoves(board, row, col);
      drawBoard();
      drawHints();
    }
    return;
  }

  // Case 2: 点击合法目标位置 → 走子
  if (selectedRow >= 0 && validMoves.some(m => m.row === row && m.col === col)) {
    stopMoveTimer();
    const fromRow = selectedRow;
    const fromCol = selectedCol;
    const color = board[fromRow][fromCol].color;
    executeMove(fromRow, fromCol, row, col, () => {
      afterLocalMove();
      sendToParent({
        type: "game_action",
        action: "place_stone",
        data: { fromRow, fromCol, toRow: row, toCol: col, color },
      });
    });
    return;
  }

  // Case 3: 点击其他地方 → 取消选中
  if (selectedRow >= 0) {
    clearSelection();
    drawBoard();
    drawHints();
  }
}

function clearSelection() {
  selectedRow = -1;
  selectedCol = -1;
  validMoves = [];
}

// ============================================================
// 处理来自大厅（父页面）的消息
// ============================================================
function onParentMessage(event) {
  const msg = event.data;
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case "room_update":  handleRoomUpdate(msg);  break;
    case "game_start":   handleGameStart(msg);   break;
    case "game_action":  handleGameAction(msg);  break;
  }
}

// ============================================================
// 处理房间更新
// ============================================================
function handleRoomUpdate(msg) {
  for (const p of msg.players) {
    if (p.username !== myInfo.username) {
      opponentInfo = p;
    }
  }
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
  document.getElementById("btnNudge").classList.remove("show");

  for (const p of msg.players) {
    if (p.username !== myInfo.username) {
      opponentInfo = p;
    }
  }

  // 红方先手
  if (msg.firstTurn === myInfo.username) {
    myColor = "red";
    myTurn = true;
    currentTurn = myInfo.username;
  } else {
    myColor = "black";
    myTurn = false;
    currentTurn = msg.firstTurn;
  }

  updateTurnDisplay();
  moveTimeLeft = 60;
  updateTimerDisplay();

  if (myTurn) {
    document.getElementById("btnNudge").classList.remove("show");
    startMoveTimer();
    document.getElementById("statusText").textContent = "轮到你了（红方）";
  } else {
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
    const { fromRow, fromCol, toRow, toCol } = msg.data;

    executeMove(fromRow, fromCol, toRow, toCol, () => {
      // 检查我方是否被将杀或困毙
      if (!hasLegalMoves(board, myColor)) {
        gameOver = true;
        myTurn = false;
        hideTurnHighlight();
        if (isKingInCheck(board, myColor)) {
          document.getElementById("statusText").textContent = "将杀！你输了！";
        } else {
          document.getElementById("statusText").textContent = "困毙！你输了！";
        }
        document.getElementById("btnPlayAgain").classList.add("show");
        document.getElementById("btnSurrender").classList.remove("show");
        document.getElementById("btnNudge").classList.remove("show");
        sendToParent({ type: "game_over", gameName: thisGameName, result: "loss", isDraw: false });
        return;
      }

      myTurn = true;
      currentTurn = myInfo.username;
      nudgeSent = false;
      document.getElementById("btnNudge").classList.remove("show");
      updateTurnDisplay();
      startMoveTimer();
      const checkMsg = isKingInCheck(board, myColor) ? "将军！" : "";
      const colorName = myColor === "red" ? "红方" : "黑方";
      document.getElementById("statusText").textContent = checkMsg + "轮到你了（" + colorName + "）";
    });

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
        const colorName = myColor === "red" ? "红方" : "黑方";
        el.textContent = "轮到你了（" + colorName + "）";
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
// 渲染玩家信息
// ============================================================
function renderPlayerInfo() {
  document.getElementById("myAvatar").textContent = myInfo.avatarText;
  document.getElementById("myAvatar").style.borderColor = myInfo.borderColor;
  document.getElementById("myAvatar").style.color = myInfo.textColor;
  document.getElementById("myName").textContent = myInfo.username + "（你）";
  const myStone = document.getElementById("myStone");
  myStone.className = "player-stone " +
    (myColor === "red" ? "stone-red" : "stone-black");

  if (opponentInfo) {
    document.getElementById("opAvatar").textContent = opponentInfo.avatarText;
    document.getElementById("opAvatar").style.borderColor = opponentInfo.borderColor;
    document.getElementById("opAvatar").style.color = opponentInfo.textColor;
    document.getElementById("opName").textContent = opponentInfo.username;
    const opStone = document.getElementById("opStone");
    opStone.className = "player-stone " +
      (myColor === "red" ? "stone-black" : "stone-red");
  }
}

// ============================================================
// 等待界面
// ============================================================
function showWaiting(text) {
  document.getElementById("waitingText").textContent = text;
  document.getElementById("waitingOverlay").classList.remove("hidden");
}

function hideWaiting() {
  document.getElementById("waitingOverlay").classList.add("hidden");
}

// ============================================================
// 向父页面发送消息
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
  document.getElementById("btnNudge").classList.remove("show");
  sendToParent({ type: "game_action", action: "timeout", data: {} });
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

// ============================================================
// 国际象棋（International Chess）— 游戏逻辑
// 8×8 棋盘，Canvas 绘制，通过 postMessage 与大厅通信
// ============================================================

// ---------- 常量 ----------
const COLS = 8;
const ROWS = 8;
const CELL_SIZE = 56;
const PADDING = 20;
const HINT_RADIUS = 8;

const PIECE_CHARS = {
  white: { king: "♔", queen: "♕", rook: "♖", bishop: "♗", knight: "♘", pawn: "♙" },
  black: { king: "♚", queen: "♛", rook: "♜", bishop: "♝", knight: "♞", pawn: "♟" },
};

const PROMOTION_TYPES = ["queen", "rook", "bishop", "knight"];

// ---------- 状态 ----------
let myInfo = null;
let opponentInfo = null;
let myColor = null;
let currentTurn = null;
let myTurn = false;
let board = [];
let gameOver = false;
let gameStarted = false;
let thisGameName = "国际象棋";
let selectedRow = -1;
let selectedCol = -1;
let validMoves = [];
let moveTimeLeft = 60;
let moveTimerInterval = null;
let nudgeSent = false;
let canvas = null;
let ctx = null;
let roomId = null;

// 特殊规则状态
let castlingRights = null;  // { whiteKingside, whiteQueenside, blackKingside, blackQueenside }
let enPassantTarget = null; // { row, col } | null

// 走子记录（悔棋用）
let lastMove = null;   // 最后一步的完整信息
let prevMove = null;   // 倒数第二步
let pendingUndoRequest = false;
let pendingUndoTwoStones = false;

// 升变状态
let pendingPromotion = null; // { fromRow, fromCol, toRow, toCol } | null

// 动画状态
let isAnimating = false;
let animData = null;         // { fromRow, fromCol, toRow, toCol, piece, captured }
let animStartTime = 0;
let animCallback = null;
const ANIM_DURATION = 250;

// 将军状态（用于显示将军提示）
let inCheck = false;
let lastMoveFromRow = -1;
let lastMoveFromCol = -1;
let lastMoveToRow = -1;
let lastMoveToCol = -1;

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
  thisGameName = params.get("gameName") || "国际象棋";
  myInfo = {
    username: params.get("username"),
    avatarText: params.get("avatarText"),
    textColor: params.get("textColor"),
    borderColor: params.get("borderColor"),
  };

  resetBoard();
  canvas.width = COLS * CELL_SIZE + PADDING * 2;
  canvas.height = ROWS * CELL_SIZE + PADDING * 2;
  drawBoard();

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
  sendToParent({ type: "game_ready" });
  showWaiting("等待对手加入...");
  document.getElementById("statusText").textContent = "玩家：" + myInfo.username;
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
  lastMove = null;
  prevMove = null;
  pendingUndoRequest = false;
  pendingPromotion = null;
  nudgeSent = false;
  opponentInfo = null;
  inCheck = false;
  isAnimating = false;
  animData = null;
  castlingRights = {
    whiteKingside: true, whiteQueenside: true,
    blackKingside: true, blackQueenside: true,
  };
  enPassantTarget = null;
  stopMoveTimer();
}

function initBoard() {
  board = [];
  for (let r = 0; r < ROWS; r++) board[r] = new Array(COLS).fill(null);

  // 白方底线 (row 7)
  const backRowTypes = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];
  for (let c = 0; c < 8; c++) {
    board[7][c] = { type: backRowTypes[c], color: "white" };
    board[6][c] = { type: "pawn", color: "white" };
  }

  // 黑方底线 (row 0)
  for (let c = 0; c < 8; c++) {
    board[0][c] = { type: backRowTypes[c], color: "black" };
    board[1][c] = { type: "pawn", color: "black" };
  }
}

// ============================================================
// 显示坐标变换：让己方棋子始终在下方
// ============================================================
function toDisplay(r, c) {
  if (myColor === "black") return { row: 7 - r, col: 7 - c };
  return { row: r, col: c };
}
function toInternal(dr, dc) { return toDisplay(dr, dc); }

function squareToPixel(row, col) {
  const d = toDisplay(row, col);
  return { x: PADDING + d.col * CELL_SIZE, y: PADDING + d.row * CELL_SIZE };
}

function pixelToSquare(mx, my) {
  const dc = Math.floor((mx - PADDING) / CELL_SIZE);
  const dr = Math.floor((my - PADDING) / CELL_SIZE);
  return toInternal(dr, dc);
}

// ============================================================
// 辅助函数
// ============================================================
function inBounds(r, c) {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS;
}

function isOwn(r, c, color) {
  const p = board[r][c];
  return p && p.color === color;
}

function isEnemy(r, c, color) {
  const p = board[r][c];
  return p && p.color !== color;
}

function isEmpty(r, c) {
  return board[r][c] === null;
}

function cloneBoard(b) {
  const copy = [];
  for (let r = 0; r < ROWS; r++) {
    copy[r] = [];
    for (let c = 0; c < COLS; c++) {
      copy[r][c] = b[r][c] ? { ...b[r][c] } : null;
    }
  }
  return copy;
}

function cloneCastlingRights(cr) {
  return cr ? { ...cr } : null;
}

// ============================================================
// 查找国王
// ============================================================
function findKing(b, color) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = b[r][c];
      if (p && p.type === "king" && p.color === color) return { row: r, col: c };
    }
  }
  return null;
}

// ============================================================
// 绘制棋盘
// ============================================================
function drawBoard(skipAnimPiece) {
  const w = canvas.width;
  const h = canvas.height;
  ctx.save();
  ctx.setTransform(zoomLevel, 0, 0, zoomLevel, panX, panY);

  // 棋盘外框
  ctx.fillStyle = "#2c1810";
  ctx.fillRect(0, 0, w, h);

  // 绘制格子
  const lightColor = "#f0d9b5";
  const darkColor = "#b58863";

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const d = toDisplay(r, c);
      const x = PADDING + d.col * CELL_SIZE;
      const y = PADDING + d.row * CELL_SIZE;
      const isLight = (r + c) % 2 === 0;
      ctx.fillStyle = isLight ? lightColor : darkColor;
      ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
    }
  }

  // 坐标标注
  ctx.fillStyle = "#f0d9b5";
  ctx.font = "bold 11px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const files = "abcdefgh";
  for (let c = 0; c < COLS; c++) {
    const dc = myColor === "black" ? 7 - c : c;
    const x = PADDING + c * CELL_SIZE + CELL_SIZE / 2;
    // 底部标注
    ctx.fillText(files[dc], x, PADDING + ROWS * CELL_SIZE + PADDING / 2);
    // 顶部行号
    const rankNum = myColor === "black" ? (c + 1) : (8 - c);
    const y = PADDING + c * CELL_SIZE + CELL_SIZE / 2;
    ctx.fillText(rankNum, PADDING / 2, y);
  }

  // 选中格子高亮
  if (selectedRow >= 0 && selectedCol >= 0) {
    const { x, y } = squareToPixel(selectedRow, selectedCol);
    ctx.fillStyle = "rgba(255, 255, 0, 0.45)";
    ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
  }

  // 最后一步走子标记
  if (lastMoveToRow >= 0 && lastMoveToCol >= 0) {
    const p1 = squareToPixel(lastMoveFromRow, lastMoveFromCol);
    const p2 = squareToPixel(lastMoveToRow, lastMoveToCol);
    ctx.fillStyle = "rgba(255, 255, 0, 0.3)";
    ctx.fillRect(p1.x, p1.y, CELL_SIZE, CELL_SIZE);
    ctx.fillRect(p2.x, p2.y, CELL_SIZE, CELL_SIZE);
  }

  // 将军高亮
  if (inCheck && myTurn && currentTurn === myInfo.username) {
    const king = findKing(board, myColor);
    if (king) {
      const { x, y } = squareToPixel(king.row, king.col);
      ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
      ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
    }
  }

  // 动画中跳过 from 位置的棋子
  const skipKey = (skipAnimPiece && animData)
    ? (animData.fromRow + "," + animData.fromCol) : null;

  // 绘制所有棋子
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (skipKey && r === animData.fromRow && c === animData.fromCol) continue;
      if (board[r][c]) {
        drawPiece(r, c, board[r][c]);
      }
    }
  }

  // 合法走法提示
  drawHints();

  ctx.restore();
  if (Math.abs(zoomLevel - 1) > 0.005) {
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(Math.round(zoomLevel * 100) + "%", 8, canvas.height - 8);
  }
}

function drawPiece(row, col, piece, scaleX) {
  if (scaleX === undefined) scaleX = 1;
  const { x, y } = squareToPixel(row, col);
  const cx = x + CELL_SIZE / 2;
  const cy = y + CELL_SIZE / 2;
  const fontSize = 38;

  ctx.save();
  ctx.translate(cx, cy);
  if (scaleX !== 1) ctx.scale(scaleX, 1);

  // 阴影
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.font = fontSize + "px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(PIECE_CHARS[piece.color][piece.type], 1, 2);

  // 棋子主体
  ctx.fillStyle = piece.color === "white" ? "#fff" : "#1a1a1a";
  ctx.fillText(PIECE_CHARS[piece.color][piece.type], 0, 0);

  ctx.restore();
}

function drawHints() {
  if (!myTurn || gameOver || validMoves.length === 0) return;
  for (const m of validMoves) {
    const { x, y } = squareToPixel(m.row, m.col);
    const cx = x + CELL_SIZE / 2;
    const cy = y + CELL_SIZE / 2;
    if (board[m.row][m.col]) {
      // 吃子提示：空心圆环
      ctx.beginPath();
      ctx.arc(cx, cy, CELL_SIZE / 2 - 3, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 3;
      ctx.stroke();
    } else {
      // 空位提示：实心圆点
      ctx.beginPath();
      ctx.arc(cx, cy, HINT_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fill();
    }
  }
}

// ============================================================
// 走法生成（不考虑将军）
// ============================================================

function getPawnRawMoves(b, row, col, color, epTarget) {
  const moves = [];
  const forward = color === "white" ? -1 : 1;
  const startRow = color === "white" ? 6 : 1;
  const promoRow = color === "white" ? 0 : 7;

  // 向前一步
  const fr = row + forward;
  if (inBounds(fr, col) && b[fr][col] === null) {
    if (fr === promoRow) {
      for (const pt of PROMOTION_TYPES) {
        moves.push({ row: fr, col: col, promotion: pt });
      }
    } else {
      moves.push({ row: fr, col: col });
    }
  }

  // 向前两步（起始行）
  const fr2 = row + 2 * forward;
  if (row === startRow && b[fr][col] === null && b[fr2][col] === null) {
    moves.push({ row: fr2, col: col, doublePush: true });
  }

  // 斜前方吃子
  for (const dc of [-1, 1]) {
    const fc = col + dc;
    if (!inBounds(fr, fc)) continue;
    if (isEnemyOnBoard(b, fr, fc, color)) {
      if (fr === promoRow) {
        for (const pt of PROMOTION_TYPES) {
          moves.push({ row: fr, col: fc, promotion: pt });
        }
      } else {
        moves.push({ row: fr, col: fc });
      }
    }
    // 吃过路兵
    if (epTarget && fr === epTarget.row && fc === epTarget.col) {
      moves.push({ row: fr, col: fc, enPassant: true });
    }
  }

  return moves;
}

function isEnemyOnBoard(b, r, c, color) {
  const p = b[r][c];
  return p && p.color !== color;
}

function getKnightRawMoves(b, row, col, color) {
  const moves = [];
  const offsets = [
    [-2, -1], [-2, 1], [-1, -2], [-1, 2],
    [1, -2], [1, 2], [2, -1], [2, 1],
  ];
  for (const [dr, dc] of offsets) {
    const nr = row + dr, nc = col + dc;
    if (inBounds(nr, nc) && !isOwnOnBoard(b, nr, nc, color)) {
      moves.push({ row: nr, col: nc });
    }
  }
  return moves;
}

function isOwnOnBoard(b, r, c, color) {
  const p = b[r][c];
  return p && p.color === color;
}

function getSlidingMoves(b, row, col, color, dirs) {
  const moves = [];
  for (const [dr, dc] of dirs) {
    let r = row + dr, c = col + dc;
    while (inBounds(r, c)) {
      if (b[r][c] === null) {
        moves.push({ row: r, col: c });
      } else {
        if (b[r][c].color !== color) moves.push({ row: r, col: c });
        break;
      }
      r += dr; c += dc;
    }
  }
  return moves;
}

function getBishopRawMoves(b, row, col, color) {
  return getSlidingMoves(b, row, col, color, [[-1, -1], [-1, 1], [1, -1], [1, 1]]);
}

function getRookRawMoves(b, row, col, color) {
  return getSlidingMoves(b, row, col, color, [[-1, 0], [1, 0], [0, -1], [0, 1]]);
}

function getQueenRawMoves(b, row, col, color) {
  return getSlidingMoves(b, row, col, color, [
    [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1],
  ]);
}

function getKingRawMoves(b, row, col, color, cr) {
  const moves = [];
  const dirs = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  for (const [dr, dc] of dirs) {
    const nr = row + dr, nc = col + dc;
    if (inBounds(nr, nc) && !isOwnOnBoard(b, nr, nc, color)) {
      moves.push({ row: nr, col: nc });
    }
  }

  // 王车易位
  if (!cr) return moves;
  const rowCheck = color === "white" ? 7 : 0;

  if (row === rowCheck && col === 4) {
    // 王翼易位 (kingside)
    const ksKey = color === "white" ? "whiteKingside" : "blackKingside";
    if (cr[ksKey] &&
        b[row][5] === null && b[row][6] === null &&
        b[row][7] && b[row][7].type === "rook" && b[row][7].color === color) {
      moves.push({ row: row, col: 6, castling: "kingside" });
    }
    // 后翼易位 (queenside)
    const qsKey = color === "white" ? "whiteQueenside" : "blackQueenside";
    if (cr[qsKey] &&
        b[row][1] === null && b[row][2] === null && b[row][3] === null &&
        b[row][0] && b[row][0].type === "rook" && b[row][0].color === color) {
      moves.push({ row: row, col: 2, castling: "queenside" });
    }
  }

  return moves;
}

function getRawMoves(b, row, col, cr, ep) {
  const piece = b[row][col];
  if (!piece) return [];
  switch (piece.type) {
    case "pawn":   return getPawnRawMoves(b, row, col, piece.color, ep);
    case "knight": return getKnightRawMoves(b, row, col, piece.color);
    case "bishop": return getBishopRawMoves(b, row, col, piece.color);
    case "rook":   return getRookRawMoves(b, row, col, piece.color);
    case "queen":  return getQueenRawMoves(b, row, col, piece.color);
    case "king":   return getKingRawMoves(b, row, col, piece.color, cr);
    default: return [];
  }
}

// ============================================================
// 将军检测
// ============================================================
function isSquareAttacked(b, row, col, attackerColor) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = b[r][c];
      if (!p || p.color !== attackerColor) continue;
      const moves = getRawMoves(b, r, c, null, null);
      for (const m of moves) {
        if (m.row === row && m.col === col) return true;
      }
    }
  }
  return false;
}

function isKingInCheck(b, color) {
  const king = findKing(b, color);
  if (!king) return false;
  return isSquareAttacked(b, king.row, king.col, color === "white" ? "black" : "white");
}

// ============================================================
// 走法合法性
// ============================================================
function makeMoveOnBoard(b, fromRow, fromCol, toRow, toCol, move) {
  const captured = b[toRow][toCol];
  const piece = b[fromRow][fromCol];
  b[toRow][toCol] = piece;
  b[fromRow][fromCol] = null;

  // 吃过路兵：移除被吃的兵
  if (move && move.enPassant) {
    const capturedRow = piece.color === "white" ? toRow + 1 : toRow - 1;
    b[capturedRow][toCol] = null;
  }

  // 王车易位：移动车
  if (move && move.castling) {
    const row = toRow;
    if (move.castling === "kingside") {
      b[row][5] = b[row][7];
      b[row][7] = null;
    } else {
      b[row][3] = b[row][0];
      b[row][0] = null;
    }
  }

  // 升变
  if (move && move.promotion) {
    b[toRow][toCol] = { type: move.promotion, color: piece.color };
  }

  return captured;
}

function unmakeMoveOnBoard(b, fromRow, fromCol, toRow, toCol, captured, move, piece) {
  b[fromRow][fromCol] = piece;
  b[toRow][toCol] = captured;

  // 恢复吃过路兵
  if (move && move.enPassant) {
    const capturedRow = piece.color === "white" ? toRow + 1 : toRow - 1;
    b[capturedRow][toCol] = { type: "pawn", color: piece.color === "white" ? "black" : "white" };
    b[toRow][toCol] = null;
  }

  // 恢复王车易位
  if (move && move.castling) {
    const row = toRow;
    if (move.castling === "kingside") {
      b[row][7] = b[row][5];
      b[row][5] = null;
    } else {
      b[row][0] = b[row][3];
      b[row][3] = null;
    }
  }
}

function isMoveLegal(fromRow, fromCol, toRow, toCol, move) {
  const b = board;
  const piece = b[fromRow][fromCol];
  const color = piece.color;

  // 王车易位额外检查：王不能经过被攻击的格子
  if (move && move.castling) {
    const row = fromRow;
    const enemyColor = color === "white" ? "black" : "white";
    if (move.castling === "kingside") {
      if (isSquareAttacked(b, row, 4, enemyColor) ||
          isSquareAttacked(b, row, 5, enemyColor) ||
          isSquareAttacked(b, row, 6, enemyColor)) return false;
    } else {
      if (isSquareAttacked(b, row, 4, enemyColor) ||
          isSquareAttacked(b, row, 3, enemyColor) ||
          isSquareAttacked(b, row, 2, enemyColor)) return false;
    }
  }

  const captured = makeMoveOnBoard(b, fromRow, fromCol, toRow, toCol, move);
  const legal = !isKingInCheck(b, color);
  unmakeMoveOnBoard(b, fromRow, fromCol, toRow, toCol, captured, move, piece);
  return legal;
}

function getLegalMoves(b, row, col) {
  const piece = b[row][col];
  if (!piece) return [];
  const raw = getRawMoves(b, row, col, castlingRights, enPassantTarget);
  return raw.filter(m => isMoveLegal(row, col, m.row, m.col, m));
}

// ============================================================
// 终局判定
// ============================================================
function hasLegalMovesOnBoard(b, cr, ep, color) {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = b[r][c];
      if (!p || p.color !== color) continue;
      const raw = getRawMoves(b, r, c, cr, ep);
      for (const m of raw) {
        // 简易合法性检查
        if (quickLegalCheck(b, r, c, m.row, m.col, m, color)) return true;
      }
    }
  }
  return false;
}

function quickLegalCheck(b, fromRow, fromCol, toRow, toCol, move, color) {
  // 王车易位快速检查
  if (move && move.castling) {
    const row = fromRow;
    const enemyColor = color === "white" ? "black" : "white";
    if (move.castling === "kingside") {
      if (isSquareAttacked(b, row, 4, enemyColor) ||
          isSquareAttacked(b, row, 5, enemyColor) ||
          isSquareAttacked(b, row, 6, enemyColor)) return false;
    } else {
      if (isSquareAttacked(b, row, 4, enemyColor) ||
          isSquareAttacked(b, row, 3, enemyColor) ||
          isSquareAttacked(b, row, 2, enemyColor)) return false;
    }
  }
  const piece = b[fromRow][fromCol];
  const captured = makeMoveOnBoard(b, fromRow, fromCol, toRow, toCol, move);
  const legal = !isKingInCheck(b, color);
  unmakeMoveOnBoard(b, fromRow, fromCol, toRow, toCol, captured, move, piece);
  return legal;
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
    animData = null;
    animStartTime = 0;
    if (animCallback) animCallback();
  }
}

function renderAnimationFrame(t) {
  drawBoard(true);
  if (animData) {
    // 绘制移动到目标位置的棋子（带缩放动画）
    const popT = Math.min(t / 0.7, 1);
    const scale = easeOutBack(popT);
    drawPiece(animData.toRow, animData.toCol, animData.piece, scale);
  }
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// ============================================================
// 执行走子（含动画）
// ============================================================
function executeMove(fromRow, fromCol, toRow, toCol, move, onDone) {
  const piece = board[fromRow][fromCol];
  const color = piece.color;

  // 记录被吃的棋子信息（用于悔棋）
  let captured = board[toRow][toCol];
  let capturedAtRow = toRow;
  let capturedAtCol = toCol;

  // 吃过路兵的特殊处理
  if (move && move.enPassant) {
    const capturedRow = color === "white" ? toRow + 1 : toRow - 1;
    captured = board[capturedRow][toCol];
    capturedAtRow = capturedRow;
    capturedAtCol = toCol;
  }

  // 保存王车易位信息
  const rookFromRow = move && move.castling ? fromRow : -1;
  const rookFromCol = move && move.castling
    ? (move.castling === "kingside" ? 7 : 0) : -1;
  const rookToRow = move && move.castling ? fromRow : -1;
  const rookToCol = move && move.castling
    ? (move.castling === "kingside" ? 5 : 3) : -1;

  // 保存升变信息
  const promotionType = move && move.promotion ? move.promotion : null;

  // 保存当前状态用于悔棋
  const prevCR = cloneCastlingRights(castlingRights);
  const prevEP = enPassantTarget ? { ...enPassantTarget } : null;

  // 计算特殊走法标记
  let special = null;
  if (move) {
    if (move.castling) special = move.castling;   // "kingside" | "queenside"
    else if (move.enPassant) special = "en_passant";
    else if (move.promotion) special = "promotion";
  }

  // 将 last 转移到 prev
  prevMove = lastMove;

  lastMove = {
    fromRow, fromCol, toRow, toCol,
    piece: { ...piece },
    captured: captured ? { ...captured } : null,
    capturedAtRow, capturedAtCol,
    special,
    rookFromRow, rookFromCol, rookToRow, rookToCol,
    promotionType,
    prevCR, prevEP,
    prevLastMoveFromRow: lastMoveFromRow,
    prevLastMoveFromCol: lastMoveFromCol,
    prevLastMoveToRow: lastMoveToRow,
    prevLastMoveToCol: lastMoveToCol,
  };

  lastMoveFromRow = fromRow;
  lastMoveFromCol = fromCol;
  lastMoveToRow = toRow;
  lastMoveToCol = toCol;

  // 更新棋盘状态
  makeMoveOnBoard(board, fromRow, fromCol, toRow, toCol, move);

  // 更新王车易位权限
  updateCastlingRights(piece, fromRow, fromCol);

  // 更新过路兵目标
  if (move && move.doublePush) {
    const epRow = color === "white" ? fromRow - 1 : fromRow + 1;
    enPassantTarget = { row: epRow, col: fromCol };
  } else {
    enPassantTarget = null;
  }

  clearSelection();

  // 落子弹出动画
  const displayPiece = move && move.promotion
    ? { type: move.promotion, color: color } : piece;
  isAnimating = true;
  animData = { fromRow, fromCol, toRow, toCol, piece: displayPiece, captured };
  animStartTime = performance.now();
  animCallback = () => {
    isAnimating = false;
    animData = null;
    animStartTime = 0;
    drawBoard();
    if (onDone) onDone();
  };
  requestAnimationFrame(animationLoop);
}

function updateCastlingRights(piece, fromRow, fromCol) {
  if (piece.type === "king") {
    if (piece.color === "white") {
      castlingRights.whiteKingside = false;
      castlingRights.whiteQueenside = false;
    } else {
      castlingRights.blackKingside = false;
      castlingRights.blackQueenside = false;
    }
  }
  if (piece.type === "rook") {
    if (piece.color === "white") {
      if (fromRow === 7 && fromCol === 7) castlingRights.whiteKingside = false;
      if (fromRow === 7 && fromCol === 0) castlingRights.whiteQueenside = false;
    } else {
      if (fromRow === 0 && fromCol === 7) castlingRights.blackKingside = false;
      if (fromRow === 0 && fromCol === 0) castlingRights.blackQueenside = false;
    }
  }
  // 如果车被吃（目标格有对方的车）
  // 这个在 executeMove 之后检查
  // 简化处理：在更新棋盘后检查目标格是否吃掉了车
  checkRookCapture();
}

function checkRookCapture() {
  // 白方车被吃
  if (board[7][7] === null || board[7][7].type !== "rook" || board[7][7].color !== "white") {
    castlingRights.whiteKingside = false;
  }
  if (board[7][0] === null || board[7][0].type !== "rook" || board[7][0].color !== "white") {
    castlingRights.whiteQueenside = false;
  }
  // 黑方车被吃
  if (board[0][7] === null || board[0][7].type !== "rook" || board[0][7].color !== "black") {
    castlingRights.blackKingside = false;
  }
  if (board[0][0] === null || board[0][0].type !== "rook" || board[0][0].color !== "black") {
    castlingRights.blackQueenside = false;
  }
}

// ============================================================
// 走子后处理
// ============================================================
function afterLocalMove() {
  const opponentColor = myColor === "white" ? "black" : "white";

  inCheck = isKingInCheck(board, opponentColor);

  if (!hasLegalMovesOnBoard(board, castlingRights, enPassantTarget, opponentColor)) {
    gameOver = true;
    myTurn = false;
    stopMoveTimer();
    hideTurnHighlight();
    if (isKingInCheck(board, opponentColor)) {
      document.getElementById("statusText").textContent = "将杀！你赢了！";
    } else {
      document.getElementById("statusText").textContent = "逼和！平局！";
      sendToParent({ type: "game_over", gameName: thisGameName, result: "draw", isDraw: true });
      return;
    }
    document.getElementById("btnPlayAgain").classList.add("show");
    document.getElementById("btnSurrender").classList.remove("show");
    document.getElementById("btnNudge").classList.remove("show");
    document.getElementById("btnUndo").classList.remove("show");
    sendToParent({ type: "game_over", gameName: thisGameName, result: "win", isDraw: false });
    return;
  }

  myTurn = false;
  currentTurn = opponentInfo.username;
  nudgeSent = false;
  document.getElementById("btnNudge").classList.add("show");
  document.getElementById("btnSurrender").classList.add("show");
  document.getElementById("btnUndo").classList.add("show");
  updateTurnDisplay();
  startMoveTimer();
  const checkMsg = inCheck ? "将军！" : "";
  document.getElementById("statusText").textContent = checkMsg + "等待对手应着...";
}

// ============================================================
// 处理棋盘点击
// ============================================================
function onCanvasClick(e) {
  if (!gameStarted || gameOver || !myTurn || isAnimating) return;
  if (pendingPromotion) return;
  if (_dragMoved) { _dragMoved = false; return; }

  const pt = canvasToBoard(e.clientX, e.clientY);
  const { row, col } = pixelToSquare(pt.x, pt.y);
  if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;

  const clickedPiece = board[row][col];

  // Case 1: 点击己方棋子 → 选中
  if (clickedPiece && clickedPiece.color === myColor) {
    if (row === selectedRow && col === selectedCol) {
      clearSelection();
    } else {
      selectedRow = row;
      selectedCol = col;
      validMoves = getLegalMoves(board, row, col);
    }
    drawBoard();
    return;
  }

  // Case 2: 点击合法目标位置 → 走子
  if (selectedRow >= 0) {
    const targetMove = validMoves.find(m => m.row === row && m.col === col);
    if (targetMove) {
      // 升变需要先选择棋子
      if (targetMove.promotion && PROMOTION_TYPES.includes(targetMove.promotion)) {
        stopMoveTimer();
        pendingPromotion = { fromRow: selectedRow, fromCol: selectedCol, toRow: row, toCol: col };
        showPromotionDialog();
        return;
      }

      performPlayerMove(selectedRow, selectedCol, row, col, targetMove);
      return;
    }
  }

  // Case 3: 点击其他地方 → 取消选中
  if (selectedRow >= 0) {
    clearSelection();
    drawBoard();
  }
}

function performPlayerMove(fromRow, fromCol, toRow, toCol, move) {
  stopMoveTimer();
  executeMove(fromRow, fromCol, toRow, toCol, move, () => {
    afterLocalMove();
    sendToParent({
      type: "game_action",
      action: "place_stone",
      data: {
        fromRow, fromCol, toRow, toCol,
        color: myColor,
        move: move ? {
          castling: move.castling || undefined,
          enPassant: move.enPassant || undefined,
          promotion: move.promotion || undefined,
          doublePush: move.doublePush || undefined,
        } : undefined,
      },
    });
  });
}

function clearSelection() {
  selectedRow = -1;
  selectedCol = -1;
  validMoves = [];
}

// ============================================================
// 升变对话框
// ============================================================
function showPromotionDialog() {
  const overlay = document.getElementById("promotionOverlay");
  const choices = document.getElementById("promotionChoices");
  choices.innerHTML = "";

  const color = myColor;
  for (const pt of PROMOTION_TYPES) {
    const btn = document.createElement("button");
    btn.textContent = PIECE_CHARS[color][pt];
    btn.addEventListener("click", () => {
      overlay.classList.add("hidden");
      const p = pendingPromotion;
      pendingPromotion = null;
      const move = { row: p.toRow, col: p.toCol, promotion: pt };
      performPlayerMove(p.fromRow, p.fromCol, p.toRow, p.toCol, move);
    });
    choices.appendChild(btn);
  }

  overlay.classList.remove("hidden");
}

// ============================================================
// 处理来自大厅的消息
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

function handleGameStart(msg) {
  resetBoard();
  drawBoard();
  gameStarted = true;
  gameOver = false;
  hideWaiting();
  document.getElementById("btnPlayAgain").classList.remove("show");
  document.getElementById("btnSurrender").classList.add("show");
  document.getElementById("btnNudge").classList.remove("show");
  document.getElementById("btnUndo").classList.remove("show");

  for (const p of msg.players) {
    if (p.username !== myInfo.username) {
      opponentInfo = p;
    }
  }

  // 白方先手
  if (msg.firstTurn === myInfo.username) {
    myColor = "white";
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
    document.getElementById("statusText").textContent = "轮到你了（白方）";
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
    const { fromRow, fromCol, toRow, toCol, move } = msg.data;

    const moveObj = (move && (move.castling || move.enPassant || move.promotion || move.doublePush))
      ? { castling: move.castling, enPassant: move.enPassant, promotion: move.promotion, doublePush: move.doublePush }
      : null;

    executeMove(fromRow, fromCol, toRow, toCol, moveObj, () => {
      inCheck = isKingInCheck(board, myColor);

      if (!hasLegalMovesOnBoard(board, castlingRights, enPassantTarget, myColor)) {
        gameOver = true;
        myTurn = false;
        hideTurnHighlight();
        if (isKingInCheck(board, myColor)) {
          document.getElementById("statusText").textContent = "将杀！你输了！";
        } else {
          document.getElementById("statusText").textContent = "逼和！平局！";
          sendToParent({ type: "game_over", gameName: thisGameName, result: "draw", isDraw: true });
          return;
        }
        document.getElementById("btnPlayAgain").classList.add("show");
        document.getElementById("btnSurrender").classList.remove("show");
        document.getElementById("btnNudge").classList.remove("show");
        document.getElementById("btnUndo").classList.remove("show");
        sendToParent({ type: "game_over", gameName: thisGameName, result: "loss", isDraw: false });
        return;
      }

      myTurn = true;
      currentTurn = myInfo.username;
      nudgeSent = false;
      document.getElementById("btnNudge").classList.remove("show");
      document.getElementById("btnUndo").classList.add("show");
      updateTurnDisplay();
      startMoveTimer();
      const checkMsg = isKingInCheck(board, myColor) ? "将军！" : "";
      const colorName = myColor === "white" ? "白方" : "黑方";
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
    document.getElementById("btnUndo").classList.remove("show");

  } else if (msg.action === "nudge") {
    showNudgeToast();
    const el = document.getElementById("statusText");
    el.textContent = "对手提醒你落子";
    el.style.color = "#f1c40f";
    setTimeout(() => {
      el.style.color = "";
      if (!gameOver && myTurn) {
        const colorName = myColor === "white" ? "白方" : "黑方";
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
    document.getElementById("btnUndo").classList.remove("show");

  } else if (msg.action === "request_undo") {
    stopMoveTimer();
    pendingUndoTwoStones = msg.data && msg.data.undoTwoStones;
    document.getElementById("undoOverlay").classList.remove("hidden");
  } else if (msg.action === "undo_accepted") {
    const undoTwoStones = msg.data && msg.data.undoTwoStones;
    performUndo(undoTwoStones);
  } else if (msg.action === "undo_rejected") {
    pendingUndoRequest = false;
    document.getElementById("btnUndo").classList.add("show");
    document.getElementById("statusText").textContent = "对手拒绝了悔棋请求";
    startMoveTimer();
    setTimeout(() => {
      if (!gameOver && myTurn) {
        const colorName = myColor === "white" ? "白方" : "黑方";
        document.getElementById("statusText").textContent = "轮到你了（" + colorName + "）";
      }
    }, 2000);

  } else if (msg.action === "player_left") {
    stopMoveTimer();
    gameStarted = false;
    gameOver = true;
    showWaiting("对手离开了房间");
    document.getElementById("statusText").textContent = "对手断线";
    document.getElementById("btnPlayAgain").classList.remove("show");
    document.getElementById("btnSurrender").classList.remove("show");
    document.getElementById("btnNudge").classList.remove("show");
    document.getElementById("btnUndo").classList.remove("show");
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
  drawBoard();
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
    (myColor === "white" ? "stone-white" : "stone-black");

  if (opponentInfo) {
    document.getElementById("opAvatar").textContent = opponentInfo.avatarText;
    document.getElementById("opAvatar").style.borderColor = opponentInfo.borderColor;
    document.getElementById("opAvatar").style.color = opponentInfo.textColor;
    document.getElementById("opName").textContent = opponentInfo.username;
    const opStone = document.getElementById("opStone");
    opStone.className = "player-stone " +
      (myColor === "white" ? "stone-black" : "stone-white");
  }
}

// ============================================================
// 等待界面
// ============================================================
function showWaiting(text) {
  document.getElementById("waitingText").textContent = text;
  document.getElementById("waitingOverlay").classList.remove("hidden");
  document.getElementById("undoOverlay").classList.add("hidden");
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
  document.getElementById("btnUndo").classList.remove("show");
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
  document.getElementById("btnUndo").classList.remove("show");
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
  if (!myTurn) return;
  gameOver = true;
  myTurn = false;
  hideTurnHighlight();
  document.getElementById("statusText").textContent = "超时，你输了！";
  document.getElementById("btnPlayAgain").classList.add("show");
  document.getElementById("btnSurrender").classList.remove("show");
  document.getElementById("btnNudge").classList.remove("show");
  document.getElementById("btnUndo").classList.remove("show");
  sendToParent({ type: "game_action", action: "timeout", data: {} });
  sendToParent({ type: "game_over", gameName: thisGameName, result: "loss", isDraw: false });
}

// ============================================================
// 悔棋
// ============================================================
function requestUndo() {
  if (gameOver || pendingUndoRequest || !lastMove) return;
  if (myTurn && !prevMove) return;
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
    // 撤2步：对方最后1步 + 己方上1步
    if (lastMove) {
      undoOneMove(lastMove);
    }
    if (prevMove) {
      undoOneMove(prevMove);
    }
    lastMove = null;
    prevMove = null;
    lastMoveFromRow = -1;
    lastMoveFromCol = -1;
    lastMoveToRow = -1;
    lastMoveToCol = -1;
  } else {
    // 撤1步：己方最后1步
    if (lastMove) {
      undoOneMove(lastMove);
    }
    lastMove = prevMove;
    prevMove = null;
    if (lastMove) {
      lastMoveFromRow = lastMove.fromRow;
      lastMoveFromCol = lastMove.fromCol;
      lastMoveToRow = lastMove.toRow;
      lastMoveToCol = lastMove.toCol;
    } else {
      lastMoveFromRow = -1;
      lastMoveFromCol = -1;
      lastMoveToRow = -1;
      lastMoveToCol = -1;
    }
    myTurn = !myTurn;
  }

  inCheck = myTurn ? isKingInCheck(board, myColor) : false;
  clearSelection();
  drawBoard();
  currentTurn = myTurn ? myInfo.username : opponentInfo.username;
  nudgeSent = false;
  pendingUndoRequest = false;
  stopMoveTimer();
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

function undoOneMove(m) {
  // 恢复棋子位置
  board[m.fromRow][m.fromCol] = m.piece;
  board[m.toRow][m.toCol] = m.captured;

  // 恢复吃过路兵
  if (m.special === "en_passant") {
    board[m.capturedAtRow][m.capturedAtCol] = m.captured;
    board[m.toRow][m.toCol] = null;
  }

  // 恢复王车易位
  if (m.special === "kingside" || m.special === "queenside") {
    board[m.rookFromRow][m.rookFromCol] = { type: "rook", color: m.piece.color };
    board[m.rookToRow][m.rookToCol] = null;
  }

  // 恢复升变
  if (m.special === "promotion") {
    board[m.fromRow][m.fromCol] = { type: "pawn", color: m.piece.color };
  }

  // 恢复王车易位权限和过路兵目标
  castlingRights = m.prevCR || {
    whiteKingside: true, whiteQueenside: true,
    blackKingside: true, blackQueenside: true,
  };
  enPassantTarget = m.prevEP;

  // 恢复 last 标记
  lastMoveFromRow = m.prevLastMoveFromRow;
  lastMoveFromCol = m.prevLastMoveFromCol;
  lastMoveToRow = m.prevLastMoveToRow;
  lastMoveToCol = m.prevLastMoveToCol;
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

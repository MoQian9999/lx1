// ============================================================
// 狼人杀 - 服务端插件
// 通过 server.js 的游戏插件机制自动加载
// ============================================================

// ============================================================
// 角色定义
// ============================================================
const ROLE_DEFS = {
  // ===== 狼人阵营 =====
  werewolf: {
    id: "werewolf", name: "狼人", team: "werewolf", emoji: "🐺",
    nightPriority: 10, isStandard: true, countAsWolf: true,
    skillDesc: "每晚与队友共同选择一名玩家击杀。白天可选择自爆(直接进入黑夜,跳过投票)。",
    nightAction: false, // 狼人集体刀人通过 ww_wolf_kill 处理
    abilities: [],
  },
  white_wolf_king: {
    id: "white_wolf_king", name: "白狼王", team: "werewolf", emoji: "👑",
    nightPriority: 10, isStandard: false, countAsWolf: true,
    skillDesc: "白天发言阶段可自爆，自爆时可带走一名玩家。",
    nightAction: false,
    abilities: [{ name: "自爆带人", trigger: "day_speech" }],
  },
  wolf_beauty: {
    id: "wolf_beauty", name: "狼美人", team: "werewolf", emoji: "💋",
    nightPriority: 10, isStandard: false, countAsWolf: true,
    skillDesc: "每晚可魅惑一名玩家，自身出局时被魅惑者随之殉情。不可连续两晚魅惑同一人。",
    nightAction: true, targetRequired: true, targetType: "any_alive",
    abilities: [{ name: "魅惑", night: true, cannotRepeat: true }],
  },
  wolf_king: {
    id: "wolf_king", name: "狼王", team: "werewolf", emoji: "⚔️",
    nightPriority: 10, isStandard: false, countAsWolf: true,
    skillDesc: "出局后可开枪带走一名玩家。被毒杀或殉情时不能开枪。",
    nightAction: false,
    abilities: [{ name: "死亡开枪", trigger: "on_death", except: ["poison", "love_death"] }],
  },
  hidden_wolf: {
    id: "hidden_wolf", name: "隐狼", team: "werewolf", emoji: "🫥",
    nightPriority: 10, isStandard: false, countAsWolf: true,
    skillDesc: "被预言家查验时显示为好人。知道狼队友但不参与夜间刀人。所有狼队友出局后可获得刀人技能。",
    nightAction: false, appearsAs: "villager",
    abilities: [],
  },
  gargoyle: {
    id: "gargoyle", name: "石像鬼", team: "werewolf", emoji: "🗿",
    nightPriority: 5, isStandard: false, countAsWolf: true,
    skillDesc: "不能自爆。每晚可查验一名玩家的具体身份牌。不参与夜间刀人，不与狼队见面。",
    nightAction: true, targetRequired: true, targetType: "any_alive",
    abilities: [{ name: "查验身份", night: true, resultType: "exact_role" }],
  },
  demon: {
    id: "demon", name: "恶魔", team: "werewolf", emoji: "👹",
    nightPriority: 10, isStandard: false, countAsWolf: true,
    skillDesc: "不会死于夜晚。每晚可查验一名玩家是否为神职。被预言家查验时预言家死亡。",
    nightAction: true, targetRequired: true, targetType: "any_alive", nightImmune: true,
    abilities: [{ name: "查验神职", night: true, resultType: "is_god" }],
  },
  blood_moon: {
    id: "blood_moon", name: "血月使徒", team: "werewolf", emoji: "🌑",
    nightPriority: 10, isStandard: false, countAsWolf: true,
    skillDesc: "自爆后不会立即死亡，下一夜结束时才死亡。自爆后好人技能对其同伙无效。",
    nightAction: false,
    abilities: [],
  },

  // ===== 好人阵营-神职 =====
  seer: {
    id: "seer", name: "预言家", team: "villager", emoji: "🔮",
    nightPriority: 20, isStandard: true, isGod: true,
    skillDesc: "每晚可查验一名玩家身份，获得该玩家阵营(好人/狼人)。",
    nightAction: true, targetRequired: true, targetType: "any_alive",
    abilities: [{ name: "查验", night: true, resultType: "alignment" }],
  },
  witch: {
    id: "witch", name: "女巫", team: "villager", emoji: "🧪",
    nightPriority: 30, isStandard: true, isGod: true,
    skillDesc: "拥有解药和毒药各一瓶。解药可救活被刀的玩家，毒药可毒杀一名玩家。每瓶药整局只能用一次，同一晚只能用一瓶。",
    nightAction: true, targetRequired: true, targetType: "any_alive",
    abilities: [
      { name: "解药", night: true, maxUses: 1, resultType: "save" },
      { name: "毒药", night: true, maxUses: 1, resultType: "kill" },
    ],
  },
  hunter: {
    id: "hunter", name: "猎人", team: "villager", emoji: "🏹",
    nightPriority: 99, isStandard: true, isGod: true,
    skillDesc: "出局时可开枪带走一名玩家。被女巫毒死时不能开枪。",
    nightAction: false,
    abilities: [{ name: "死亡开枪", trigger: "on_death", except: ["poison"] }],
  },
  guard: {
    id: "guard", name: "守卫", team: "villager", emoji: "🛡️",
    nightPriority: 40, isStandard: true, isGod: true,
    skillDesc: "每晚可守护一名玩家(可自守)，被守护者当夜免疫狼人刀。不能连续两晚守护同一人。同守同救(奶穿)会导致该玩家死亡。",
    nightAction: true, targetRequired: true, targetType: "any_alive",
    abilities: [{ name: "守护", night: true, cannotRepeatTarget: true, allowSelf: true }],
  },
  idiot: {
    id: "idiot", name: "白痴", team: "villager", emoji: "🤡",
    nightPriority: 99, isStandard: true, isGod: true,
    skillDesc: "白天被投票放逐时可翻牌自证免死。翻牌后留在场上但失去投票权。",
    nightAction: false,
    abilities: [{ name: "翻牌自证", trigger: "on_voted_out" }],
  },
  knight: {
    id: "knight", name: "骑士", team: "villager", emoji: "🐴",
    nightPriority: 99, isStandard: false, isGod: true,
    skillDesc: "白天放逐投票前可翻牌决斗一名玩家：目标为狼人则狼人死亡，目标为好人则骑士死亡。整局仅一次。",
    nightAction: false,
    abilities: [{ name: "决斗", trigger: "day_before_vote", maxUses: 1 }],
  },
  bear: {
    id: "bear", name: "熊", team: "villager", emoji: "🐻",
    nightPriority: 99, isStandard: false, isGod: true,
    skillDesc: "天亮时若左右相邻存活玩家中有狼人则'咆哮'，否则不咆哮。死亡或被冰冻则无法咆哮。",
    nightAction: false,
    abilities: [{ name: "咆哮", trigger: "dawn" }],
  },
  gravekeeper: {
    id: "gravekeeper", name: "守墓人", team: "villager", emoji: "🪦",
    nightPriority: 99, isStandard: false, isGod: true,
    skillDesc: "天亮后可得知上一轮被投票放逐玩家的身份阵营。",
    nightAction: false,
    abilities: [{ name: "通灵", trigger: "dawn" }],
  },
  demon_hunter: {
    id: "demon_hunter", name: "猎魔人", team: "villager", emoji: "🗡️",
    nightPriority: 50, isStandard: false, isGod: true,
    skillDesc: "从第二夜起每夜可猎杀一名玩家。目标是狼人则狼人死亡，目标是好人则猎魔人死亡。",
    nightAction: true, targetRequired: true, targetType: "any_alive",
    abilities: [{ name: "猎杀", night: true, minRound: 2 }],
  },
  miracle_merchant: {
    id: "miracle_merchant", name: "奇迹商人", team: "villager", emoji: "💎",
    nightPriority: 35, isStandard: false, isGod: true,
    skillDesc: "首夜可给予一名玩家一个技能(验人/毒药/守护选一)。若给到狼人则狼人暴毙。整局仅一次。",
    nightAction: true, targetRequired: true, targetType: "any_alive",
    abilities: [{ name: "送技能", night: true, maxUses: 1, minRound: 1, maxRound: 1 }],
  },
  dreamweaver: {
    id: "dreamweaver", name: "摄梦人", team: "villager", emoji: "💤",
    nightPriority: 45, isStandard: false, isGod: true,
    skillDesc: "每晚选一名玩家梦游，梦游者当夜免疫夜间伤害。摄梦人死亡时梦游者一同死亡。连续两晚选同一目标则该目标死亡。",
    nightAction: true, targetRequired: true, targetType: "any_alive",
    abilities: [{ name: "摄梦", night: true }],
  },
  penguin: {
    id: "penguin", name: "企鹅", team: "villager", emoji: "🐧",
    nightPriority: 45, isStandard: false, isGod: true,
    skillDesc: "每晚可冰冻一名玩家，被冰冻者当晚无法发动任何技能。不可连续两晚冰冻同一人。",
    nightAction: true, targetRequired: true, targetType: "any_alive",
    abilities: [{ name: "冰冻", night: true, cannotRepeatTarget: true }],
  },
  crow: {
    id: "crow", name: "乌鸦", team: "villager", emoji: "🐦‍⬛",
    nightPriority: 55, isStandard: false, isGod: true,
    skillDesc: "每晚可在一名玩家头上插旗，被插旗者在白天投票时会多一票诽谤票。",
    nightAction: true, targetRequired: true, targetType: "any_alive",
    abilities: [{ name: "插旗", night: true }],
  },

  // ===== 好人阵营-平民 =====
  villager: {
    id: "villager", name: "村民", team: "villager", emoji: "👨‍🌾",
    nightPriority: 99, isStandard: true,
    skillDesc: "无特殊技能，依靠白天发言和推理找出狼人并投票放逐。",
    nightAction: false,
    abilities: [],
  },

  // ===== 第三方/可变阵营 =====
  cupid: {
    id: "cupid", name: "丘比特", team: "third_party", emoji: "💘",
    nightPriority: 5, isStandard: false,
    skillDesc: "首夜指定两名玩家成为情侣。同阵营则情侣保持原阵营，异阵营则情侣组成第三方阵营(共同存活到最后获胜)。",
    nightAction: true, targetRequired: true, targetType: "any_two_different",
    abilities: [{ name: "连接情侣", night: true, minRound: 1, maxRound: 1 }],
  },
  thief: {
    id: "thief", name: "盗贼", team: "villager", emoji: "🎭",
    nightPriority: 1, isStandard: false,
    skillDesc: "开局从两张多余身份牌中选择一张，另一张作废。若有狼人必须选狼人。",
    nightAction: false,
    abilities: [],
  },
  wild_child: {
    id: "wild_child", name: "野孩子", team: "villager", emoji: "🌱",
    nightPriority: 99, isStandard: false,
    skillDesc: "首日选择一名玩家为榜样。榜样出局后野孩子在下一夜变为狼人。",
    nightAction: false,
    abilities: [],
  },
  bomber: {
    id: "bomber", name: "炸弹人", team: "third_party", emoji: "💣",
    nightPriority: 99, isStandard: false,
    skillDesc: "白天被投票放逐后，所有投他票的玩家全部死亡。",
    nightAction: false,
    abilities: [],
  },
};

// 获取所有角色ID列表
const ALL_ROLE_IDS = Object.keys(ROLE_DEFS);

// ============================================================
// 默认角色配置(按总人数)
// ============================================================
const DEFAULT_ROLE_SETUPS = {
  6:  { werewolf: 2, villager: 2, seer: 1, witch: 1 },
  7:  { werewolf: 2, villager: 3, seer: 1, witch: 1 },
  8:  { werewolf: 3, villager: 2, seer: 1, witch: 1, hunter: 1 },
  9:  { werewolf: 3, villager: 3, seer: 1, witch: 1, hunter: 1 },
  10: { werewolf: 3, villager: 3, seer: 1, witch: 1, hunter: 1, guard: 1 },
  11: { werewolf: 4, villager: 3, seer: 1, witch: 1, hunter: 1, guard: 1 },
  12: { werewolf: 4, villager: 4, seer: 1, witch: 1, hunter: 1, guard: 1 },
};
for (let n = 13; n <= 18; n++) {
  DEFAULT_ROLE_SETUPS[n] = { werewolf: 4 + Math.floor((n - 12) / 3), villager: n - 4 - Math.floor((n - 12) / 3) - 4, seer: 1, witch: 1, hunter: 1, guard: 1 };
}

// ============================================================
// 阶段时长配置 (秒)
// ============================================================
const PHASE_DURATIONS = {
  SHERIFF_ELECTION: 30,
  NIGHT_WEREWOLF: 40,
  NIGHT_SEER: 25,
  NIGHT_WITCH: 25,
  NIGHT_GUARD: 20,
  NIGHT_OTHER: 20,
  DAWN: 10,
  LAST_WORDS: 30,
  DAY_SPEECH: 300,
  DAY_SPEECH_PER: 60,
  DAY_VOTE: 40,
  DUSK: 5,
};

// ============================================================
// 工具函数
// ============================================================
function getRoleDef(roleId) {
  return ROLE_DEFS[roleId] || null;
}

function getPlayerByUsername(room, username) {
  if (!room.ww || !room.ww.players) return null;
  return room.ww.players.find(p => p.username === username);
}

function getPlayerBySeat(room, seat) {
  if (!room.ww || !room.ww.players) return null;
  return room.ww.players.find(p => p.seatNumber === seat);
}

function getAlivePlayers(room) {
  if (!room.ww || !room.ww.players) return [];
  return room.ww.players.filter(p => p.alive);
}

function getAliveWolves(room) {
  return getAlivePlayers(room).filter(p => {
    const def = getRoleDef(p.role);
    return def && def.countAsWolf;
  });
}

function getAliveVillagers(room) {
  return getAlivePlayers(room).filter(p => {
    const def = getRoleDef(p.role);
    return def && def.team === "villager";
  });
}

function wwSendTo(username, msg, ctx) {
  const u = ctx.users.get(username);
  if (u && u.ws && u.ws.readyState === 1) {
    u.ws.send(JSON.stringify(msg));
  }
}

function wwBroadcast(room, msg, ctx, filter) {
  const data = JSON.stringify(msg);
  for (const player of room.players) {
    if (filter && !filter(player)) continue;
    const u = ctx.users.get(player.username);
    if (u && u.ws && u.ws.readyState === 1) {
      u.ws.send(data);
    }
  }
}

// ============================================================
// 阶段状态机
// ============================================================
function getNightOrder(room) {
  const ww = room.ww;
  const rolesInPlay = new Set(ww.players.map(p => p.role));
  const phases = [];

  // 收集所有需要夜间行动的角色
  const nightRoles = [];
  for (const roleId of rolesInPlay) {
    const def = getRoleDef(roleId);
    if (def && def.nightAction && def.nightPriority < 99) {
      nightRoles.push({ roleId, priority: def.nightPriority });
    }
  }
  nightRoles.sort((a, b) => a.priority - b.priority);

  // 优先处理狼人刀人
  if (rolesInPlay.has("werewolf") || [...rolesInPlay].some(r => getRoleDef(r) && getRoleDef(r).countAsWolf)) {
    phases.push("NIGHT_WEREWOLF");
  }

  for (const nr of nightRoles) {
    if (nr.roleId === "werewolf") continue; // 已处理
    if (nr.roleId === "cupid" && ww.round > 0) continue; // 丘比特仅首夜
    phases.push("NIGHT_" + nr.roleId.toUpperCase());
  }

  return phases;
}

function clearPhaseTimer(room) {
  if (room.ww && room.ww.phaseTimer) {
    clearTimeout(room.ww.phaseTimer);
    room.ww.phaseTimer = null;
  }
}

function advancePhase(room, nextPhase, ctx) {
  const ww = room.ww;
  clearPhaseTimer(room);

  // 结算夜间行动（仅在最后一个夜间阶段结束时统一结算）
  if (ww.phase && ww.phase.startsWith("NIGHT_") && nextPhase === "DAWN") {
    resolveNightActions(room, ctx);
  }

  // 检查胜负
  const result = checkWinConditions(room);
  if (result) {
    endGame(room, result, ctx);
    return;
  }

  ww.phase = nextPhase;
  const durationKey = nextPhase.startsWith("NIGHT_")
    ? (nextPhase === "NIGHT_WEREWOLF" ? "NIGHT_WEREWOLF"
      : nextPhase === "NIGHT_SEER" ? "NIGHT_SEER"
      : nextPhase === "NIGHT_WITCH" ? "NIGHT_WITCH"
      : nextPhase === "NIGHT_GUARD" ? "NIGHT_GUARD"
      : "NIGHT_OTHER")
    : nextPhase;
  const duration = (PHASE_DURATIONS[durationKey] || 30) * 1000;
  ww.phaseEndTime = Date.now() + duration;

  // 广播阶段更新
  const phaseData = getPhasePublicData(room, nextPhase);
  wwBroadcast(room, { type: "ww_phase_update", phase: nextPhase, phaseEndTime: ww.phaseEndTime, round: ww.round, phaseData }, ctx);

  // 阶段语音文字
  const voiceText = getVoiceText(nextPhase, room, ww.judgeSeat ? "judge" : "all");
  const voiceTarget = ww.judgeSeat ? ww.judgeSeat : "all";
  if (voiceTarget === "all") {
    wwBroadcast(room, { type: "ww_voice", text: voiceText }, ctx);
  } else {
    wwSendTo(voiceTarget, { type: "ww_voice", text: voiceText }, ctx);
  }

  // 女巫专属信息：被刀玩家
  if (nextPhase === "NIGHT_WITCH" && ww.wolfKillTarget !== null) {
    const witchPlayer = getAlivePlayers(room).find(p => p.role === "witch");
    if (witchPlayer) {
      wwSendTo(witchPlayer.username, { type: "ww_witch_info", killTarget: ww.wolfKillTarget }, ctx);
    }
  }

  // 设置下一阶段定时器
  const next = getNextPhase(room, nextPhase);
  if (next) {
    ww.phaseTimer = setTimeout(() => advancePhase(room, next, ctx), duration);
  }

  // DAY_SPEECH 初始化发言顺序
  if (nextPhase === "DAY_SPEECH") {
    initSpeech(room, ctx);
  }
}

function getNextPhase(room, currentPhase) {
  const ww = room.ww;
  const nightPhases = getNightOrder(room);

  if (currentPhase === "WAITING") return null;
  if (currentPhase === "SHERIFF_ELECTION") return nightPhases.length > 0 ? nightPhases[0] : "DAWN";
  if (currentPhase === "DAWN") return "DAY_SPEECH";
  if (currentPhase === "DAY_SPEECH") return "DAY_VOTE";
  if (currentPhase === "DAY_VOTE") return "DUSK";
  if (currentPhase === "DUSK") {
    ww.round++;
    return nightPhases.length > 0 ? nightPhases[0] : "DAWN";
  }

  // 夜间阶段链
  const idx = nightPhases.indexOf(currentPhase);
  if (idx >= 0 && idx < nightPhases.length - 1) return nightPhases[idx + 1];
  if (idx === nightPhases.length - 1 || idx >= 0) return "DAWN";

  return "DAWN";
}

function getPhasePublicData(room, phase) {
  const ww = room.ww;
  const base = {
    seats: ww.seats.map((s, i) => s ? {
      seatNumber: i,
      username: s.username,
      avatarText: s.avatarText,
      textColor: s.textColor,
      borderColor: s.borderColor,
      alive: s.alive,
      isAI: s.isAI,
    } : null),
    judgeSeat: ww.judgeSeat,
    sheriffSeat: ww.sheriffSeat,
    round: ww.round,
    speechOrder: ww.speechOrder || [],
    currentSpeaker: ww.currentSpeaker,
  };

  if (phase === "DAWN") {
    base.deadSeats = ww.nightDeaths || [];
  }

  return base;
}

function getVoiceText(phase, room, target) {
  const ww = room.ww;
  const isJudgeOnly = target === "judge";
  switch (phase) {
    case "SHERIFF_ELECTION": return "现在开始警长竞选，想要竞选警长的玩家请举手。";
    case "NIGHT_WEREWOLF": return "天黑请闭眼。狼人请睁眼，请选择今晚要击杀的目标。";
    case "NIGHT_SEER": return "预言家请睁眼，请选择要查验的玩家。";
    case "NIGHT_WITCH": {
      // 无法官时不对全体播放死亡信息（通过 ww_witch_info 单独告知女巫）
      const killed = ww.wolfKillTarget !== null ? ww.wolfKillTarget + "号" : "无人";
      if (isJudgeOnly) return "女巫请睁眼。今晚" + killed + "被杀。你要使用解药吗？你要使用毒药吗？";
      return "女巫请睁眼。你要使用解药吗？你要使用毒药吗？";
    }
    case "NIGHT_GUARD": return "守卫请睁眼，请选择要守护的玩家。";
    case "DAWN": {
      const deaths = ww.nightDeaths || [];
      if (deaths.length === 0) return "天亮了，昨晚是平安夜。";
      return "天亮了，昨晚" + deaths.map(d => d + "号").join("、") + "玩家死亡。";
    }
    case "DAY_SPEECH": return "现在进入发言阶段。";
    case "DAY_VOTE": return "发言结束，现在开始放逐投票。";
    default: return "";
  }
}

// ============================================================
// 夜间行动结算
// ============================================================
function resolveNightActions(room, ctx) {
  const ww = room.ww;
  ww.nightDeaths = [];

  // 按优先级排序所有夜间行动
  const actions = [];
  for (const [roleId, action] of Object.entries(ww.nightActions || {})) {
    const def = getRoleDef(roleId);
    actions.push({ roleId, action, priority: def ? def.nightPriority : 99 });
  }
  actions.sort((a, b) => a.priority - b.priority);

  // 1. 守卫守护
  const guardAction = actions.find(a => a.roleId === "guard");
  let protectedSeat = null;
  if (guardAction) {
    protectedSeat = guardAction.action.targetSeat;
    ww.guardLastProtected = protectedSeat;
    const player = getPlayerBySeat(room, protectedSeat);
    if (player) wwSendTo(player.username, { type: "ww_night_result", role: "guard", message: "你守护了" + protectedSeat + "号玩家" }, ctx);
  }

  // 2. 石像鬼查验
  const gargoyleAction = actions.find(a => a.roleId === "gargoyle");
  if (gargoyleAction) {
    const target = getPlayerBySeat(room, gargoyleAction.action.targetSeat);
    const gargoylePlayer = ww.players.find(p => p.role === "gargoyle");
    if (gargoylePlayer && target && target.alive) {
      wwSendTo(gargoylePlayer.username, {
        type: "ww_night_result", role: "gargoyle",
        targetSeat: target.seatNumber, roleName: getRoleDef(target.role) ? getRoleDef(target.role).name : "未知",
      }, ctx);
    }
  }

  // 3. 企鹅冰冻
  const penguinAction = actions.find(a => a.roleId === "penguin");
  let frozenSeat = null;
  if (penguinAction) {
    frozenSeat = penguinAction.action.targetSeat;
  }

  // 4. 狼人刀人
  let killTarget = ww.wolfKillTarget;
  ww.wolfKillTarget = null;

  // 5. 恶魔免疫检查 - 恶魔不会被刀
  if (killTarget !== null) {
    const target = getPlayerBySeat(room, killTarget);
    if (target && getRoleDef(target.role) && getRoleDef(target.role).nightImmune) {
      killTarget = null;
    }
  }

  // 6. 女巫解药
  const witchAction = actions.find(a => a.roleId === "witch");
  if (witchAction && witchAction.action.antidoteTarget && !ww.witchSaveUsed) {
    if (killTarget === witchAction.action.antidoteTarget) {
      killTarget = null; // 救活
      ww.witchSaveUsed = true;
      ww.witchSaveTarget = witchAction.action.antidoteTarget;
    }
  }

  // 7. 女巫毒药
  if (witchAction && witchAction.action.poisonTarget && !ww.witchPoisonUsed) {
    ww.nightDeaths.push(witchAction.action.poisonTarget);
    ww.witchPoisonUsed = true;
  }

  // 8. 守卫守护判定 (同守同救 = 奶穿)
  const noMilkPenetrate = room.config && room.config.rules && room.config.rules.noMilkPenetrate;
  if (killTarget !== null) {
    if (killTarget === protectedSeat && killTarget === ww.witchSaveTarget) {
      if (!noMilkPenetrate) {
        // 奶穿: 同守同救 = 死亡
        ww.nightDeaths.push(killTarget);
      }
      // 不奶穿时同守同救不致死，但也不推入死亡列表
    } else if (protectedSeat !== killTarget) {
      // 未被守护: 刀杀生效
      ww.nightDeaths.push(killTarget);
    }
  }

  // 9. 梦游判定
  const dreamAction = actions.find(a => a.roleId === "dreamweaver");
  if (dreamAction) {
    const dreamTarget = dreamAction.action.targetSeat;
    const dreamPlayer = ww.players.find(p => p.role === "dreamweaver");
    if (ww.dreamLastTarget === dreamTarget) {
      // 连续两晚同一目标: 死亡
      if (!ww.nightDeaths.includes(dreamTarget)) ww.nightDeaths.push(dreamTarget);
    }
    // 摄梦人死亡 -> 梦游者死亡
    if (dreamPlayer && !dreamPlayer.alive && !ww.nightDeaths.includes(dreamTarget)) {
      ww.nightDeaths.push(dreamTarget);
    }
    ww.dreamLastTarget = dreamTarget;
  }

  // 10. 猎魔人判定
  const hunterAction = actions.find(a => a.roleId === "demon_hunter");
  if (hunterAction) {
    const target = getPlayerBySeat(room, hunterAction.action.targetSeat);
    const hunterPlayer = ww.players.find(p => p.role === "demon_hunter");
    if (target && target.alive) {
      const targetDef = getRoleDef(target.role);
      if (targetDef && targetDef.team === "werewolf") {
        if (!ww.nightDeaths.includes(target.seatNumber)) ww.nightDeaths.push(target.seatNumber);
        if (hunterPlayer) wwSendTo(hunterPlayer.username, { type: "ww_night_result", role: "demon_hunter", message: "猎杀成功！目标" + target.seatNumber + "号是狼人。" }, ctx);
      } else {
        if (hunterPlayer) {
          ww.nightDeaths.push(hunterPlayer.seatNumber);
          wwSendTo(hunterPlayer.username, { type: "ww_night_result", role: "demon_hunter", message: "猎杀失败！目标不是狼人，你已死亡。" }, ctx);
        }
      }
    }
  }

  // 11. 奇迹商人技能给予 (首夜)
  const merchantAction = actions.find(a => a.roleId === "miracle_merchant");
  if (merchantAction) {
    const target = getPlayerBySeat(room, merchantAction.action.targetSeat);
    const merchantPlayer = ww.players.find(p => p.role === "miracle_merchant");
    if (target && target.alive) {
      const targetDef = getRoleDef(target.role);
      if (targetDef && targetDef.team === "werewolf") {
        // 给到狼人: 狼人暴毙
        if (!ww.nightDeaths.includes(target.seatNumber)) ww.nightDeaths.push(target.seatNumber);
        if (merchantPlayer) wwSendTo(merchantPlayer.username, { type: "ww_night_result", role: "miracle_merchant", message: "目标" + target.seatNumber + "号是狼人，已暴毙！" }, ctx);
      } else {
        // 给到好人: 给予技能
        ww.miracleGiftSeat = target.seatNumber;
        ww.miracleGiftSkill = merchantAction.action.giftSkill || "check";
        if (merchantPlayer) wwSendTo(merchantPlayer.username, { type: "ww_night_result", role: "miracle_merchant", message: "已给予" + target.seatNumber + "号玩家技能。" }, ctx);
        wwSendTo(target.username, { type: "ww_miracle_gift", skill: ww.miracleGiftSkill }, ctx);
      }
    }
  }

  // 去重
  ww.nightDeaths = [...new Set(ww.nightDeaths)];

  // 标记死亡 - 冰冻玩家免疫死亡
  for (const seat of ww.nightDeaths) {
    if (seat === frozenSeat) continue; // 冰冻免疫
    markPlayerDead(room, seat);
  }

  // 12. 预言家查验
  const seerAction = actions.find(a => a.roleId === "seer");
  if (seerAction) {
    const target = getPlayerBySeat(room, seerAction.action.targetSeat);
    const seerPlayer = ww.players.find(p => p.role === "seer");
    if (seerPlayer && target) {
      const targetDef = getRoleDef(target.role);
      let alignment = "unknown";
      // 隐狼对预言家显示为好人
      if (target.role === "hidden_wolf" || (targetDef && targetDef.appearsAs === "villager")) {
        alignment = "good";
      } else if (targetDef && targetDef.team === "werewolf") {
        alignment = "werewolf";
      } else {
        alignment = "good";
      }
      // 恶魔被查验: 预言家死亡
      if (target.role === "demon") {
        markPlayerDead(room, seerPlayer.seatNumber);
        if (!ww.nightDeaths.includes(seerPlayer.seatNumber)) ww.nightDeaths.push(seerPlayer.seatNumber);
        wwSendTo(seerPlayer.username, { type: "ww_night_result", role: "seer", message: "你查验了" + target.seatNumber + "号，发生了可怕的事情！你已死亡。" }, ctx);
      } else {
        wwSendTo(seerPlayer.username, { type: "ww_night_result", role: "seer", targetSeat: target.seatNumber, alignment }, ctx);
      }
    }
    // 恶魔查验神职
    const demonAction = actions.find(a => a.roleId === "demon");
    if (demonAction) {
      const dtarget = getPlayerBySeat(room, demonAction.action.targetSeat);
      const demonPlayer = ww.players.find(p => p.role === "demon");
      if (demonPlayer && dtarget) {
        const ddef = getRoleDef(dtarget.role);
        const isGod = ddef && ddef.isGod;
        wwSendTo(demonPlayer.username, { type: "ww_night_result", role: "demon", targetSeat: dtarget.seatNumber, isGod }, ctx);
      }
    }
  }

  // 清理夜间行动
  ww.nightActions = {};

  // 熊咆哮检查
  const bearPlayer = ww.players.find(p => p.role === "bear" && p.alive);
  if (bearPlayer) {
    ww.bearGrowls = checkBearGrowls(room, bearPlayer.seatNumber);
  }

  // 守墓人通灵
  const gravekeeperPlayer = ww.players.find(p => p.role === "gravekeeper" && p.alive);
  if (gravekeeperPlayer && ww.lastEliminatedRole) {
    wwSendTo(gravekeeperPlayer.username, { type: "ww_night_result", role: "gravekeeper", lastEliminatedRole: ww.lastEliminatedRole }, ctx);
  }
}

function markPlayerDead(room, seat) {
  const player = getPlayerBySeat(room, seat);
  if (player) {
    player.alive = false;
    const seatData = room.ww.seats[seat];
    if (seatData) seatData.alive = false;
  }
}

function checkBearGrowls(room, bearSeat) {
  const aliveSeats = getAlivePlayers(room).map(p => p.seatNumber);
  const totalSeats = room.ww.seats.length - 1; // exclude index 0
  let leftSeat = bearSeat - 1;
  let rightSeat = bearSeat + 1;
  while (leftSeat >= 1 && !aliveSeats.includes(leftSeat)) leftSeat--;
  while (rightSeat <= totalSeats && !aliveSeats.includes(rightSeat)) rightSeat++;

  const neighbors = [leftSeat, rightSeat].filter(s => s >= 1 && s <= totalSeats && aliveSeats.includes(s));
  for (const s of neighbors) {
    const p = getPlayerBySeat(room, s);
    if (p && p.alive) {
      const def = getRoleDef(p.role);
      if (def && def.countAsWolf) return true;
    }
  }
  return false;
}

// ============================================================
// 胜负判定
// ============================================================
function checkWinConditions(room) {
  const ww = room.ww;
  if (!ww) return null;
  const alive = getAlivePlayers(room);
  const aliveWolves = alive.filter(p => {
    const def = getRoleDef(p.role);
    return def && def.countAsWolf;
  });
  const aliveVillagers = alive.filter(p => {
    const def = getRoleDef(p.role);
    return def && (def.team === "villager" || def.team === "third_party");
  });

  // 情侣阵营判定
  if (ww.lovers && ww.lovers.length === 2) {
    const lover1 = getPlayerBySeat(room, ww.lovers[0]);
    const lover2 = getPlayerBySeat(room, ww.lovers[1]);
    if (lover1 && lover2 && lover1.alive && lover2.alive) {
      const allOthersDead = alive.length === 2;
      if (allOthersDead) return { winner: "lovers", reason: "情侣存活至最后" };
    }
    // 情侣一方死亡 = 另一方也死
    if (lover1 && lover2 && (!lover1.alive || !lover2.alive)) {
      if (lover1.alive) markPlayerDead(room, lover1.seatNumber);
      if (lover2.alive) markPlayerDead(room, lover2.seatNumber);
    }
  }

  if (aliveWolves.length === 0) return { winner: "villager", reason: "所有狼人出局" };

  const massacreMode = ww.config && ww.config.rules && ww.config.rules.massacreMode;
  if (massacreMode) {
    if (aliveVillagers.length === 0) return { winner: "werewolf", reason: "所有好人出局(屠城)" };
  } else {
    if (aliveWolves.length >= aliveVillagers.length) return { winner: "werewolf", reason: "狼人票数占优(屠边)" };
  }

  return null;
}

// ============================================================
// AI 玩家
// ============================================================
function createAIPlayers(config) {
  const aiPlayers = [];
  for (let i = 0; i < (config.genericVillagerCount || 0); i++) {
    aiPlayers.push({
      username: "__ai_villager_" + i,
      avatarText: "通用",
      textColor: "#888888",
      borderColor: "#666666",
      role: "villager",
      alive: true,
      isAI: true,
      seatNumber: 0, // 稍后分配
      ready: true,
    });
  }
  return aiPlayers;
}

function aiShouldSkip(room, player) {
  if (!player.isAI) return false;
  // AI 村民: 不参与操作, 不发言, 不投票
  return player.role === "villager";
}

// ============================================================
// 游戏结束
// ============================================================
function endGame(room, result, ctx) {
  const ww = room.ww;
  clearPhaseTimer(room);
  ww.phase = "GAME_OVER";

  const roleReveal = ww.players.map(p => ({
    seatNumber: p.seatNumber,
    username: p.username,
    role: p.role,
    roleName: getRoleDef(p.role) ? getRoleDef(p.role).name : "未知",
    team: getRoleDef(p.role) ? getRoleDef(p.role).team : "unknown",
    alive: p.alive,
    isAI: p.isAI,
  }));

  // 记录战绩
  const winnerTeam = result.winner === "werewolf" ? "werewolf" : result.winner === "lovers" ? "third_party" : "villager";
  for (const player of ww.players) {
    if (player.isAI) continue;
    const playerTeam = getRoleDef(player.role) ? getRoleDef(player.role).team : "villager";
    // 情侣阵营
    let actualTeam = playerTeam;
    if (ww.lovers && ww.lovers.includes(player.seatNumber)) {
      actualTeam = result.winner === "lovers" ? "third_party" : playerTeam;
    }
    if (actualTeam === winnerTeam || result.winner === playerTeam) {
      ctx.recordGameResult(room.gameName, player.username, "win");
    } else {
      ctx.recordGameResult(room.gameName, player.username, "loss");
    }
  }
  ctx.broadcastStats(room.gameName);

  wwBroadcast(room, {
    type: "ww_game_over",
    winner: result.winner,
    reason: result.reason,
    roleReveal,
  }, ctx);

  // 发送 game_over 给大厅(战绩系统兼容)
  const winners = result.winner === "villager"
    ? ww.players.filter(p => { const d = getRoleDef(p.role); return d && d.team === "villager"; }).map(p => p.username)
    : ww.players.filter(p => { const d = getRoleDef(p.role); return d && d.countAsWolf; }).map(p => p.username);
  ctx.broadcastToRoom(room.id, {
    type: "game_over",
    gameName: room.gameName,
    winners: winners.filter(u => !u.startsWith("__ai_")),
  });

  room.status = "waiting";
}

// ============================================================
// 角色分配
// ============================================================
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function distributeRoles(room, ctx) {
  const ww = room.ww;
  const config = ww.config;
  const humanPlayers = ww.players.filter(p => !p.isAI);
  const aiPlayers = ww.players.filter(p => p.isAI);

  // 构建角色池
  let rolePool = [];
  for (const [roleId, count] of Object.entries(config.roleSetup)) {
    for (let i = 0; i < count; i++) {
      rolePool.push(roleId);
    }
  }

  // 如果包含盗贼，加两张额外牌
  if (config.roleSetup.thief && config.roleSetup.thief > 0) {
    const extraPool = shuffle(rolePool);
    ww.thiefExtraRoles = [extraPool[0], extraPool[1]];
    rolePool.push("placeholder"); // 盗贼占位
  }

  // 确保角色池 >= 人数
  while (rolePool.length < humanPlayers.length) {
    rolePool.push("villager");
  }

  rolePool = shuffle(rolePool);

  // 分配给人族玩家
  for (let i = 0; i < humanPlayers.length; i++) {
    if (humanPlayers[i].role === "thief") continue; // 盗贼不分配
    humanPlayers[i].role = rolePool[i] || "villager";
  }

  // 处理盗贼
  const thiefPlayer = humanPlayers.find(p => p.role === "thief");
  if (thiefPlayer && ww.thiefExtraRoles) {
    // 默认选择第一张非狼牌，如果两张都是狼则选狼
    const hasWolf = ww.thiefExtraRoles.some(r => {
      const d = getRoleDef(r);
      return d && d.countAsWolf;
    });
    if (hasWolf) {
      thiefPlayer.role = ww.thiefExtraRoles.find(r => {
        const d = getRoleDef(r);
        return d && d.countAsWolf;
      }) || ww.thiefExtraRoles[0];
    } else {
      thiefPlayer.role = ww.thiefExtraRoles[0];
    }
  }

  // AI 玩家固定为民
  for (const ai of aiPlayers) {
    ai.role = "villager";
  }

  // 发送角色给每个玩家(仅自己可见)
  for (const player of humanPlayers) {
    const roleDef = getRoleDef(player.role);
    wwSendTo(player.username, {
      type: "ww_role_assign",
      role: player.role,
      roleName: roleDef ? roleDef.name : "未知",
      emoji: roleDef ? roleDef.emoji : "",
      team: roleDef ? roleDef.team : "",
      skillDesc: roleDef ? roleDef.skillDesc : "",
      seatNumber: player.seatNumber,
    }, ctx);
  }
}

// ============================================================
// 随机座位与随机排序
// ============================================================
function shuffleSeats(room, randomSeats, randomOrder) {
  const ww = room.ww;
  const humanPlayers = ww.players.filter(p => !p.isAI);

  if (randomSeats) {
    // 重新排列座位号
    const seatNumbers = humanPlayers.map(p => p.seatNumber);
    const shuffled = shuffle(seatNumbers);
    for (let i = 0; i < humanPlayers.length; i++) {
      humanPlayers[i].seatNumber = shuffled[i];
    }
    // 更新 seats 数组
    ww.seats = [];
    for (let i = 0; i <= ww.config.totalPlayers; i++) {
      const player = ww.players.find(p => p.seatNumber === i);
      if (player) {
        ww.seats[i] = { username: player.username, avatarText: player.avatarText, textColor: player.textColor, borderColor: player.borderColor, alive: true, isAI: player.isAI };
      } else {
        ww.seats[i] = null;
      }
    }
  }

  if (randomOrder) {
    // 随机发言顺序偏移
    ww.speechOrderOffset = Math.floor(Math.random() * ww.config.totalPlayers);
  }
}

// ============================================================
// 插件入口
// ============================================================
function handleMessage(msg, username, ctx) {
  // 获取用户所在房间
  const u = ctx.users.get(username);
  if (!u || !u.currentRoom) return;
  const room = ctx.rooms.get(u.currentRoom);
  if (!room) return;

  const ww = room.ww;

  switch (msg.type) {
    // ===== 配置相关 =====
    case "ww_config": {
      if (!ww || ww.phase !== "waiting") return;
      // 只有房主和法官能修改
      const isHost = room.players[0] && room.players[0].username === username;
      const isJudge = ww.judgeSeat === username;
      if (!isHost && !isJudge) return;
      ww.config = { ...ww.config, ...msg.config };
      ctx.broadcastToRoom(room.id, { type: "ww_config_update", config: ww.config });
      break;
    }

    // ===== 选择座位 =====
    case "ww_select_seat": {
      if (!ww || ww.phase !== "waiting") return;
      const seat = msg.seat; // seat number or "judge"
      // 释放旧座位
      if (ww.judgeSeat === username) ww.judgeSeat = null;
      for (let i = 1; i < ww.seats.length; i++) {
        if (ww.seats[i] && ww.seats[i].username === username) {
          ww.seats[i] = null;
        }
      }

      if (seat === "judge") {
        ww.judgeSeat = username;
      } else if (typeof seat === "number" && seat >= 1 && seat <= ww.config.totalPlayers) {
        if (ww.seats[seat] && ww.seats[seat].username !== username) {
          // 座位被占
          wwSendTo(username, { type: "ww_error", message: "该座位已被占用" }, ctx);
          return;
        }
        ww.seats[seat] = {
          username, avatarText: u.avatarText, textColor: u.textColor,
          borderColor: u.borderColor, alive: true, isAI: false,
        };
      }

      ctx.broadcastToRoom(room.id, {
        type: "ww_seat_update",
        seats: ww.seats, judgeSeat: ww.judgeSeat,
      });
      break;
    }

    // ===== 开始游戏 =====
    case "ww_start_game": {
      if (!ww || ww.phase !== "waiting") return;
      const isHost = room.players[0] && room.players[0].username === username;
      if (!isHost) return;

      // 检查座位全部占满
      let allFilled = ww.judgeSeat !== null || true; // 法官位非必需
      for (let i = 1; i <= ww.config.totalPlayers; i++) {
        if (!ww.seats[i]) { allFilled = false; break; }
      }
      if (!allFilled) {
        wwSendTo(username, { type: "ww_error", message: "请先让所有座位有人" }, ctx);
        return;
      }

      // 构建玩家列表
      ww.players = [];
      for (let i = 1; i <= ww.config.totalPlayers; i++) {
        const seat = ww.seats[i];
        if (seat && seat.isAI) {
          ww.players.push({ ...seat, seatNumber: i, ready: true });
        } else if (seat) {
          ww.players.push({ ...seat, seatNumber: i, ready: true });
        }
      }

      // 添加 AI 玩家
      const aiPlayers = createAIPlayers(ww.config);
      let aiCount = ww.config.totalPlayers + 1;
      for (const ai of aiPlayers) {
        // 找空座位
        while (ww.seats[aiCount] && aiCount < 19) aiCount++;
        if (aiCount > 18) break;
        ai.seatNumber = aiCount;
        ww.seats[aiCount] = { username: ai.username, avatarText: ai.avatarText, textColor: ai.textColor, borderColor: ai.borderColor, alive: true, isAI: true };
        ww.players.push(ai);
        aiCount++;
      }

      // 更新 config.totalPlayers 包含 AI
      ww.config.totalPlayers = ww.players.length;

      // 随机座位/排序
      shuffleSeats(room, ww.config.rules.randomSeats, ww.config.rules.randomOrder);

      // 分配角色
      distributeRoles(room, ctx);

      // 初始化夜间行动
      ww.nightActions = {};
      ww.wolfKillTarget = null;
      ww.votes = {};
      ww.wolfChatLog = [];
      ww.phase = "WAITING";

      room.status = "playing";

      // 广播游戏开始
      ctx.broadcastToRoom(room.id, {
        type: "ww_game_started",
        seats: ww.seats,
        totalPlayers: ww.config.totalPlayers,
        config: {
          totalPlayers: ww.config.totalPlayers,
          rules: ww.config.rules,
        },
      });

      // 决定是否有警长竞选（仅 12 人及以上局有警长）
      const noSheriff = ww.config.rules.noSheriff || ww.config.totalPlayers < 12;
      if (noSheriff) {
        // 跳过警长竞选直接进入夜晚
        advancePhase(room, getNightOrder(room)[0] || "DAWN", ctx);
      } else {
        advancePhase(room, "SHERIFF_ELECTION", ctx);
      }
      break;
    }

    // ===== 夜间行动 =====
    case "ww_night_action": {
      if (!ww || !ww.phase || !ww.phase.startsWith("NIGHT_")) return;
      const player = getPlayerByUsername(room, username);
      if (!player || !player.alive) return;

      const roleId = msg.roleId || player.role;
      const def = getRoleDef(roleId);
      if (!def || !def.nightAction) return;

      ww.nightActions[roleId] = {
        playerIndex: player.seatNumber,
        targetSeat: msg.targetSeat,
        antidoteTarget: msg.antidoteTarget,
        poisonTarget: msg.poisonTarget,
        giftSkill: msg.giftSkill,
      };

      wwSendTo(username, { type: "ww_action_ack", role: roleId }, ctx);

      // 检查该阶段所有需要行动的玩家是否都已行动
      checkNightPhaseComplete(room, ctx);
      break;
    }

    // ===== 狼人击杀 =====
    case "ww_wolf_kill": {
      if (!ww || ww.phase !== "NIGHT_WEREWOLF") return;
      const player = getPlayerByUsername(room, username);
      if (!player || !player.alive) return;
      const def = getRoleDef(player.role);
      if (!def || !def.countAsWolf || player.role === "hidden_wolf") return;

      ww.wolfKillTarget = msg.targetSeat;
      wwSendTo(username, { type: "ww_action_ack", role: "werewolf", target: msg.targetSeat }, ctx);

      // 狼人共享刀人目标，提交后直接推进
      checkNightPhaseComplete(room, ctx);
      break;
    }

    // ===== 狼人聊天 =====
    case "ww_wolf_chat": {
      if (!ww || !ww.phase || !ww.phase.startsWith("NIGHT_")) return;
      const player = getPlayerByUsername(room, username);
      if (!player) return;
      const def = getRoleDef(player.role);
      if (!def || !def.countAsWolf) return;

      const chatMsg = {
        from: player.seatNumber,
        fromName: username,
        text: msg.text,
        timestamp: Date.now(),
      };
      ww.wolfChatLog.push(chatMsg);

      // 广播给所有狼人(活得和死的都可见)
      for (const p of ww.players) {
        const pdef = getRoleDef(p.role);
        if (pdef && pdef.countAsWolf) {
          wwSendTo(p.username, { type: "ww_wolf_chat_msg", ...chatMsg }, ctx);
        }
      }
      break;
    }

    // ===== 警长投票 =====
    case "ww_sheriff_vote": {
      if (!ww || ww.phase !== "SHERIFF_ELECTION") return;
      const player = getPlayerByUsername(room, username);
      if (!player || !player.alive) return;

      ww.sheriffVotes = ww.sheriffVotes || {};
      ww.sheriffVotes[player.seatNumber] = msg.targetSeat;

      // 检查是否所有幸存玩家都投票了
      const alive = getAlivePlayers(room);
      const allVoted = alive.every(p => Object.keys(ww.sheriffVotes).includes(String(p.seatNumber)));
      if (allVoted) {
        resolveSheriffElection(room, ctx);
      }
      break;
    }

    // ===== 白天投票 =====
    case "ww_day_vote": {
      if (!ww || ww.phase !== "DAY_VOTE") return;
      const player = getPlayerByUsername(room, username);
      if (!player || !player.alive) return;
      // 白痴翻牌后无投票权
      if (player.role === "idiot" && player.voteLost) return;

      ww.votes = ww.votes || {};
      if (msg.target === "abstain") {
        ww.votes[player.seatNumber] = "abstain";
      } else {
        ww.votes[player.seatNumber] = msg.target;
      }

      wwSendTo(username, { type: "ww_action_ack", message: "投票已记录" }, ctx);

      // 广播当前票型
      ctx.broadcastToRoom(room.id, {
        type: "ww_vote_update",
        votes: ww.votes,
        votedCount: Object.keys(ww.votes).length,
        totalVoters: getAlivePlayers(room).filter(p => !(p.role === "idiot" && p.voteLost)).length,
      });

      // 检查是否全部投票
      const eligibleVoters = getAlivePlayers(room).filter(p => !(p.role === "idiot" && p.voteLost));
      if (Object.keys(ww.votes).length >= eligibleVoters.length) {
        resolveDayVote(room, ctx);
      }
      break;
    }

    // ===== 结束发言 =====
    case "ww_speech_end": {
      if (!ww || ww.phase !== "DAY_SPEECH") return;
      const player = getPlayerByUsername(room, username);
      if (!player || player.seatNumber !== ww.currentSpeaker) return;

      advanceSpeech(room, ctx);
      break;
    }

    // ===== 骑士决斗 =====
    case "ww_knight_duel": {
      if (!ww || ww.phase !== "DAY_SPEECH") return;
      const player = getPlayerByUsername(room, username);
      if (!player || player.role !== "knight" || !player.alive) return;
      if (ww.knightUsed) return;

      ww.knightUsed = true;
      const target = getPlayerBySeat(room, msg.targetSeat);
      if (!target || !target.alive) return;
      const targetDef = getRoleDef(target.role);

      if (targetDef && targetDef.countAsWolf) {
        markPlayerDead(room, target.seatNumber);
        ctx.broadcastToRoom(room.id, { type: "ww_knight_result", knight: player.seatNumber, target: target.seatNumber, success: true });
      } else {
        markPlayerDead(room, player.seatNumber);
        ctx.broadcastToRoom(room.id, { type: "ww_knight_result", knight: player.seatNumber, target: target.seatNumber, success: false });
      }

      const result = checkWinConditions(room);
      if (result) {
        endGame(room, result, ctx);
      }
      break;
    }

    // ===== 获取状态(重连) =====
    case "ww_get_state": {
      const player = getPlayerByUsername(room, username);
      if (!player) return;
      wwSendTo(username, {
        type: "ww_state",
        phase: ww.phase,
        round: ww.round,
        phaseEndTime: ww.phaseEndTime,
        seats: ww.seats,
        judgeSeat: ww.judgeSeat,
        sheriffSeat: ww.sheriffSeat,
        mySeat: player.seatNumber,
        myRole: player.role,
        config: ww.config,
        alive: player.alive,
      }, ctx);
      break;
    }

    // ===== 再来一局 =====
    case "ww_play_again": {
      resetGame(room, ctx);
      break;
    }
  }
}

// ============================================================
// 阶段管理辅助函数
// ============================================================
function checkNightPhaseComplete(room, ctx) {
  const ww = room.ww;
  if (!ww || !ww.phase || !ww.phase.startsWith("NIGHT_")) return;

  const phaseToRoles = {
    NIGHT_WEREWOLF: (p) => { const d = getRoleDef(p.role); return d && d.countAsWolf && p.role !== "hidden_wolf" && p.role !== "gargoyle"; },
    NIGHT_GUARD: (p) => p.role === "guard",
    NIGHT_SEER: (p) => p.role === "seer" || p.role === "demon",
    NIGHT_WITCH: (p) => p.role === "witch",
    NIGHT_GARGOYLE: (p) => p.role === "gargoyle",
    NIGHT_DREAMWEAVER: (p) => p.role === "dreamweaver",
    NIGHT_PENGUIN: (p) => p.role === "penguin",
    NIGHT_DEMON_HUNTER: (p) => p.role === "demon_hunter",
    NIGHT_MIRACLE_MERCHANT: (p) => p.role === "miracle_merchant",
    NIGHT_CROW: (p) => p.role === "crow",
    NIGHT_CUPID: (p) => p.role === "cupid",
    NIGHT_WOLF_BEAUTY: (p) => p.role === "wolf_beauty",
    NIGHT_DEMON: (p) => p.role === "demon",
  };

  const filter = phaseToRoles[ww.phase];
  if (!filter) {
    // 该阶段无特定角色需要行动，自动推进
    advancePhase(room, getNextPhase(room, ww.phase), ctx);
    return;
  }

  const rolePlayers = getAlivePlayers(room).filter(filter);

  // AI 自动跳过
  const nonAIPlayers = rolePlayers.filter(p => !p.isAI);
  if (nonAIPlayers.length === 0) {
    // 全是 AI，自动设置默认行动
    advancePhase(room, getNextPhase(room, ww.phase), ctx);
    return;
  }

  // 如果该阶段未超时且所有玩家已行动，则直接推进
  const allActed = nonAIPlayers.every(p => {
    if (ww.phase === "NIGHT_WEREWOLF") return ww.wolfKillTarget !== null;
    const action = ww.nightActions && ww.nightActions[p.role];
    return !!action;
  });
  if (allActed) {
    advancePhase(room, getNextPhase(room, ww.phase), ctx);
  }
}

function initSpeech(room, ctx) {
  const ww = room.ww;
  const alive = getAlivePlayers(room).filter(p => !p.isAI);
  if (alive.length === 0) {
    advancePhase(room, "DAY_VOTE", ctx);
    return;
  }
  // 发言顺序：按座位号排列，警长最后总结发言
  let order = alive.map(p => p.seatNumber).sort((a, b) => a - b);
  if (ww.sheriffSeat) {
    order = order.filter(s => s !== ww.sheriffSeat);
    order.push(ww.sheriffSeat);
  }
  ww.speechOrder = order;
  ww.currentSpeaker = -1;
  advanceSpeech(room, ctx);
}

function advanceSpeech(room, ctx) {
  const ww = room.ww;
  const order = ww.speechOrder;
  if (!order) return;

  const idx = order.indexOf(ww.currentSpeaker);
  let nextIdx = idx + 1;
  if (nextIdx >= order.length) {
    // 发言结束，进入投票
    ww.currentSpeaker = -1;
    advancePhase(room, "DAY_VOTE", ctx);
    return;
  }

  // 跳过 AI 玩家和死人
  let nextSpeaker = order[nextIdx];
  while (nextSpeaker !== undefined) {
    const player = getPlayerBySeat(room, nextSpeaker);
    if (!player || !player.alive || player.isAI) {
      // AI 自动跳过
      if (player && player.isAI) {
        ctx.broadcastToRoom(room.id, { type: "ww_speech_skip", seat: nextSpeaker, reason: "通用玩家" + nextSpeaker + "号放弃发言" });
      }
      nextIdx++;
      if (nextIdx >= order.length) {
        ww.currentSpeaker = -1;
        advancePhase(room, "DAY_VOTE", ctx);
        return;
      }
      nextSpeaker = order[nextIdx];
    } else {
      break;
    }
  }

  if (nextSpeaker === undefined) {
    ww.currentSpeaker = -1;
    advancePhase(room, "DAY_VOTE", ctx);
  } else {
    ww.currentSpeaker = nextSpeaker;
    ctx.broadcastToRoom(room.id, { type: "ww_speech_token", speaker: nextSpeaker });
    // 设置发言超时
    clearPhaseTimer(room);
    ww.phaseTimer = setTimeout(() => advanceSpeech(room, ctx), PHASE_DURATIONS.DAY_SPEECH_PER * 1000);
  }
}

function resolveSheriffElection(room, ctx) {
  const ww = room.ww;
  const votes = ww.sheriffVotes || {};
  const tally = {};
  for (const [voter, target] of Object.entries(votes)) {
    if (target === "abstain" || target === null) continue;
    tally[target] = (tally[target] || 0) + 1;
  }

  let maxVotes = 0;
  let winners = [];
  for (const [seat, count] of Object.entries(tally)) {
    if (count > maxVotes) { maxVotes = count; winners = [parseInt(seat)]; }
    else if (count === maxVotes) { winners.push(parseInt(seat)); }
  }

  if (winners.length === 1) {
    ww.sheriffSeat = winners[0];
  }
  // 平票无警长
  ww.sheriffVotes = {};

  ctx.broadcastToRoom(room.id, { type: "ww_sheriff_result", sheriffSeat: ww.sheriffSeat });

  // 进入夜晚
  advancePhase(room, getNightOrder(room)[0] || "DAWN", ctx);
}

function resolveDayVote(room, ctx) {
  const ww = room.ww;
  const votes = ww.votes || {};
  const tally = {};

  for (const [voter, target] of Object.entries(votes)) {
    if (target === "abstain") continue;
    let weight = 1;
    // 警长 1.5 票
    if (parseInt(voter) === ww.sheriffSeat) weight += 0.5;
    tally[target] = (tally[target] || 0) + weight;
  }

  let maxVotes = 0;
  let topCandidates = [];
  for (const [seat, count] of Object.entries(tally)) {
    if (count > maxVotes) { maxVotes = count; topCandidates = [parseInt(seat)]; }
    else if (count === maxVotes) { topCandidates.push(parseInt(seat)); }
  }

  let eliminatedSeat = null;
  if (topCandidates.length === 1) {
    eliminatedSeat = topCandidates[0];
  }
  // 平票: 无人出局

  if (eliminatedSeat !== null) {
    const eliminated = getPlayerBySeat(room, eliminatedSeat);
    if (eliminated) {
      // 白痴翻牌
      if (eliminated.role === "idiot" && eliminated.alive) {
        ww.lastEliminatedRole = getRoleDef(eliminated.role) ? getRoleDef(eliminated.role).team : "unknown";
        eliminated.voteLost = true;
        ctx.broadcastToRoom(room.id, { type: "ww_vote_result", eliminated: eliminatedSeat, role: "白痴", special: "翻牌免死" });
      } else {
        // 炸弹人
        if (eliminated.role === "bomber") {
          const voters = Object.entries(votes).filter(([v, t]) => t === eliminatedSeat && v !== "abstain");
          for (const [voter] of voters) {
            markPlayerDead(room, parseInt(voter));
          }
        }
        // 猎人开枪
        if (eliminated.role === "hunter" || eliminated.role === "wolf_king") {
          // 这里简化处理，实际应等待猎人选择目标
          // 暂时让猎人在被投出时不开枪（后续可以添加交互）
        }
        markPlayerDead(room, eliminatedSeat);
        ww.lastEliminatedRole = getRoleDef(eliminated.role) ? getRoleDef(eliminated.role).team : "unknown";
        ctx.broadcastToRoom(room.id, { type: "ww_vote_result", eliminated: eliminatedSeat, role: getRoleDef(eliminated.role) ? getRoleDef(eliminated.role).name : "未知" });
      }
    }
  } else {
    ctx.broadcastToRoom(room.id, { type: "ww_vote_result", eliminated: null, reason: "平票，无人出局" });
  }

  ww.votes = {};

  const result = checkWinConditions(room);
  if (result) {
    endGame(room, result, ctx);
  } else {
    advancePhase(room, "DUSK", ctx);
  }
}

function resetGame(room, ctx) {
  clearPhaseTimer(room);
  room.ww = {
    config: room.ww ? room.ww.config : {
      totalPlayers: 6,
      roleSetup: { ...DEFAULT_ROLE_SETUPS[6] },
      genericVillagerCount: 0,
      rules: {
        witchSelfSaveAfterFirstNight: false,
        randomSeats: false,
        randomOrder: false,
        massacreMode: false,
        noSheriff: false,
      },
    },
    seats: [],
    judgeSeat: null,
    players: [],
    phase: "waiting",
    phaseTimer: null,
    phaseEndTime: 0,
    round: 0,
    sheriffSeat: null,
    nightActions: {},
    wolfKillTarget: null,
    witchSaveUsed: false,
    witchPoisonUsed: false,
    guardLastProtected: null,
    nightDeaths: [],
    speechOrder: [],
    currentSpeaker: -1,
    votes: {},
    wolfChatLog: [],
    sheriffVotes: {},
  };

  // 重置准备状态
  room.status = "waiting";
  for (const p of room.players) {
    p.ready = false;
  }
  ctx.broadcastToRoom(room.id, { type: "ww_play_again" });
}

function initWW(room) {
  if (!room.ww) {
    const setup = DEFAULT_ROLE_SETUPS[6];
    room.ww = {
      config: {
        totalPlayers: 6,
        roleSetup: { ...setup },
        genericVillagerCount: 0,
        rules: {
          witchSelfSaveAfterFirstNight: false,
          randomSeats: false,
          randomOrder: false,
          massacreMode: true, // 6人默认屠城
          noSheriff: false,
        },
      },
      seats: [],
      judgeSeat: null,
      players: [],
      phase: "waiting",
      phaseTimer: null,
      phaseEndTime: 0,
      round: 0,
      sheriffSeat: null,
      nightActions: {},
      wolfKillTarget: null,
      witchSaveUsed: false,
      witchPoisonUsed: false,
      guardLastProtected: null,
      nightDeaths: [],
      speechOrder: [],
      currentSpeaker: -1,
      votes: {},
      wolfChatLog: [],
      sheriffVotes: {},
      lovers: null,
      dreamLastTarget: null,
      knightUsed: false,
      lastEliminatedRole: null,
      miracleGiftSeat: null,
      miracleGiftSkill: null,
      bearGrowls: false,
    };
  }
  return room.ww;
}

// ============================================================
// 插件导出
// ============================================================
module.exports = {
  handleMessage,
  onPlayerLeave(username, room, ctx) {
    const ww = room.ww;
    if (!ww) return;

    // 断线玩家标记为死亡
    if (ww.phase !== "waiting" && ww.phase !== "GAME_OVER") {
      const player = getPlayerByUsername(room, username);
      if (player && player.alive) {
        player.alive = false;
        const seatData = ww.seats[player.seatNumber];
        if (seatData) seatData.alive = false;
        ctx.broadcastToRoom(room.id, { type: "ww_player_disconnect", seat: player.seatNumber, username });
        const result = checkWinConditions(room);
        if (result) {
          endGame(room, result, ctx);
        }
      }
    }

    // 清理座位
    if (ww.judgeSeat === username) ww.judgeSeat = null;
    for (let i = 1; i < ww.seats.length; i++) {
      if (ww.seats[i] && ww.seats[i].username === username) {
        ww.seats[i] = null;
      }
    }
    ctx.broadcastToRoom(room.id, { type: "ww_seat_update", seats: ww.seats, judgeSeat: ww.judgeSeat });
  },
  // 房间创建时初始化
  init(room) {
    initWW(room);
  },
};

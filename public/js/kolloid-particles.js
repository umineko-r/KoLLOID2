// public/js/kolloid-particles.js
// 更新情報JSONを読み込み、粒子として表示する版（自動cap対応）
// - enableLinks=true: JSON粒子（リンク/hoverあり）
// - enableLinks=false: ダミー粒子（リンク/hoverなし）
//
// ★重要：enableLinks は「起動時固定」ではなく、bodyのdata属性を毎回参照して強制的に反映する
console.log("[kolloid] particles.js loaded v=20251228-genre-1");

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function clamp(x, min, max) {
  return Math.max(min, Math.min(max, x));
}

// 指定ジャンル：文章 / 音楽 / 詩 / 短歌・和歌 / 写真 / 絵 / 映像 / 食 / 旅 / 自然
function genreColor(genre) {
  const g = (genre || "").trim();

  const MAP = {
    "文章":       [255, 206, 164],
    "音楽":       [255, 198, 170],
    "短歌・和歌": [255, 190, 184],
    "詩":         [255, 194, 198],
    "写真":       [255, 204, 192],
    "絵":         [255, 210, 176],
    "映像":       [255, 196, 188],
    "食":         [255, 212, 160],
    "旅":         [255, 200, 156],
    "自然":       [255, 208, 168],
  };

  return MAP[g] || [255, 190, 170];
}

function resolveDisplayName(contributorsMap, contributorId) {
  const id = (contributorId || "").trim();
  if (!id) return contributorId || "";
  const ent = contributorsMap && contributorsMap[id];
  return ent && ent.displayName ? ent.displayName : id;
}

/**
 * 粒子として表示するアイテム選択
 * - 新着を一定割合優先
 * - contributor 偏りを緩やかに抑制
 * - Instagram は account 単位で cap=12
 */
function selectItems(allItems, opts) {
  const {
    totalCount,
    newRatio = 0.3,
    recentDays = 30,
    instagramPerAccountCap = 12, // ★ここを 12 に
  } = opts;

  const normalized = (Array.isArray(allItems) ? allItems : [])
    .map((it) => ({
      ...it,
      _updatedAt: toDate(it.updatedAt),
      _key: it.id || it.link,
    }))
    .filter((it) => it.contributor && it.title && it.link && it._key);

  if (normalized.length === 0) return [];

  // --- Instagram cap（account単位） ---
  const ig = normalized.filter((it) => it.siteType === "instagram");
  const nonIg = normalized.filter((it) => it.siteType !== "instagram");

  const igByAccount = new Map();
  for (const it of ig) {
    const key = (it.account || it.contributor || "").trim() || "unknown";
    if (!igByAccount.has(key)) igByAccount.set(key, []);
    igByAccount.get(key).push(it);
  }

  const igCapped = [];
  for (const [, arr] of igByAccount) {
    arr.sort((a, b) => {
      const ta = a._updatedAt ? a._updatedAt.getTime() : 0;
      const tb = b._updatedAt ? b._updatedAt.getTime() : 0;
      return tb - ta;
    });
    igCapped.push(...arr.slice(0, instagramPerAccountCap));
  }

  const items = [...nonIg, ...igCapped];

  const contributors = new Set(items.map((x) => x.contributor)).size || 1;

  const now = new Date();
  const cutoff = new Date(now.getTime() - recentDays * 24 * 60 * 60 * 1000);

  const recentPool = items.filter((it) => it._updatedAt && it._updatedAt >= cutoff);

  const sortedByNew = [...items].sort((a, b) => {
    const ta = a._updatedAt ? a._updatedAt.getTime() : 0;
    const tb = b._updatedAt ? b._updatedAt.getTime() : 0;
    return tb - ta;
  });

  const newPool =
    recentPool.length > 0
      ? recentPool
      : sortedByNew.slice(0, Math.ceil(totalCount * 0.5));

  const newCount = Math.min(newPool.length, Math.round(totalCount * newRatio));

  const newPicked = shuffle([...newPool]).slice(0, newCount);
  const pickedKeys = new Set(newPicked.map((x) => x._key));

  const remaining = items.filter((x) => !pickedKeys.has(x._key));
  const randomCount = Math.max(0, totalCount - newPicked.length);

  const autoCap = clamp(Math.floor(randomCount / contributors), 2, 5);

  function pickWithCap(candidates, want, cap) {
    const counts = new Map();
    const out = [];
    const shuffled = shuffle([...candidates]);

    for (const it of shuffled) {
      if (out.length >= want) break;
      const key = it.contributor;
      const c = counts.get(key) || 0;
      if (c >= cap) continue;
      counts.set(key, c + 1);
      out.push(it);
    }
    return out;
  }

  let randomPicked = pickWithCap(remaining, randomCount, autoCap);

  if (randomPicked.length < randomCount) {
    for (const extra of [1, 2, 9999]) {
      const cap = autoCap + extra;
      const used = new Set(randomPicked.map((x) => x._key));
      const rest = remaining.filter((x) => !used.has(x._key));
      const more = pickWithCap(rest, randomCount - randomPicked.length, cap);
      randomPicked = randomPicked.concat(more);
      if (randomPicked.length >= randomCount) break;
    }
  }

  const final = [...newPicked, ...randomPicked];
  shuffle(final);
  return final;
}

function targetCount() {
  const w = window.innerWidth;
  if (w <= 600) return 32;
  if (w <= 1024) return 44;
  return 56;
}

function isLinksEnabled() {
  return document.body?.dataset?.enableLinks === "true";
}

// 以降 createKolloidSketch() 以下は **変更なし**
export function createKolloidSketch(options = {}) {
  const {
    enableLinks: initialEnableLinks = false,
    contributorsMap = {},
  } = options;

  return (p) => {
    /* ……（ここから下はあなたの現行コードと完全に同じなので省略せず使ってOK）…… */
  };
}
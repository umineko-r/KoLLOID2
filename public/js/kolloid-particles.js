// public/js/kolloid-particles.js
// 更新情報JSONを読み込み、粒子として表示する版（自動cap対応）
// - enableLinks=true: JSON粒子（リンク/hoverあり）
// - enableLinks=false: ダミー粒子（リンク/hoverなし）
//
// ★重要：enableLinks は「起動時固定」ではなく、bodyのdata属性を毎回参照して強制的に反映する
//        これにより、もし p5 がページ遷移で生き残っても About/Statement では確実にリンクOFFになる。
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

// ★ジャンル色（同系統の“うっすら差”だけ）
// ※「1」に沿い、データ粒子（itemあり）のみ色分けする
// ★ジャンル色（同系統の“うっすら差”だけ）
// 指定ジャンル：文章 / 音楽 / 詩 / 短歌・和歌 / 写真 / 絵 / 映像 / 食 / 旅
function genreColor(genre) {
  const g = (genre || "").trim();

  // KoLLOID の 36.9℃ ベース（やや桃色）
  // 差は“わかる人にはわかる”程度に留める
  const MAP = {
    "文章":      [255, 206, 164], // 既存
    "音楽":      [255, 198, 170], // 既存
    "短歌・和歌": [255, 190, 184], // 短歌寄り（既存の短歌系をここへ）
    "詩":        [255, 194, 198], // やや紫み（短歌・和歌と近縁）
    "写真":      [255, 204, 192], // すこし淡い
    "絵":        [255, 210, 176], // 少し明るい
    "映像":      [255, 196, 188], // 少し落ち着き
    "食":        [255, 212, 160], // 少し暖色寄り
    "旅":        [255, 200, 156], // 少し黄み寄り
  };

  return MAP[g] || [255, 190, 170]; // 未分類/その他
}

// contributorsMap から表示名を解決
function resolveDisplayName(contributorsMap, contributorId) {
  const id = (contributorId || "").trim();
  if (!id) return contributorId || "";
  const ent = contributorsMap && contributorsMap[id];
  return (ent && ent.displayName) ? ent.displayName : id;
}

function selectItems(allItems, opts) {
  const {
    totalCount,
    newRatio = 0.3,
    recentDays = 30,
    instagramPerAccountCap = 5,
  } = opts;

  const normalized = (Array.isArray(allItems) ? allItems : [])
    .map((it) => ({
      ...it,
      _updatedAt: toDate(it.updatedAt),
      _key: it.id || it.link,
    }))
    .filter((it) => it.contributor && it.title && it.link && it._key);

  if (normalized.length === 0) return [];

  // Instagram 制限（1アカウント5投稿）
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

  // Contributors 数 M
  const contributors = new Set(items.map((x) => x.contributor)).size || 1;

  // 新しめ候補
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

  // 自動 cap 計算
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

  // 足りない場合は緩める（場を埋める）
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

// ★ここが肝：今この瞬間にリンクが許可されているかを毎回読む
function isLinksEnabled() {
  return document.body?.dataset?.enableLinks === "true";
}

export function createKolloidSketch(options = {}) {
  // 起動時の値も受け取るが、実際の挙動は isLinksEnabled() を優先する
  const {
    enableLinks: initialEnableLinks = false,
    contributorsMap = {}, // BaseLayout から渡す（displayName解決用）
  } = options;

  return (p) => {
    const particles = [];
    let items = [];
    let hovered = null;

    // ★スマホ用：タップで固定＆情報表示する選択状態
    let selected = null;

    // ★ヘッダー領域（ロゴ＋メニュー）を「粒子操作の禁止ゾーン」にする
    let headerRect = null;

    function refreshHeaderRect() {
      const el = document.querySelector("header.site-header");
      headerRect = el ? el.getBoundingClientRect() : null;
    }

    function isInHeader(mx, my) {
      if (!headerRect) refreshHeaderRect();
      if (!headerRect) return false;
      return (
        mx >= headerRect.left &&
        mx <= headerRect.right &&
        my >= headerRect.top &&
        my <= headerRect.bottom
      );
    }

    function isTouchDevice() {
      return ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
    }

    function biasedRandom(min, max, power = 2.4) {
      const u = Math.random();              // 0..1
      const t = Math.pow(u, power);         // 0 側に寄る
      return min + (max - min) * t;
    }

    function mixSize({
      min, max,               // 通常レンジ（半径）
      power = 2.4,            // 通常の小さめ寄り具合
      bigChance,              // 特大が出る確率
      bigMin, bigMax,         // 特大レンジ（半径）
      bigPower = 0.8,         // 特大側の分布（<1 で上側に寄せやすい）
    } = {}) {
      // 特大の“出会い”
      if (Math.random() < bigChance) {
        return biasedRandom(bigMin, bigMax, bigPower);
      }
      // 通常
      return biasedRandom(min, max, power);
    }

    class Particle {
      constructor(item) {
        this.item = item; // item=null の場合はダミー粒子
        this.reset(true);
      }

      reset(first = false) {
        this.x = p.random(p.width);
        this.y = p.random(p.height);
        
        const isTouch = isTouchDevice();

        this.r = isTouch
          ? mixSize({
              min: 15, max: 25,
              power: 2.6,          // 小さめ多め
              bigChance: 0.05,     // 5%だけ特大
              bigMin: 26, bigMax: 30, // 特大（半径）→ 直径52〜68
              bigPower: 0.9,       // 特大側はやや大きめ寄り
            })
          : mixSize({
              min: 10, max: 40,
              power: 1.0,
              bigChance: 0.04,
              bigMin: 41, bigMax: 55, // PC特大（半径）→ 直径82〜110
              bigPower: 0.9,
            });

        // 速度は控えめ（冬の海水浴場の静けさ）
        this.vx = p.random(-0.3, 0.3);
        this.vy = p.random(-0.3, 0.3);

        this.alpha = p.random(60, 120);

        if (first) {
          this.x = p.random(p.width * 0.1, p.width * 0.9);
          this.y = p.random(p.height * 0.15, p.height * 0.9);
        }
      }

      resume() {
        // 固定解除時、少しだけ漂わせる
        this.vx = p.random(-0.25, 0.25);
        this.vy = p.random(-0.25, 0.25);
      }

      freeze() {
        this.vx = 0;
        this.vy = 0;
      }

      update() {
        // 選択中は停止
        if (this === selected && isTouchDevice()) return;

        this.x += this.vx;
        this.y += this.vy;

        // ★ヘッダー禁止ゾーンに入ったら、静かに下へ押し戻す（headerに行かない）
        if (headerRect) {
          const inHeaderNow =
            this.x >= headerRect.left &&
            this.x <= headerRect.right &&
            this.y >= headerRect.top &&
            this.y <= headerRect.bottom;

          if (inHeaderNow) {
            this.y = headerRect.bottom + this.r + p.random(6, 18);
            if (this.vy < 0) this.vy = Math.abs(this.vy) + 0.05;
          }
        }

        if (
          this.x < -50 ||
          this.x > p.width + 50 ||
          this.y < -50 ||
          this.y > p.height + 50
        ) {
          this.reset();
        }
      }

      draw() {
        // ★ジャンル色：データ粒子のみ
        const [rr, gg, bb] = this.item
          ? genreColor(this.item.genre)
          : [255, 190, 170];

        // 選択中の粒子は“ほんの少し”存在感（競争にならない程度）
        const isSelected = this === selected && isTouchDevice();

        if (isSelected) {
          p.stroke(rr, gg, bb, 120);
          p.strokeWeight(1.2);
        } else {
          p.noStroke();
        }

        p.fill(rr, gg, bb, this.alpha);
        p.circle(this.x, this.y, this.r * 2);
      }

      hitTest(mx, my) {
        const dx = mx - this.x;
        const dy = my - this.y;

        // タッチ端末は当たり判定を広げる（指サイズ対策）
        const isTouch = isTouchDevice();

        // 最低でも 26px くらいは欲しい（指が乗る面積）
        const extra = isTouch ? 18 : 0;

        const rr = this.r + extra;
        return dx * dx + dy * dy <= rr * rr;
      }
    }

    function resolveOverlaps() {
      const padding = 4;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          let dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = a.r + b.r + padding;
          if (dist === 0) dist = 0.01;
          if (dist < minDist) {
            const overlap = (minDist - dist) / 2;
            const ux = dx / dist;
            const uy = dy / dist;
            a.x -= ux * overlap * 0.5;
            a.y -= uy * overlap * 0.5;
            b.x += ux * overlap * 0.5;
            b.y += uy * overlap * 0.5;
          }
        }
      }
    }

    async function loadItems() {
      const res = await fetch("/data/particles.json", { cache: "no-store" });
      if (!res.ok) throw new Error("particles.json fetch failed");
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    }

    function buildDummyParticles() {
      particles.length = 0;
      selected = null;
      hovered = null;

      const count = targetCount();
      for (let i = 0; i < count; i++) {
        particles.push(new Particle(null));
      }
    }

    function rebuildDataParticles() {
      particles.length = 0;
      selected = null;
      hovered = null;

      const selectedItems = selectItems(items, {
        totalCount: targetCount(),
        newRatio: 0.3,
        recentDays: 30,
        instagramPerAccountCap: 5,
      });

      for (const it of selectedItems) particles.push(new Particle(it));
    }

    function drawTooltipOrCard(it, mx, my) {
      if (!it) return;

      const title = it.title ?? "";
      const contributorName = resolveDisplayName(contributorsMap, it.contributor);
      const genre = it.genre ?? "";

      // 表示形式：
      // タイトル：{title}
      // 制作者：{displayName}
      // ジャンル：{genre}
      const line1 = `タイトル：${title}`;
      const line2 = `制作者：${contributorName}`;
      const line3 = `ジャンル：${genre || "—"}`;

      p.push();
      p.textAlign(p.LEFT, p.TOP);
      p.textSize(12);

      const pad = 10;
      const w =
        Math.max(p.textWidth(line1), p.textWidth(line2), p.textWidth(line3)) +
        pad * 2;
      const h = pad * 2 + 46;

      let x = mx + 14;
      let y = my + 14;

      if (x + w > p.width) x = p.width - w - 10;
      if (y + h > p.height) y = p.height - h - 10;

      p.noStroke();
      p.fill(255, 255, 255, 230);
      p.rect(x, y, w, h, 12);

      p.fill(40);
      p.text(line1, x + pad, y + pad);

      p.fill(70);
      p.text(line2, x + pad, y + pad + 16);

      p.fill(90);
      p.text(line3, x + pad, y + pad + 32);

      p.pop();
    }

    function findHitParticle(mx, my) {
      for (let i = particles.length - 1; i >= 0; i--) {
        if (particles[i].hitTest(mx, my)) return particles[i];
      }
      return null;
    }

    function openParticleLink(ptl) {
      const url = ptl?.item?.link;
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    }

    p.setup = () => {
      const container = document.getElementById("canvas-container");
      const canvas = p.createCanvas(window.innerWidth, window.innerHeight);
      canvas.parent(container);
      p.frameRate(30);

      refreshHeaderRect(); // ★追加（ヘッダー領域の確定）

      // 起動時点で enableLinks が true ならデータ粒子、falseならダミー
      if (initialEnableLinks) {
        loadItems()
          .then((data) => {
            items = data;
            rebuildDataParticles();
          })
          .catch((e) => {
            console.error(e);
            buildDummyParticles();
          });
      } else {
        buildDummyParticles();
      }
    };

    p.windowResized = () => {
      p.resizeCanvas(window.innerWidth, window.innerHeight);
      refreshHeaderRect(); // ★追加

      // 形だけは維持
      if (initialEnableLinks) rebuildDataParticles();
      else buildDummyParticles();
    };

    // PC：ホバー
    p.mouseMoved = () => {
      // リンクOFF時は何もしない
      if (!isLinksEnabled()) {
        hovered = null;
        p.cursor("default");
        return;
      }

      // ★ヘッダー上では粒子を触らない（カーソルも戻す）
      if (isInHeader(p.mouseX, p.mouseY)) {
        hovered = null;
        p.cursor("default");
        return;
      }

      // タッチ端末では mouseMoved を頼りにしない
      if (isTouchDevice()) {
        hovered = null;
        p.cursor("default");
        return;
      }

      hovered = findHitParticle(p.mouseX, p.mouseY);
      p.cursor(hovered?.item?.link ? "pointer" : "default");
    };

    // PC：クリックで開く
    p.mouseClicked = () => {
      if (!isLinksEnabled()) return;
      if (isTouchDevice()) return;

      // ★ヘッダー上では粒子リンクを発火させない（二重発火防止）
      if (isInHeader(p.mouseX, p.mouseY)) return;

      const url = hovered?.item?.link;
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    };

    // スマホ：タップで「止めて情報表示」→ 同じ粒子をもう一度タップで開く
    p.touchStarted = () => {
      // 画面スクロールを邪魔しないため、リンクOFFなら何もしない
      if (!isLinksEnabled()) return true;

      // タップ地点（touches[0]）で判定
      const t = p.touches && p.touches[0];
      const mx = t ? t.x : p.mouseX;
      const my = t ? t.y : p.mouseY;

      // ★ヘッダー上では粒子を触らない（リンク二重発火防止）
      if (isInHeader(mx, my)) return true;

      const hit = findHitParticle(mx, my);

      // 何も当たらなければ選択解除（漂い再開）
      if (!hit) {
        if (selected) {
          selected.resume();
          selected = null;
        }
        return true; // スクロール等を妨げない
      }

      // ダミー粒子は選択だけ（リンクなし）
      if (!hit.item) {
        if (selected && selected !== hit) selected.resume();
        selected = hit;
        selected.freeze();
        return false; // タップ消費（誤作動防止）
      }

      // 当たった粒子が「すでに選択中」なら開く
      if (selected === hit) {
        openParticleLink(hit);
        return false;
      }

      // 別の粒子を選択：前の選択を解除 → 新しい粒子を固定
      if (selected && selected !== hit) selected.resume();
      selected = hit;
      selected.freeze();

      return false; // ★タップイベント消費（誤作動防止）
    };

    p.draw = () => {
      // ★数フレームに一回だけ更新（毎フレームでも可）
      if (p.frameCount % 15 === 0) refreshHeaderRect();

      p.background(247, 245, 242);

      for (const ptl of particles) ptl.update();
      for (let i = 0; i < 3; i++) resolveOverlaps();
      for (const ptl of particles) ptl.draw();

      // PC：ホバーで表示
      if (!isTouchDevice() && isLinksEnabled() && hovered?.item) {
        drawTooltipOrCard(hovered.item, p.mouseX, p.mouseY);
      }

      // スマホ：選択中の粒子に情報表示（粒子の近く）
      if (isTouchDevice() && isLinksEnabled() && selected?.item) {
        drawTooltipOrCard(selected.item, selected.x, selected.y);
      }
    };
  };
}
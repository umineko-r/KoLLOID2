// public/js/kolloid-particles.js
// 更新情報JSONを読み込み、粒子として表示する版（自動cap対応）
// - enableLinks=true: JSON粒子（リンク/hoverあり）
// - enableLinks=false: ダミー粒子（リンク/hoverなし）
//
// ★重要：enableLinks は「起動時固定」ではなく、bodyのdata属性を毎回参照して強制的に反映する
console.log("[kolloid] particles.js loaded v=20260128-merge-igcap12");

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

// contributorsMap から表示名を解決
function matchesWhen(item, when) {
  if (!when) return true;

  // genre 条件
  if (when.genre) {
    const allow = Array.isArray(when.genre) ? when.genre : [when.genre];
    if (!allow.includes(item?.genre)) return false;
  }

  // siteType 条件
  if (when.siteType) {
    const allow = Array.isArray(when.siteType) ? when.siteType : [when.siteType];
    if (!allow.includes(item?.siteType)) return false;
  }

  // account 条件（instagram 等）
  if (when.account) {
    const allow = Array.isArray(when.account) ? when.account : [when.account];
    if (!allow.includes(item?.account)) return false;
  }

  return true;
}

// contributorsMap から表示名を解決（複数名にも対応）
function resolveDisplayName(contributorsMap, contributorId) {
  const id = (contributorId || "").trim();
  if (!id) return contributorId || "";

  const ent = contributorsMap && contributorsMap[id];
  if (!ent) return id; // 未登録ならIDを返す（空欄にしない）

  // 1) 旧形式: displayName: "海猫"
  if (typeof ent.displayName === "string" && ent.displayName.trim()) {
    return ent.displayName.trim();
  }

  // 2) 新形式候補: displayName: ["海猫","ウミネコ"] みたいな配列
  if (Array.isArray(ent.displayName) && ent.displayName.length) {
    const names = ent.displayName.map((s) => String(s).trim()).filter(Boolean);
    return names.length ? names.join(" / ") : id;
  }

  // 3) 新形式候補: names: { main: "...", aliases: ["..."] }
  if (ent.names && typeof ent.names === "object") {
    const main = typeof ent.names.main === "string" ? ent.names.main.trim() : "";
    const aliases = Array.isArray(ent.names.aliases)
      ? ent.names.aliases.map((s) => String(s).trim()).filter(Boolean)
      : [];
    if (main && aliases.length) return `${main} / ${aliases.join(" / ")}`;
    if (main) return main;
    if (aliases.length) return aliases.join(" / ");
  }

  // 4) 新形式候補: displayNames: ["..."] など
  if (Array.isArray(ent.displayNames) && ent.displayNames.length) {
    const names = ent.displayNames.map((s) => String(s).trim()).filter(Boolean);
    return names.length ? names.join(" / ") : id;
  }

  return id;
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
    instagramPerAccountCap = 12, // ★cap=12
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
  const ig = normalized.filter((it) => (it.siteType || "").toLowerCase() === "instagram");
  const nonIg = normalized.filter((it) => (it.siteType || "").toLowerCase() !== "instagram");

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

  // Contributors 数
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

  // contributor 偏り抑制（ここは従来どおり）
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

// ★今この瞬間にリンクが許可されているかを毎回読む
function isLinksEnabled() {
  return document.body?.dataset?.enableLinks === "true";
}

export function createKolloidSketch(options = {}) {
  const {
    enableLinks: initialEnableLinks = false,
    contributorsMap = {},
  } = options;

  return (p) => {
    const particles = [];
    let items = [];
    let hovered = null;

    // スマホ用：タップで固定＆下部パネル表示
    let selected = null;

    // ヘッダー領域（ロゴ＋メニュー）を「粒子操作の禁止ゾーン」にする
    let headerRect = null;

    // 下部パネル領域（スマホのみ）
    let panelRect = null;
    let panelEl = null;

    function isTouchDevice() {
      return "ontouchstart" in window || navigator.maxTouchPoints > 0;
    }

    function refreshHeaderRect() {
      const el = document.querySelector("header.site-header");
      headerRect = el ? el.getBoundingClientRect() : null;
    }

    function refreshPanelRect() {
      const el = document.getElementById("kolloid-panel");
      panelRect = el ? el.getBoundingClientRect() : null;
    }

    function isInRect(rect, mx, my) {
      if (!rect) return false;
      return mx >= rect.left && mx <= rect.right && my >= rect.top && my <= rect.bottom;
    }

    function isInHeader(mx, my) {
      if (!headerRect) refreshHeaderRect();
      return isInRect(headerRect, mx, my);
    }

    function isInPanel(mx, my) {
      if (!panelRect) refreshPanelRect();
      return isInRect(panelRect, mx, my);
    }

    function biasedRandom(min, max, power = 2.4) {
      const u = Math.random();
      const t = Math.pow(u, power);
      return min + (max - min) * t;
    }

    function mixSize({
      min,
      max,
      power = 2.4,
      bigChance = 0.05,
      bigMin,
      bigMax,
      bigPower = 0.9,
    } = {}) {
      if (Math.random() < bigChance) return biasedRandom(bigMin, bigMax, bigPower);
      return biasedRandom(min, max, power);
    }

    function clearSelection(resume = false) {
      if (selected && resume) selected.resume();
      selected = null;
      showPanelForItem(null);
    }

    function ensurePanel() {
      if (!isTouchDevice()) return null;

      const existing = document.getElementById("kolloid-panel");
      if (existing) {
        panelEl = existing;
        return panelEl;
      }

      const el = document.createElement("div");
      el.id = "kolloid-panel";
      el.setAttribute("aria-live", "polite");
      el.style.cssText = `
        position: fixed;
        left: 14px;
        right: 14px;
        bottom: 14px;
        z-index: 40;
        display: none;

        background: rgba(255,255,255,0.94);
        border: 1px solid rgba(0,0,0,0.08);
        border-radius: 14px;
        box-shadow: 0 10px 24px rgba(0,0,0,0.12);
        padding: 12px 12px 10px;

        text-align: left;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #333;
      `;

      // ★重要：stopPropagation のみ（preventDefault しない）
      const stopOnly = (e) => {
        e.stopPropagation();
      };
      el.addEventListener("touchstart", stopOnly, { passive: true });
      el.addEventListener("pointerdown", stopOnly, { passive: true });

      el.innerHTML = `
        <div id="kolloid-panel-title" style="
          font-size: 0.95rem;
          font-weight: 600;
          line-height: 1.3;
          margin: 0 0 6px 0;
          color: #333;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        "></div>

        <div id="kolloid-panel-meta" style="
          font-size: 0.82rem;
          color: #666;
          line-height: 1.35;
          margin: 0 0 10px 0;
        "></div>

        <div style="display:flex; gap:10px; justify-content:flex-end;">
          <button id="kolloid-panel-open" type="button" style="
            appearance: none;
            border: 1px solid rgba(0,0,0,0.12);
            background: rgba(255,255,255,0.9);
            border-radius: 10px;
            padding: 8px 10px;
            font-size: 0.9rem;
            color: #333;
          ">開く</button>

          <button id="kolloid-panel-close" type="button" style="
            appearance: none;
            border: 1px solid rgba(0,0,0,0.10);
            background: rgba(0,0,0,0.03);
            border-radius: 10px;
            padding: 8px 10px;
            font-size: 0.9rem;
            color: #444;
          ">閉じる</button>
        </div>
      `;

      document.body.appendChild(el);
      panelEl = el;
      refreshPanelRect();

      const openBtn = el.querySelector("#kolloid-panel-open");
      const closeBtn = el.querySelector("#kolloid-panel-close");

      if (openBtn) {
        openBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          // ★ここで selected を解除しない（=パネルは閉じない）
          if (selected?.item?.link) {
            window.open(selected.item.link, "_blank", "noopener,noreferrer");
          }
        });
      }

      if (closeBtn) {
        closeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          clearSelection(true);
        });
      }

      return panelEl;
    }

    function showPanelForItem(it) {
      if (!isTouchDevice()) return;
      if (!isLinksEnabled()) return;

      const el = ensurePanel();
      if (!el) return;

      if (!it) {
        el.style.display = "none";
        refreshPanelRect();
        return;
      }

      const titleEl = el.querySelector("#kolloid-panel-title");
      const metaEl = el.querySelector("#kolloid-panel-meta");
      const openBtn = el.querySelector("#kolloid-panel-open");

      const title = it.title ?? "";
      const contributorName = resolveDisplayName(contributorsMap, it);
      const genre = it.genre ?? "—";

      if (titleEl) titleEl.textContent = title;
      if (metaEl) metaEl.textContent = `制作者：${contributorName} / ジャンル：${genre}`;

      if (openBtn) {
        const disabled = !it.link;
        openBtn.disabled = disabled;
        openBtn.style.opacity = disabled ? "0.4" : "1";
      }

      el.style.display = "block";
      refreshPanelRect();
    }

    class Particle {
      constructor(item) {
        this.item = item;
        this.reset(true);
      }

      reset(first = false) {
        this.x = p.random(p.width);
        this.y = p.random(p.height);

        const touch = isTouchDevice();

        this.r = touch
          ? mixSize({
              min: 15,
              max: 25,
              power: 2.6,
              bigChance: 0.05,
              bigMin: 26,
              bigMax: 30,
              bigPower: 0.9,
            })
          : mixSize({
              min: 10,
              max: 40,
              power: 1.0,
              bigChance: 0.04,
              bigMin: 41,
              bigMax: 55,
              bigPower: 0.9,
            });

        // 速度は控えめ
        this.vx = p.random(-0.3, 0.3);
        this.vy = p.random(-0.3, 0.3);
        this.alpha = p.random(60, 120);

        if (first) {
          this.x = p.random(p.width * 0.1, p.width * 0.9);
          this.y = p.random(p.height * 0.15, p.height * 0.9);
        }
      }

      resume() {
        this.vx = p.random(-0.25, 0.25);
        this.vy = p.random(-0.25, 0.25);
      }

      freeze() {
        this.vx = 0;
        this.vy = 0;
      }

      update() {
        if (this === selected && isTouchDevice()) return;

        this.x += this.vx;
        this.y += this.vy;

        // ヘッダー禁止ゾーンに入ったら下へ押し戻す
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
        const [rr, gg, bb] = this.item ? genreColor(this.item.genre) : [255, 190, 170];
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

        // タッチ端末は当たり判定を広げる
        const extra = isTouchDevice() ? 18 : 0;
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
      const urls = [
        "/data/particles.json",    // 自動収集
        "/data/particles-m.json",  // 手動管理
      ];

      const results = await Promise.all(
        urls.map(async (url) => {
          try {
            const res = await fetch(url, { cache: "no-store" });
            if (!res.ok) return [];
            const data = await res.json();
            return Array.isArray(data) ? data : [];
          } catch {
            return [];
          }
        })
      );

      const merged = results.flat();

      // id or link で重複排除（安全側）
      const byKey = new Map();
      for (const it of merged) {
        const key = it.id || it.link;
        if (!key) continue;
        byKey.set(key, it);
      }

      return [...byKey.values()];
    }

    function buildDummyParticles() {
      particles.length = 0;
      hovered = null;
      clearSelection(false);

      const count = targetCount();
      for (let i = 0; i < count; i++) particles.push(new Particle(null));
    }

    function rebuildDataParticles() {
      particles.length = 0;
      hovered = null;
      clearSelection(false);

      const selectedItems = selectItems(items, {
        totalCount: targetCount(),
        newRatio: 0.3,
        recentDays: 30,
        instagramPerAccountCap: 12, // ★cap=12を渡す
      });

      for (const it of selectedItems) particles.push(new Particle(it));
    }

    function drawTooltip(it, mx, my) {
      if (!it) return;

      const title = it.title ?? "";
      const contributorName = resolveDisplayName(contributorsMap, it.contributor);
      const genre = it.genre ?? "";

      const line1 = `タイトル：${title}`;
      const line2 = `制作者：${contributorName}`;
      const line3 = `ジャンル：${genre || "—"}`;

      p.push();
      p.textAlign(p.LEFT, p.TOP);
      p.textSize(12);

      const pad = 10;
      const w =
        Math.max(p.textWidth(line1), p.textWidth(line2), p.textWidth(line3)) + pad * 2;
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

    p.setup = () => {
      const container = document.getElementById("canvas-container");
      const canvas = p.createCanvas(window.innerWidth, window.innerHeight);
      canvas.parent(container);
      p.frameRate(30);

      refreshHeaderRect();
      refreshPanelRect();
      if (isTouchDevice()) ensurePanel();

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
      refreshHeaderRect();
      refreshPanelRect();

      if (initialEnableLinks) rebuildDataParticles();
      else buildDummyParticles();
    };

    // PC：ホバー
    p.mouseMoved = () => {
      if (!isLinksEnabled()) {
        hovered = null;
        p.cursor("default");
        return;
      }

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
      if (isInHeader(p.mouseX, p.mouseY)) return;

      const url = hovered?.item?.link;
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    };

    // スマホ：タップで選択→下部パネルに表示
    p.touchStarted = () => {
      // スクロールを邪魔しないため、リンクOFFなら何もしない
      if (!isLinksEnabled()) return true;

      const t = p.touches && p.touches[0];
      const mx = t ? t.x : p.mouseX;
      const my = t ? t.y : p.mouseY;

      // ヘッダー/パネル上は触らない（貫通対策）
      if (isInHeader(mx, my) || isInPanel(mx, my)) return true;

      const hit = findHitParticle(mx, my);

      if (!hit) {
        clearSelection(true);
        return true;
      }

      // ダミー粒子
      if (!hit.item) {
        if (selected && selected !== hit) selected.resume();
        selected = hit;
        selected.freeze();
        showPanelForItem(null);
        return false;
      }

      // 同じ粒子を再タップしても「開く」はボタンで行う（= ここでは何もしない）
      if (selected === hit) return false;

      // 別の粒子へ
      if (selected && selected !== hit) selected.resume();
      selected = hit;
      selected.freeze();

      showPanelForItem(hit.item);

      return false;
    };

    p.draw = () => {
      // リンクOFFならパネルを消す
      if (!isLinksEnabled() && panelEl) showPanelForItem(null);

      // ときどきDOMの位置を更新
      if (p.frameCount % 15 === 0) {
        refreshHeaderRect();
        refreshPanelRect();
      }

      p.background(247, 245, 242);

      for (const ptl of particles) ptl.update();
      for (let i = 0; i < 3; i++) resolveOverlaps();
      for (const ptl of particles) ptl.draw();

      // PCのみ：ホバーでツールチップ
      if (!isTouchDevice() && isLinksEnabled() && hovered?.item) {
        drawTooltip(hovered.item, p.mouseX, p.mouseY);
      }
    };
  };
}
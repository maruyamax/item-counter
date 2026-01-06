import { SHOPS } from "./shops.js";

/* =====================
   State & DB
===================== */

let state = {
  activeShop: SHOPS[0].id,
  showRevenue: false,
  shops: {},
};

SHOPS.forEach((s) => {
  state.shops[s.id] = { sold: {} };
});

const DB_NAME = "event-counter";
const STORE = "state";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadState() {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get("state");
    req.onsuccess = () => resolve(req.result || state);
  });
}

async function saveState() {
  const db = await openDB();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(state, "state");
}

/* =====================
   Helpers
===================== */

function currentShopDef() {
  return SHOPS.find((s) => s.id === state.activeShop);
}

function currentShopState() {
  return state.shops[state.activeShop];
}

function soldCount(productId, shopId = state.activeShop) {
  return state.shops[shopId].sold[productId] || 0;
}

function remainingStock(product) {
  return product.stock - soldCount(product.id);
}

function masked(value) {
  return state.showRevenue ? `¥${value}` : "¥•••••";
}

/* =====================
   Business Logic
===================== */

function increment(product) {
  if (remainingStock(product) <= 0) return;
  currentShopState().sold[product.id] = soldCount(product.id) + 1;
  saveState();
  render();
}

function decrement(product) {
  if (soldCount(product.id) <= 0) return;
  currentShopState().sold[product.id]--;
  saveState();
  render();
}

function revenueByShop(shopId) {
  const shopDef = SHOPS.find((s) => s.id === shopId);
  const shopState = state.shops[shopId];

  return shopDef.products.reduce((sum, p) => {
    return sum + (shopState.sold[p.id] || 0) * p.price;
  }, 0);
}

function totalRevenue() {
  return SHOPS.reduce((sum, s) => sum + revenueByShop(s.id), 0);
}

/* =====================
   JSON Backup
===================== */

function exportJSON() {
  const data = {
    exportedAt: new Date().toISOString(),
    shops: SHOPS.map((shop) => ({
      id: shop.id,
      name: shop.name,
      products: shop.products.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        stock: p.stock,
        price: p.price,
        sold: state.shops[shop.id].sold[p.id] || 0,
      })),
      revenue: revenueByShop(shop.id),
    })),
    totalRevenue: totalRevenue(),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "event-backup.json";
  a.click();
}

/* =====================
   Render
===================== */

function render() {
  const root = document.getElementById("app");
  root.innerHTML = "";

  /* ===== Shop Switcher ===== */
  const shopSwitcher = document.createElement("div");
  shopSwitcher.className = "shop-switcher";

  SHOPS.forEach((shop) => {
    const btn = document.createElement("button");
    btn.className = `shop-tab ${
      shop.id === state.activeShop ? "is-active" : ""
    }`;
    btn.textContent = shop.name;
    btn.onclick = () => {
      state.activeShop = shop.id;
      saveState();
      render();
    };
    shopSwitcher.appendChild(btn);
  });

  root.appendChild(shopSwitcher);

  /* ===== Controls ===== */
  const controls = document.createElement("div");
  controls.className = "controls";

  const toggleRevenue = document.createElement("button");
  toggleRevenue.className = `toggle-revenue ${
    state.showRevenue ? "is-visible" : "is-masked"
  }`;
  toggleRevenue.textContent = `売上 ${state.showRevenue ? "非表示" : "表示"}`;
  toggleRevenue.onclick = () => {
    state.showRevenue = !state.showRevenue;
    saveState();
    render();
  };

  const backupBtn = document.createElement("button");
  backupBtn.className = "backup-button";
  backupBtn.textContent = ""; // jsonバックアップ
  backupBtn.onclick = exportJSON;

  controls.append(toggleRevenue, backupBtn);

  /* ===== Revenue (always rendered) ===== */
  const revenue = document.createElement("div");
  revenue.className = `revenue ${
    state.showRevenue ? "is-visible" : "is-masked"
  }`;

  SHOPS.forEach((s) => {
    const item = document.createElement("div");
    item.className = "revenue-item";
    item.textContent = `${s.name}: ${masked(revenueByShop(s.id))}`;
    revenue.appendChild(item);
  });

  const total = document.createElement("div");
  total.className = "revenue-total";
  total.textContent = `合計: ${masked(totalRevenue())}`;

  revenue.appendChild(total);
  controls.appendChild(revenue);

  root.appendChild(controls);

  /* ===== Products ===== */
  const productsRoot = document.createElement("div");
  productsRoot.className = "products";

  const shop = currentShopDef();
  const grouped = groupByCategory(shop.products);

  Object.entries(grouped).forEach(([category, items]) => {
    const section = document.createElement("section");
    section.className = "category";

    const title = document.createElement("h3");
    title.className = "category-title";
    title.textContent = category;
    section.appendChild(title);

    const available = [];
    const soldOut = [];

    items.forEach((p) => {
      remainingStock(p) === 0 ? soldOut.push(p) : available.push(p);
    });

    [...available, ...soldOut].forEach((p) => {
      const sold = soldCount(p.id);
      const remaining = remainingStock(p);
      const isSoldOut = remaining === 0;

      const product = document.createElement("div");
      product.className = `product ${isSoldOut ? "product--soldout" : ""}`;

      product.innerHTML = `
        <div class="product-name">${p.name}</div>
        <div class="product-stats">
          <span class="stat stat-stock">用意:${p.stock}</span>
          <span class="stat stat-sold">売:${sold}</span>
          <span class="stat stat-remaining">在庫:${remaining}</span>
        </div>
        <div class="counter">
          <button type="button" class="counter-button minus" ${
            sold === 0 ? "disabled" : ""
          }></button>
          <button type="button" class="counter-button plus" ${
            isSoldOut ? "disabled" : ""
          }></button>
          ${isSoldOut ? `<span class="soldout-label">売り切れ</span>` : ""}
        </div>
      `;

      product.querySelector(".minus").onclick = () => decrement(p);
      product.querySelector(".plus").onclick = () => increment(p);

      section.appendChild(product);
    });

    productsRoot.appendChild(section);
  });

  root.appendChild(productsRoot);
}

function groupByCategory(products) {
  return products.reduce((acc, p) => {
    acc[p.category] ||= [];
    acc[p.category].push(p);
    return acc;
  }, {});
}

/* =====================
   Init
===================== */

(async function init() {
  const loaded = await loadState();
  state = { ...state, ...loaded };
  render();
})();

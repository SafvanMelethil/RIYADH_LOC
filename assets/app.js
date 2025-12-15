
(() => {
  const DATA = (window.__UPC_DATA__ || []);
  const scanInput = document.getElementById("scanInput");
  const searchInput = document.getElementById("searchInput");
  const suggestBox = document.getElementById("suggestBox");

  const dot = document.getElementById("dot");
  const statusText = document.getElementById("statusText");

  const rMaterial = document.getElementById("rMaterial");
  const rCategory = document.getElementById("rCategory");
  const rDesc = document.getElementById("rDesc");
  const rZone = document.getElementById("rZone");
  const rBin = document.getElementById("rBin");
  const rCode = document.getElementById("rCode");

  // Build fast lookup maps
  const byBarcode = new Map();      // exact BARCODE_NUMBER
  const byBarcodeNorm = new Map();  // BARCODE_NORM (digits w/o leading zeros OR upper)
  const byMaterialId = new Map();   // material_id
  const searchIndex = [];           // {id, descNorm, label, rec}

  const norm = (s) => String(s ?? "").trim().replace(/[^0-9A-Za-z]/g, "");
  const normDigits = (s) => {
    const t = norm(s);
    if (/^\d+$/.test(t)) return t;
    return t.toUpperCase();
  };
  const stripLeadingZeros = (s) => {
    const t = normDigits(s);
    return /^\d+$/.test(t) ? t.replace(/^0+/, "") : t;
  };

  function setStatus(kind, msg) {
    dot.classList.remove("ok", "bad");
    if (kind === "ok") dot.classList.add("ok");
    if (kind === "bad") dot.classList.add("bad");
    statusText.textContent = msg;
  }

  function showRecord(rec, matchedCode) {
    rMaterial.textContent = rec.MATERIAL_ID || "—";
    rCategory.textContent = rec.CATEGORY || "—";
    rDesc.textContent = rec.MATERIAL_DESCRIPTION || "—";
    rZone.textContent = rec.ZONE || "—";
    rBin.textContent = rec.STORAGE_BIN || "—";
    rCode.textContent = matchedCode || "—";
  }

  function clearSuggest() {
    suggestBox.style.display = "none";
    suggestBox.innerHTML = "";
  }

  // GS1 helpers:
  // If a scan starts with "01" + 14 digits, that's GTIN-14. Example:
  // 010628509500834417270226102485061 -> GTIN14 = 06285095008344
  function extractCandidates(raw) {
    const cleaned = String(raw ?? "").trim();
    if (!cleaned) return [];
    const tokens = cleaned.split(/\s+/).filter(Boolean);

    const candidates = new Set();

    const add = (x) => { if (x && String(x).trim()) candidates.add(String(x).trim()); };

    // Add full + tokens
    add(cleaned);
    tokens.forEach(add);

    // For each token, add normalized versions and GS1-extracted GTIN
    for (const t0 of tokens.length ? tokens : [cleaned]) {
      const t = norm(t0);
      if (!t) continue;

      add(t);
      add(stripLeadingZeros(t));

      // If begins with 01 + 14 digits => GTIN14
      if (t.startsWith("01") && t.length >= 16 && /^\d+$/.test(t.slice(0, 16))) {
        const gtin14 = t.slice(2, 16);
        add(gtin14);
        add(gtin14.replace(/^0+/, ""));
      }

      // Some devices include parentheses or AIs in other forms; also try to locate "01" + 14 digits anywhere
      const m = t.match(/01(\d{14})/);
      if (m) {
        add(m[1]);
        add(m[1].replace(/^0+/, ""));
      }
    }

    return Array.from(candidates);
  }

  function findByCode(raw) {
    const candidates = extractCandidates(raw);

    for (const c of candidates) {
      const c1 = normDigits(c);
      const c2 = stripLeadingZeros(c);
      if (byBarcode.has(c1)) return { rec: byBarcode.get(c1), matched: c };
      if (byBarcodeNorm.has(c2)) return { rec: byBarcodeNorm.get(c2), matched: c };
      if (byBarcodeNorm.has(c1)) return { rec: byBarcodeNorm.get(c1), matched: c };
    }

    return null;
  }

  function init() {
    // Fill maps
    for (const rec of DATA) {
      const bc = normDigits(rec.BARCODE_NUMBER);
      const bcN = stripLeadingZeros(rec.BARCODE_NUMBER);
      const mid = String(rec.MATERIAL_ID ?? "").trim();

      if (bc) byBarcode.set(bc, rec);
      if (bcN) byBarcodeNorm.set(bcN, rec);
      if (mid) byMaterialId.set(mid, rec);

      const label = `${rec.MATERIAL_DESCRIPTION} — ${rec.MATERIAL_ID} • ${rec.CATEGORY} • ${rec.ZONE}/${rec.STORAGE_BIN}`;
      searchIndex.push({
        descNorm: String(rec.DESC_NORM ?? rec.MATERIAL_DESCRIPTION ?? "").toUpperCase(),
        label,
        rec
      });
    }

    setStatus("ok", `Ready. Loaded ${DATA.length.toLocaleString()} materials.`);
    scanInput.value = "";
    scanInput.focus({ preventScroll: true });
  }

  // --- Scan input handling (scanner device) ---
  let scanBuffer = "";
  let scanTimer = null;

  function processScan(value) {
    const raw = String(value ?? "").trim();
    if (!raw) return;

    const hit = findByCode(raw);
    if (hit) {
      showRecord(hit.rec, hit.matched);
      setStatus("ok", "Found.");
    } else {
      showRecord({ MATERIAL_ID: "", CATEGORY: "", MATERIAL_DESCRIPTION: "", ZONE: "", STORAGE_BIN: "" }, raw);
      setStatus("bad", "Not found. Use Search to select material.");
    }

    // Reset & keep always active
    scanInput.value = "";
    scanInput.focus({ preventScroll: true });
  }

  // Many scanners send keystrokes fast + Enter.
  // We'll handle both Enter-based and timeout-based scans.
  scanInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const v = scanInput.value;
      processScan(v);
      return;
    }
  });

  scanInput.addEventListener("input", () => {
    // Timeout based: if scanner doesn't send Enter, process after short pause
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(() => {
      const v = scanInput.value;
      // Only process if there's something and it's likely a scan (fast input)
      if (String(v).trim().length >= 4) processScan(v);
    }, 140);
  });

  // Keep scan input focused as much as possible
  document.addEventListener("click", (e) => {
    // If user clicks inside search, allow it.
    const target = e.target;
    if (target === searchInput || suggestBox.contains(target)) return;
    scanInput.focus({ preventScroll: true });
  });

  // --- Search fallback with dropdown suggestions ---
  function renderSuggestions(items) {
    if (!items.length) {
      clearSuggest();
      return;
    }
    suggestBox.innerHTML = "";
    for (const it of items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.innerHTML = `<div class="sMain">${escapeHtml(it.rec.MATERIAL_DESCRIPTION || "")}</div>
                       <div class="sSub">${escapeHtml(it.rec.MATERIAL_ID || "")} • ${escapeHtml(it.rec.CATEGORY || "")} • ${escapeHtml(it.rec.ZONE || "")}/${escapeHtml(it.rec.STORAGE_BIN || "")}</div>`;
      btn.addEventListener("click", () => {
        showRecord(it.rec, "Manual search");
        setStatus("ok", "Selected from search.");
        searchInput.value = it.rec.MATERIAL_DESCRIPTION || "";
        clearSuggest();
        // return focus to scan input to keep scanning continuous
        setTimeout(() => scanInput.focus({ preventScroll: true }), 50);
      });
      suggestBox.appendChild(btn);
    }
    suggestBox.style.display = "block";
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }

  function doSearch(q) {
    const query = String(q ?? "").trim().toUpperCase();
    if (!query) { clearSuggest(); return; }

    const parts = query.split(/\s+/).filter(Boolean);

    // Find top 25 matches
    const out = [];
    for (const it of searchIndex) {
      let ok = true;
      for (const p of parts) {
        if (!it.descNorm.includes(p)) { ok = false; break; }
      }
      if (ok) out.push(it);
      if (out.length >= 25) break;
    }

    renderSuggestions(out);
  }

  let searchTimer = null;
  searchInput.addEventListener("input", () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => doSearch(searchInput.value), 80);
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      clearSuggest();
      searchInput.value = "";
      setTimeout(() => scanInput.focus({ preventScroll: true }), 50);
    }
  });

  document.addEventListener("keydown", (e) => {
    // Quick shortcut: F2 focuses search
    if (e.key === "F2") {
      e.preventDefault();
      searchInput.focus({ preventScroll: true });
    }
  });

  // Close dropdown if click outside
  document.addEventListener("click", (e) => {
    if (e.target === searchInput || suggestBox.contains(e.target)) return;
    clearSuggest();
  });

  // Init
  init();
})();

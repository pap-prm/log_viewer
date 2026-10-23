/* Фронтенд просмотра логов: список файлов, загрузка хвоста, фильтры, поиск, авто-обновление. */
(function () {
  "use strict";

  const els = {
    fileSelect: document.getElementById("fileSelect"),
    tailSelect: document.getElementById("tailSelect"),
    searchInput: document.getElementById("searchInput"),
    levelFilters: document.getElementById("levelFilters"),
    btnRefresh: document.getElementById("btnRefresh"),
    autoScroll: document.getElementById("autoScroll"),
    status: document.getElementById("status"),
    logView: document.getElementById("logView"),
  };

  let timer = null;
  let loading = false;

  // ---------- Утилиты ----------

  function fmtBytes(b) {
    if (b < 1024) return b + " Б";
    if (b < 1048576) return (b / 1024).toFixed(1) + " КБ";
    return (b / 1048576).toFixed(2) + " МБ";
  }

  function setStatus(msg, isError) {
    els.status.textContent = msg || "";
    els.status.classList.toggle("error", !!isError);
  }

  function selectedLevels() {
    const boxes = els.levelFilters.querySelectorAll("input[type=checkbox]:checked");
    return Array.from(boxes).map((b) => b.value);
  }

  /** Подсветка совпадений поиска внутри уже готового HTML строки (безопасно - только текстовые узлы). */
  function markMatches(container, needle) {
    if (!needle) return;
    const lower = needle.toLowerCase();
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        return n.nodeValue.toLowerCase().includes(lower) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const text = node.nodeValue;
      const frag = document.createDocumentFragment();
      let i = 0, pos;
      const lt = text.toLowerCase();
      while ((pos = lt.indexOf(lower, i)) !== -1) {
        if (pos > i) frag.appendChild(document.createTextNode(text.slice(i, pos)));
        const mark = document.createElement("mark");
        mark.textContent = text.slice(pos, pos + needle.length);
        frag.appendChild(mark);
        i = pos + needle.length;
      }
      if (i < text.length) frag.appendChild(document.createTextNode(text.slice(i)));
      node.parentNode.replaceChild(frag, node);
    }
  }

  // ---------- Загрузка данных ----------

  async function loadFiles() {
    const resp = await fetch("/api/files", { credentials: "same-origin" });
    if (resp.status === 401) { location.href = "/login"; return; }
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const data = await resp.json();
    els.fileSelect.innerHTML = "";
    if (!data.files || data.files.length === 0) {
      setStatus("В папке " + data.logsDir + " нет файлов логов", true);
      return;
    }
    for (const f of data.files) {
      const opt = document.createElement("option");
      opt.value = f.name;
      opt.textContent = f.name + "  (" + fmtBytes(f.size) + ", " + new Date(f.lastModified).toLocaleString("ru-RU") + ")";
      els.fileSelect.appendChild(opt);
    }
  }

  async function loadLog() {
    if (loading) return;
    const file = els.fileSelect.value;
    if (!file) return;
    loading = true;
    els.btnRefresh.disabled = true;
    setStatus("Загрузка " + file + "…");
    try {
      const params = new URLSearchParams();
      params.set("file", file);
      params.set("tail", els.tailSelect.value);
      const levels = selectedLevels();
      if (levels.length > 0) params.set("level", levels.join(","));
      const q = els.searchInput.value.trim();
      if (q) params.set("search", q);

      const resp = await fetch("/api/log?" + params.toString(), { credentials: "same-origin" });
      if (resp.status === 401) { location.href = "/login"; return; }
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || "HTTP " + resp.status);
      }
      const data = await resp.json();
      renderLines(data);
      const shown = data.lines.length;
      setStatus(
        data.file + ": показано " + shown + " строк" +
        (data.truncated ? " (хвост из " + data.totalLines + ")" : "") +
        " · обновлено " + new Date().toLocaleTimeString("ru-RU")
      );
    } catch (e) {
      setStatus("Ошибка: " + e.message, true);
    } finally {
      loading = false;
      els.btnRefresh.disabled = false;
    }
  }

  function renderLines(data) {
    els.logView.innerHTML = "";
    const frag = document.createDocumentFragment();
    for (const ln of data.lines) {
      const div = document.createElement("div");
      div.className = "line lv-" + ln.level;
      const num = document.createElement("span");
      num.className = "ln";
      num.textContent = ln.n;
      const content = document.createElement("span");
      content.className = "lc";
      content.innerHTML = ln.html; // html уже экранирован и подсвечен на сервере
      div.appendChild(num);
      div.appendChild(content);
      frag.appendChild(div);
    }
    if (data.lines.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Нет строк, подходящих под фильтр/поиск";
      frag.appendChild(empty);
    } else {
      markMatches(frag, els.searchInput.value.trim());
    }
    els.logView.appendChild(frag);
    els.logView.scrollTop = els.logView.scrollHeight; // прокрутка к концу (свежие записи)
  }

  // ---------- События ----------

  els.btnRefresh.addEventListener("click", loadLog);
  els.fileSelect.addEventListener("change", loadLog);
  els.tailSelect.addEventListener("change", loadLog);

  let searchDebounce = null;
  els.searchInput.addEventListener("input", () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(loadLog, 400);
  });

  els.levelFilters.addEventListener("change", loadLog);

  els.autoScroll.addEventListener("change", () => {
    if (timer) { clearInterval(timer); timer = null; }
    if (els.autoScroll.checked) {
      timer = setInterval(() => {
        if (!document.hidden && !loading) loadLog();
      }, 10000);
    }
  });

  // Ctrl+R / F5 перехватываем в режиме просмотра? Нет - стандартное поведение оставим.
  document.addEventListener("keydown", (e) => {
    if (e.key === "F5") { /* пусть браузер делает своё дело */ }
  });

  // ---------- Старт ----------

  (async function init() {
    try {
      await loadFiles();
      await loadLog();
    } catch (e) {
      setStatus("Ошибка инициализации: " + e.message, true);
    }
  })();
})();

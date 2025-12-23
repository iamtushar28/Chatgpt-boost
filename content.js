// ==================== SCRIPT INJECTION ====================

// Inject scripts into page context to bypass extension sandbox limits
function attachMonitor() {
  const configScript = document.createElement("script");
  // Load config first so shared globals are available
  configScript.src = chrome.runtime.getURL("monitor-config.js");
  configScript.onload = function () {
    // Cleanup to avoid polluting DOM
    this.remove();

    const fetchScript = document.createElement("script");
    // Separate fetch logic to keep concerns isolated
    fetchScript.src = chrome.runtime.getURL("fetch-monitor.js");
    fetchScript.onload = function () {
      // Remove after execution to reduce footprint
      this.remove();
    };
    (document.head || document.documentElement).appendChild(fetchScript);
  };
  (document.head || document.documentElement).appendChild(configScript);
}

// ==================== THEME SYSTEM ====================

// Centralized theme resolver to stay in sync with ChatGPT UI
function getThemeStyles() {
  // Rely on root class instead of media query for accuracy
  const isDark = document.documentElement.classList.contains("dark");

  return {
    isDark,
    // Semi-transparent to blend with native UI
    panelBg: isDark ? "rgba(0, 0, 0, 0.20)" : "rgba(255, 255, 255, 0.65)",
    textColor: isDark ? "#ffffff" : "#111111",
    borderColor: isDark ? "rgb(49,49,49)" : "#cccccc",
    linkColor: isDark ? "#4da3ff" : "#2a78ff",
  };
}

// Re-apply styles dynamically instead of rebuilding UI
function applyThemeToUI() {
  const T = getThemeStyles();
  const panel = document.querySelector(".chatgpt-api-monitor");
  const toggleBtn = document.querySelector(".chatgpt-api-monitor-toggle");

  // Exit early if UI is not mounted yet
  if (!panel) return;

  // Ensure panel visually matches current theme
  panel.style.backgroundColor = T.panelBg;
  panel.style.border = `1px solid ${T.borderColor}`;
  panel.style.color = T.textColor;

  // Keep toggle consistent when panel is hidden
  if (toggleBtn) {
    toggleBtn.style.backgroundColor = T.panelBg;
    toggleBtn.style.border = `1px solid ${T.borderColor}`;
    toggleBtn.style.color = T.textColor;
  }

  // Header styled separately due to drag behavior
  const header = panel.querySelector(".chatgpt-monitor-header");
  if (header) {
    header.style.borderBottom = `1px solid ${T.borderColor}`;
    header.style.color = T.textColor;
  }

  // Search box needs explicit border to remain visible
  const searchWrap = panel.querySelector(".chatgpt-search-wrap");
  if (searchWrap) {
    searchWrap.style.border = `1px solid ${T.borderColor}`;
  }

  // Force inherited text color to avoid browser defaults
  panel.querySelectorAll("button, input, span").forEach((el) => {
    el.style.color = T.textColor;
  });

  // Link styled manually to keep contrast accessible
  const report = panel.querySelector(".chatgpt-report-link");
  if (report) {
    report.style.color = T.linkColor;
    report.style.borderTop = `1px solid ${T.borderColor}`;
  }
}

// Watch for ChatGPT theme toggles without polling
function observeThemeChanges() {
  const observer = new MutationObserver(() => {
    applyThemeToUI();
  });

  // Only observe class changes to reduce overhead
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
}

// ==================== UI ====================

// Floating toggle avoids permanent UI clutter
function createToggleButton() {
  const T = getThemeStyles();
  const button = document.createElement("button");
  button.className = "chatgpt-api-monitor-toggle";
  button.innerHTML = "Show Chats";

  // Inline styles avoid dependency on external CSS
  Object.assign(button.style, {
    position: "fixed",
    top: "70px",
    right: "10px",
    padding: "8px 16px",
    backgroundColor: T.panelBg,
    backdropFilter: "blur(10px)",
    border: `1px solid ${T.borderColor}`,
    borderRadius: "5px",
    color: T.textColor,
    cursor: "pointer",
    zIndex: "1000",
    fontSize: "14px",
    fontWeight: "500",
  });

  // Single toggle function keeps state simple
  button.onclick = toggleMonitor;
  document.body.appendChild(button);
  // Draggable so it doesn't block ChatGPT controls
  makeDraggable(button);
}

// Toggle instead of destroy to preserve state
function toggleMonitor() {
  const panel = document.querySelector(".chatgpt-api-monitor");
  const toggle = document.querySelector(".chatgpt-api-monitor-toggle");
  if (!panel) return;

  // Visibility-based toggle avoids extra state variables
  const visible = panel.style.display !== "none";
  panel.style.display = visible ? "none" : "block";
  toggle.style.display = visible ? "block" : "none";
}

// Main container built once for performance
function createMonitorDiv() {
  const T = getThemeStyles();
  const div = document.createElement("div");
  div.className = "chatgpt-api-monitor";

  // Fixed positioning keeps it independent of page layout
  Object.assign(div.style, {
    position: "fixed",
    top: "70px",
    right: "10px",
    padding: "10px",
    paddingBottom: "30px",
    backgroundColor: T.panelBg,
    backdropFilter: "blur(10px)",
    border: `1px solid ${T.borderColor}`,
    borderRadius: "5px",
    zIndex: "1000",
    maxWidth: "360px",
    minWidth: "360px",
    fontSize: "14px",
    fontFamily: "system-ui, -apple-system, sans-serif",
    display: "none",
  });

  // Close button improves discoverability vs toggle only
  const closeBtn = document.createElement("button");
  closeBtn.innerHTML = "×";
  Object.assign(closeBtn.style, {
    position: "absolute",
    top: "5px",
    right: "5px",
    background: "transparent",
    border: "none",
    fontSize: "20px",
    cursor: "pointer",
  });
  closeBtn.onclick = toggleMonitor;

  // Header doubles as drag handle to save space
  const header = document.createElement("div");
  header.innerHTML = "My Chats";
  header.className = "chatgpt-monitor-header";
  Object.assign(header.style, {
    fontWeight: "600",
    marginBottom: "6px",
    cursor: "move",
    paddingBottom: "5px",
  });

  // Search wrapper groups icon, input, and clear action
  const searchWrap = document.createElement("div");
  searchWrap.className = "chatgpt-search-wrap";
  Object.assign(searchWrap.style, {
    display: "flex",
    alignItems: "center",
    padding: "6px 10px", //  more vertical padding
    borderRadius: "6px",
    margin: "10px 0",
    height: "36px", //  explicit height
    boxSizing: "border-box",
  });

  // Emoji avoids loading icon assets
  const searchIcon = document.createElement("span");
  searchIcon.innerHTML = "🧐";
  searchIcon.style.marginRight = "1px";

  // Transparent input blends into panel background
  const searchInput = document.createElement("input");
  searchInput.placeholder = "Search chat...";
  Object.assign(searchInput.style, {
    flex: "1",
    background: "transparent",
    border: "none",
    outline: "none",
    fontSize: "14px",
    height: "100%", //  fill search bar height
    lineHeight: "20px",
  });

  // Defensive styling to prevent browser focus artifacts
  ["focus", "focusin", "mousedown"].forEach((ev) =>
    searchInput.addEventListener(ev, () => {
      searchInput.style.outline = "none";
      searchInput.style.boxShadow = "none";
    })
  );

  // Emit custom event to decouple UI from data logic
  searchInput.addEventListener("input", (e) => {
    document.dispatchEvent(
      new CustomEvent("chatgpt-monitor-search", {
        detail: { query: e.target.value || "" },
      })
    );
  });

  // Clear button improves usability for long queries
  const clearBtn = document.createElement("button");
  clearBtn.innerHTML = "✕";
  Object.assign(clearBtn.style, {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: "14px",
  });

  clearBtn.onclick = () => {
    searchInput.value = "";
    document.dispatchEvent(
      new CustomEvent("chatgpt-monitor-search", {
        detail: { query: "" },
      })
    );
  };

  searchWrap.append(searchIcon, searchInput, clearBtn);

  // Content container left generic for external renderer
  const content = document.createElement("div");
  content.className = "content-wrapper";
  content.innerHTML = "Loading...";

  // Fixed report link for feedback without cluttering UI
  const report = document.createElement("a");
  report.className = "chatgpt-report-link";
  report.href = "https://github.com/iamtushar28/Chatgpt-boost/issues/new";
  report.target = "_blank";
  report.innerHTML = "Report an issue ⚠️";
  Object.assign(report.style, {
    position: "absolute",
    bottom: "0",
    right: "0px",
    padding: "2px",
    paddingRight: "3px",
    width: "100%",
    textAlign: "right",
  });

  div.append(closeBtn, header, searchWrap, content, report);
  document.body.appendChild(div);

  // Restrict drag to header to avoid accidental moves
  makeDraggable(div, header);
  applyThemeToUI();
}

// ==================== DRAG ====================

// Simple drag logic avoids external dependencies
function makeDraggable(el, handle) {
  let x = 0,
    y = 0,
    mx = 0,
    my = 0;

  // Mouse-based drag chosen for desktop-first UX
  (handle || el).onmousedown = (e) => {
    e.preventDefault();
    mx = e.clientX;
    my = e.clientY;
    document.onmousemove = drag;
    document.onmouseup = stop;
  };

  // Reposition element relative to last cursor position
  function drag(e) {
    x = mx - e.clientX;
    y = my - e.clientY;
    mx = e.clientX;
    my = e.clientY;
    el.style.top = el.offsetTop - y + "px";
    el.style.left = el.offsetLeft - x + "px";
    // Disable right anchoring once user moves it
    el.style.right = "auto";
  }

  // Cleanup handlers to prevent leaks
  function stop() {
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

// ==================== INIT ====================

// Inject scripts as early as possible
attachMonitor();
// Start listening immediately for theme changes
observeThemeChanges();

// Delay UI creation until ChatGPT layout stabilizes
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    createMonitorDiv();
    createToggleButton();
    applyThemeToUI();
  }, 1200);
});

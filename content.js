// content.js (updated)
// This runs in the content-script isolated world and only interacts with the page via DOM and CustomEvents.

function attachMonitor() {
  const configScript = document.createElement("script");
  configScript.src = chrome.runtime.getURL("monitor-config.js");
  configScript.onload = function () {
    this.remove();

    // Load XHR Monitor (if you ever add one)
    // (document.head || document.documentElement).appendChild(xhrScript);

    // Load Fetch Monitor
    const fetchScript = document.createElement("script");
    fetchScript.src = chrome.runtime.getURL("fetch-monitor.js");
    fetchScript.onload = function () {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(fetchScript);
  };
  (document.head || document.documentElement).appendChild(configScript);
}

// -------------------- THEME SYSTEM --------------------

function getThemeStyles() {
  const isDark = document.documentElement.classList.contains("dark");

  return {
    isDark,
    panelBg: isDark ? "rgba(0, 0, 0, 0.20)" : "rgba(255, 255, 255, 0.65)",
    textColor: isDark ? "white" : "#111",
    borderColor: isDark ? "rgb(49,49,49)" : "#ccc",
    inputBorder: isDark ? "rgba(255,255,255,0.25)" : "#aaa",
    searchIconColor: isDark ? "white" : "#444",
    hoverBlue: "#2a78ff",
  };
}

// Tell page scripts to redraw when theme changes
function observeThemeChanges() {
  const observer = new MutationObserver(() => {
    document.dispatchEvent(new CustomEvent("chatgpt-theme-change"));
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
}

// -------------------- UI ELEMENTS --------------------

// Show Chats button
function createToggleButton() {
  const T = getThemeStyles();

  const button = document.createElement("button");
  button.classList.add("chatgpt-api-monitor-toggle");
  button.innerHTML = "Show Chats";
  button.style.position = "fixed";
  button.style.top = "70px";
  button.style.right = "10px";
  button.style.padding = "8px 16px";
  button.style.backgroundColor = T.panelBg;
  button.style.backdropFilter = "blur(10px)";
  button.style.webkitBackdropFilter = "blur(10px)";
  button.style.color = T.textColor;
  button.style.borderRadius = "5px";
  button.style.border = `1px solid ${T.borderColor}`;
  button.style.cursor = "pointer";
  button.style.zIndex = "1000";
  button.style.display = "block";
  button.style.fontSize = "14px";
  button.style.fontWeight = "500";
  button.onclick = toggleMonitor;
  document.body.appendChild(button);

  // Make button draggable
  makeDraggable(button);

  return button;
}

function toggleMonitor() {
  const monitorDiv = document.querySelector(".chatgpt-api-monitor");
  const toggleButton = document.querySelector(".chatgpt-api-monitor-toggle");

  if (monitorDiv) {
    const isVisible = monitorDiv.style.display !== "none";
    monitorDiv.style.display = isVisible ? "none" : "block";
    toggleButton.style.display = isVisible ? "block" : "none";
  }
}

function createMonitorDiv() {
  const T = getThemeStyles();

  const div = document.createElement("div");
  // add a class to the div
  div.classList.add("chatgpt-api-monitor");

  // Create close button
  const closeButton = document.createElement("button");
  closeButton.innerHTML = "×";
  closeButton.style.position = "absolute";
  closeButton.style.top = "5px";
  closeButton.style.right = "5px";
  closeButton.style.color = T.textColor;
  closeButton.style.border = "none";
  closeButton.style.background = "transparent";
  closeButton.style.fontSize = "20px";
  closeButton.style.cursor = "pointer";
  closeButton.style.padding = "0 5px";
  closeButton.onclick = toggleMonitor;

  // Create draggable header
  const dragHandle = document.createElement("div");
  dragHandle.style.paddingBottom = "5px";
  dragHandle.style.marginBottom = "5px";
  dragHandle.style.cursor = "move";
  dragHandle.style.color = T.textColor;
  dragHandle.style.fontSize = "14px";
  dragHandle.style.fontWeight = "600";
  dragHandle.style.borderBottom = `1px solid ${T.borderColor}`;
  dragHandle.innerHTML = "My Chats";

  // --- Search Bar (content script) ---
  const searchContainer = document.createElement("div");
  searchContainer.style.display = "flex";
  searchContainer.style.alignItems = "center";
  searchContainer.style.padding = "1px 8px";
  searchContainer.style.borderRadius = "5px";
  searchContainer.style.border = `1px solid ${T.borderColor}`;
  searchContainer.style.marginBottom = "10px";
  searchContainer.style.marginTop = "10px";

  const searchIcon = document.createElement("span");
  searchIcon.innerHTML = "🧐";
  searchIcon.style.marginRight = "4px";
  searchIcon.style.fontSize = "14px";

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Search chat...";
  searchInput.style.flex = "1";
  searchInput.style.border = "none";
  searchInput.style.outline = "none";
  searchInput.style.background = "transparent";
  searchInput.style.color = T.textColor;
  searchInput.style.fontSize = "14px";

  // 🔥 REMOVE BLUE OUTLINE COMPLETELY (Chrome fix)
  searchInput.style.boxShadow = "0 0 0 0 transparent";
  searchInput.style.webkitTapHighlightColor = "transparent";

  searchInput.addEventListener("focus", () => {
    searchInput.style.outline = "none";
    searchInput.style.boxShadow = "0 0 0 0 transparent";
  });

  searchInput.addEventListener("focusin", () => {
    searchInput.style.outline = "none";
    searchInput.style.boxShadow = "0 0 0 0 transparent";
  });

  searchInput.addEventListener("mousedown", () => {
    // Prevent Chrome from applying its default focus ring
    searchInput.style.outline = "none";
    searchInput.style.boxShadow = "0 0 0 0 transparent";
  });

  // Clear button (×)
  const clearBtn = document.createElement("button");
  clearBtn.innerHTML = "✕";
  clearBtn.title = "Clear";
  clearBtn.style.border = "none";
  clearBtn.style.background = "transparent";
  clearBtn.style.cursor = "pointer";
  clearBtn.style.marginLeft = "8px";
  clearBtn.style.fontSize = "14px";
  clearBtn.style.color = T.textColor;

  clearBtn.onclick = () => {
    searchInput.value = "";
    // Dispatch a custom event to the page so page-js receives the query
    const evt = new CustomEvent("chatgpt-monitor-search", {
      detail: { query: "" },
    });
    document.dispatchEvent(evt);
    searchInput.focus();
  };

  // Dispatch search query to page context on input (so monitor-config.js can pick it up)
  searchInput.addEventListener("input", (e) => {
    const q = e.target.value || "";
    const evt = new CustomEvent("chatgpt-monitor-search", {
      detail: { query: q },
    });
    // dispatch on document — page scripts can listen
    document.dispatchEvent(evt);
  });

  searchContainer.appendChild(searchIcon);
  searchContainer.appendChild(searchInput);
  searchContainer.appendChild(clearBtn);

  // Create content wrapper
  const contentWrapper = document.createElement("div");
  contentWrapper.classList.add("content-wrapper");
  contentWrapper.innerHTML =
    '<div style="margin: 0 0 10px 0;">Loading...</div>';

  // add a style to the div
  div.style.position = "fixed";
  div.style.top = "70px";
  div.style.right = "10px";
  div.style.backgroundColor = T.panelBg;
  div.style.backdropFilter = "blur(10px)";
  div.style.webkitBackdropFilter = "blur(10px)";
  div.style.padding = "10px";
  div.style.paddingBottom = "30px";
  div.style.zIndex = "1000";
  div.style.border = `1px solid ${T.borderColor}`;
  div.style.borderRadius = "5px";
  div.style.boxShadow = "0 2px 10px rgba(0,0,0,0.1)";
  div.style.maxWidth = "360px";
  div.style.minWidth = "360px";
  div.style.fontSize = "14px";
  div.style.fontFamily = "system-ui, -apple-system, sans-serif";
  div.style.display = "none";

  // Create report issue link
  const reportLink = document.createElement("a");
  reportLink.href = "https://github.com/iamtushar28/Chatgpt-boost/issues/new";
  reportLink.target = "_blank";
  reportLink.innerHTML = "Report an issue ⚠️";
  reportLink.style.position = "absolute";
  reportLink.style.bottom = "0";
  reportLink.style.right = "0px";
  reportLink.style.color = "#4da3ff";
  reportLink.style.padding = "6px";
  reportLink.style.paddingRight = "14px";
  reportLink.style.textAlign = "right";
  reportLink.style.borderTop = `1px solid ${T.borderColor}`;
  reportLink.style.width = "100%";

  div.appendChild(closeButton);
  div.appendChild(dragHandle);
  // insert search container under the header
  div.appendChild(searchContainer);
  div.appendChild(contentWrapper);
  div.appendChild(reportLink);
  document.body.appendChild(div);

  // Make div draggable
  makeDraggable(div, dragHandle);
}

// Function to make an element draggable
function makeDraggable(element, dragHandle) {
  let pos1 = 0,
    pos2 = 0,
    pos3 = 0,
    pos4 = 0;

  if (dragHandle) {
    // If present, the dragHandle is where you move the element from
    dragHandle.onmousedown = dragMouseDown;
  } else {
    // Otherwise, move the element from anywhere inside it
    element.onmousedown = dragMouseDown;
  }

  function dragMouseDown(e) {
    e.preventDefault();
    // Get the mouse cursor position at startup
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    // Call function whenever the cursor moves
    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    e.preventDefault();
    // Calculate the new cursor position
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    // Set the element's new position
    element.style.top = element.offsetTop - pos2 + "px";
    element.style.left = element.offsetLeft - pos1 + "px";
    element.style.right = "auto"; // Remove the right position so it doesn't conflict
  }

  function closeDragElement() {
    // Stop moving when mouse button is released
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

attachMonitor();

document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    createMonitorDiv();
    createToggleButton();
  }, 1200);
});

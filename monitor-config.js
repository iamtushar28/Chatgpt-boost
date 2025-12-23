// Injected into page context so it can share state with wrapped fetch

// =====================================================
// -------------------- THEME SYSTEM --------------------
// =====================================================

// Inject CSS variables instead of hardcoding colors in JS
// Keeps styling reactive to ChatGPT theme without rerendering UI
(function injectThemeCSS() {
  const style = document.createElement("style");
  style.innerHTML = `
    :root {
      --chatgpt-monitor-border: #ccc;
    }
    html.dark {
      --chatgpt-monitor-border: rgb(49,49,49);
    }
  `;
  document.documentElement.appendChild(style);
})();

// Resolve theme-dependent colors dynamically
function getThemeStyles() {
  const isDark = document.documentElement.classList.contains("dark");
  return {
    textColor: isDark ? "#ffffff" : "#111111",
    hoverColor: "#4da3ff",
  };
}

// =====================================================
// -------------------- GLOBAL STATE --------------------
// =====================================================

// Stores last full conversation payload returned by backend
window.__CHATGPT_MONITOR_RESPONSE = {};

// Accumulates outbound user requests for correlation
window.__CHATGPT_MONITOR_REQUEST = [];

// Canonical map of user-visible messages (id → text)
window.__CHATGPT_USER_MESSAGES = {};

// Tracks currently active conversation to detect chat switches
window.__CHATGPT_MONITOR_ACTIVE_CONVERSATION_ID = null;

// =====================================================
// -------------------- CONFIG OBJECT -------------------
// =====================================================

window.__CHATGPT_MONITOR_CONFIG = {
  // Only monitor ChatGPT conversation APIs
  apiPattern:
    /^https:\/\/chatgpt\.com\/backend-api(?:\/[^\/]*)?\/conversation(?:\/[0-9a-f-]+)?$/,

  // Search query for UI filtering
  searchQuery: "",

  // Gatekeeper for fetch wrapper
  shouldLogRequest(url) {
    return this.apiPattern.test(url);
  },

  // Extract user messages from server response mapping
  // Covers history load & refresh
  filterUserMessages() {
    const mapping = window.__CHATGPT_MONITOR_RESPONSE.mapping;
    if (!mapping) return {};

    for (const [id, node] of Object.entries(mapping)) {
      if (
        node?.message?.author?.role === "user" &&
        node?.message?.content?.parts?.[0]
      ) {
        window.__CHATGPT_USER_MESSAGES[id] = node.message.content.parts[0];
      }
    }
    return window.__CHATGPT_USER_MESSAGES;
  },

  // Capture user messages from outbound POST requests
  // Handles messages before server mapping arrives
  addUserPostRequests() {
    for (const req of window.__CHATGPT_MONITOR_REQUEST) {
      const msg = req?.messages?.[0];
      if (msg?.id && msg?.content?.parts?.[0]) {
        window.__CHATGPT_USER_MESSAGES[msg.id] = msg.content.parts[0];
      }
    }
    return window.__CHATGPT_USER_MESSAGES;
  },

  // Scroll main ChatGPT UI to a specific message
  scrollToMessage(messageId) {
    const el = document.querySelector(`[data-message-id="${messageId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  },

  // =====================================================
  // -------------------- UI RENDER ----------------------
  // =====================================================

  updateMonitorDiv(retryCount = 0) {
    const monitorDiv = document.querySelector(".chatgpt-api-monitor");

    // Merge mapping-derived + request-derived messages
    let userMessages = this.filterUserMessages();
    userMessages = this.addUserPostRequests();

    if (monitorDiv && Object.keys(userMessages).length > 0) {
      let contentWrapper =
        monitorDiv.querySelector(".content-wrapper") || monitorDiv.children[1];

      contentWrapper.innerHTML = "";

      const list = document.createElement("div");
      list.style.overflow = "auto";
      list.style.maxHeight = "360px";

      const query = (this.searchQuery || "").toLowerCase();
      const T = getThemeStyles();
      let anyShown = false;

      Object.entries(userMessages).forEach(([id, message]) => {
        const text =
          message === undefined || message === null ? "" : String(message);

        if (query && !text.toLowerCase().includes(query)) return;
        anyShown = true;

        const wrapper = document.createElement("div");
        wrapper.style.marginBottom = "4px";
        wrapper.style.padding = "4px";

        const btn = document.createElement("button");
        btn.innerHTML = text;

        Object.assign(btn.style, {
          cursor: "pointer",
          border: "none",
          padding: "4px 0",
          textAlign: "left",
          width: "100%",
          borderBottom: "1px solid var(--chatgpt-monitor-border)",
          fontSize: "14px",
          display: "-webkit-box",
          WebkitLineClamp: "2",
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          textOverflow: "ellipsis",
          background: "transparent",
          color: T.textColor,
        });

        btn.onclick = () => this.scrollToMessage(id);

        btn.addEventListener("mouseover", () => {
          btn.style.color = T.hoverColor;
        });

        btn.addEventListener("mouseout", () => {
          btn.style.color = getThemeStyles().textColor;
        });

        wrapper.appendChild(btn);
        list.appendChild(wrapper);
      });

      if (!anyShown) {
        list.innerHTML =
          '<div style="margin:10px 0;">No messages matched your search.</div>';
      }

      contentWrapper.appendChild(list);

      // Safe auto-scroll
      const tryScroll = () => {
        if (list.offsetParent !== null) {
          list.scrollTop = list.scrollHeight;
        } else {
          requestAnimationFrame(tryScroll);
        }
      };
      tryScroll();
    } else if (retryCount < 5) {
      setTimeout(() => {
        this.updateMonitorDiv(retryCount + 1);
      }, 2000);
    }
  },

  // =====================================================
  // ---------------- RESPONSE HANDLER -------------------
  // =====================================================

  logResponse(url, response, request) {
    // Determine conversation ID from request or response
    const newConversationId =
      request?.conversation_id || response?.conversation_id || null;

    // Detect chat switch
    if (
      newConversationId &&
      window.__CHATGPT_MONITOR_ACTIVE_CONVERSATION_ID &&
      newConversationId !== window.__CHATGPT_MONITOR_ACTIVE_CONVERSATION_ID
    ) {
      // Clear all previous chat state
      window.__CHATGPT_MONITOR_RESPONSE = {};
      window.__CHATGPT_MONITOR_REQUEST = [];
      window.__CHATGPT_USER_MESSAGES = {};
    }

    // Update active conversation
    if (newConversationId) {
      window.__CHATGPT_MONITOR_ACTIVE_CONVERSATION_ID = newConversationId;
    }

    // Store latest mapping response
    if (response?.mapping) {
      window.__CHATGPT_MONITOR_RESPONSE = response;
    }

    // Preserve outbound requests
    if (request) {
      window.__CHATGPT_MONITOR_REQUEST.push(request);
    }

    // Refresh UI
    this.updateMonitorDiv(0);
  },
};

// =====================================================
// -------------------- SEARCH EVENT --------------------
// =====================================================

// Decoupled search input → monitor update
document.addEventListener("chatgpt-monitor-search", (e) => {
  const cfg = window.__CHATGPT_MONITOR_CONFIG;
  if (!cfg) return;

  cfg.searchQuery = String(e?.detail?.query || "");
  cfg.updateMonitorDiv(0);
});

// Injected into page context so it can share state with wrapped fetch

// -------------------- THEME SYSTEM --------------------

// Inject CSS variables instead of hardcoding colors in JS
// This keeps styling reactive to ChatGPT theme without rerendering UI
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
  // Attach to document root so variables are globally available
  document.documentElement.appendChild(style);
})();

// Lightweight helper to resolve theme-dependent colors at runtime
function getThemeStyles() {
  // Use ChatGPT’s own theme flag for consistency
  const isDark = document.documentElement.classList.contains("dark");
  return {
    textColor: isDark ? "#ffffff" : "#111111",
    // Accent color chosen for visibility on both themes
    hoverColor: "#4da3ff",
  };
}

// -------------------- GLOBAL STATE --------------------

// Stores last full conversation payload returned by backend
window.__CHATGPT_MONITOR_RESPONSE = {};

// Accumulates outbound user requests for correlation
window.__CHATGPT_MONITOR_REQUEST = [];

// Canonical map of user-visible messages (id → text)
window.__CHATGPT_USER_MESSAGES = {};

// -------------------- CONFIG OBJECT --------------------

// Single shared config object used by fetch wrapper and UI
window.__CHATGPT_MONITOR_CONFIG = {
  // Strict pattern limits monitoring to ChatGPT conversation APIs
  apiPattern:
    /^https:\/\/chatgpt\.com\/backend-api(?:\/[^\/]*)?\/conversation(?:\/[0-9a-f-]+)?$/,

  // Search state kept here to avoid duplicating UI logic
  searchQuery: "",

  // Central filter gate to reduce unnecessary processing
  shouldLogRequest(url) {
    return this.apiPattern.test(url);
  },

  // Extract user messages from server response mapping
  // This covers messages loaded from history / refresh
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

  // Capture user messages from outgoing POST requests
  // This fills gaps before server responses arrive
  addUserPostRequests() {
    for (const req of window.__CHATGPT_MONITOR_REQUEST) {
      const msg = req?.messages?.[0];
      if (msg?.id && msg?.content?.parts?.[0]) {
        window.__CHATGPT_USER_MESSAGES[msg.id] = msg.content.parts[0];
      }
    }
    return window.__CHATGPT_USER_MESSAGES;
  },

  // Scrolls ChatGPT UI to the corresponding message
  // Used to keep monitor and main chat in sync
  scrollToMessage(messageId) {
    const el = document.querySelector(`[data-message-id="${messageId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  },

  // -------------------- MAIN RENDER (YOUR LOGIC PRESERVED) --------------------

  // Rebuilds monitor UI from current state
  // Retry logic handles timing issues during navigation
  updateMonitorDiv: function (retryCount = 0) {
    const monitorDiv = document.querySelector(".chatgpt-api-monitor");

    // Merge server-derived and request-derived messages
    let userMessages = this.filterUserMessages();
    userMessages = this.addUserPostRequests();

    if (monitorDiv && Object.keys(userMessages).length > 0) {
      let contentWrapper = monitorDiv.querySelector(".content-wrapper");

      // Fallback protects against unexpected DOM structure changes
      if (!contentWrapper) {
        contentWrapper = monitorDiv.children[1];
      }

      // Full rerender avoids complex diffing logic
      contentWrapper.innerHTML = "";

      const fullMappingSection = document.createElement("div");
      fullMappingSection.style.overflow = "auto";
      fullMappingSection.style.maxHeight = "360px";

      // Normalize search once per render
      const query = (this.searchQuery || "").toLowerCase();
      const T = getThemeStyles();
      let anyShown = false;

      Object.entries(userMessages).forEach(([id, message]) => {
        const messageText =
          message === undefined || message === null ? "" : String(message);

        // Client-side filtering keeps UI responsive
        if (query && !messageText.toLowerCase().includes(query)) return;

        anyShown = true;

        const messageDiv = document.createElement("div");
        messageDiv.style.marginBottom = "4px";
        messageDiv.style.padding = "4px";

        // Button used instead of link for better keyboard & click handling
        const idButton = document.createElement("button");
        idButton.innerHTML = messageText;

        Object.assign(idButton.style, {
          cursor: "pointer",
          border: "none",
          padding: "4px 0",
          textAlign: "left",
          width: "100%",
          // CSS variable keeps border theme-aware
          borderBottom: "1px solid var(--chatgpt-monitor-border)",
          fontSize: "14px",
          // Line clamp avoids oversized entries
          display: "-webkit-box",
          WebkitLineClamp: "2",
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          textOverflow: "ellipsis",
          background: "transparent",
          color: T.textColor,
        });

        // Click syncs monitor selection with main chat
        idButton.onclick = () => this.scrollToMessage(id);

        // Hover styling applied manually to avoid CSS injection complexity
        idButton.addEventListener("mouseover", () => {
          idButton.style.color = T.hoverColor;
        });

        idButton.addEventListener("mouseout", () => {
          idButton.style.color = getThemeStyles().textColor;
        });

        messageDiv.appendChild(idButton);
        fullMappingSection.appendChild(messageDiv);
      });

      // Explicit empty-state improves UX for search
      if (!anyShown) {
        fullMappingSection.innerHTML =
          '<div style="margin: 10px 0;">No messages matched your search.</div>';
      }

      contentWrapper.appendChild(fullMappingSection);

      // Auto-scroll kept timing-safe to avoid invisible container issues
      const tryScroll = () => {
        if (fullMappingSection.offsetParent !== null) {
          // Only scroll when element is actually visible
          fullMappingSection.scrollTop = fullMappingSection.scrollHeight;
        } else {
          // Defer until layout stabilizes
          requestAnimationFrame(tryScroll);
        }
      };

      tryScroll();
    } else if (retryCount < 5) {
      // Retry accounts for delayed DOM or async fetch timing
      setTimeout(() => {
        this.updateMonitorDiv(retryCount + 1);
      }, 2000);
    }
  },

  // -------------------- RESPONSE HANDLER --------------------

  // Entry point called by fetch-monitor after each response
  logResponse(url, response, request) {
    // Only store full payloads that include conversation mapping
    if (response?.mapping) {
      window.__CHATGPT_MONITOR_RESPONSE = response;
    }

    // Detect chat reset scenarios from request intent
    const isDeleteChat = request?.is_visible === false;
    const isNewChat = request && !request.conversation_id;

    if (isDeleteChat || isNewChat) {
      // Clear all state to prevent cross-chat leakage
      window.__CHATGPT_MONITOR_RESPONSE = {};
      window.__CHATGPT_MONITOR_REQUEST = [];
      window.__CHATGPT_USER_MESSAGES = {};
      if (isDeleteChat) return;
    }

    // Preserve outbound requests for message reconstruction
    if (request) {
      window.__CHATGPT_MONITOR_REQUEST.push(request);
    }

    // Trigger UI refresh after state update
    this.updateMonitorDiv(0);
  },
};

// -------------------- SEARCH EVENT --------------------

// Decoupled search handling via custom event
// Allows UI layer to stay independent of data logic
document.addEventListener("chatgpt-monitor-search", (e) => {
  const cfg = window.__CHATGPT_MONITOR_CONFIG;
  if (!cfg) return;

  cfg.searchQuery = String(e?.detail?.query || "");
  cfg.updateMonitorDiv(0);
});

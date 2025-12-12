// monitor-config.js (updated)
// This file is injected into the page (page context). It defines the config object
// and listens for the search CustomEvent dispatched from the content script.

// -------------------- THEME SYSTEM --------------------

function getThemeStyles() {
  const isDark = document.documentElement.classList.contains("dark");

  return {
    isDark,
    textColor: isDark ? "white" : "#111",
    borderColor: isDark ? "rgb(49,49,49)" : "#ccc",
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

window.__CHATGPT_MONITOR_RESPONSE = {};
window.__CHATGPT_MONITOR_REQUEST = [];
window.__CHATGPT_USER_MESSAGES = {};

window.__CHATGPT_MONITOR_CONFIG = {
  apiPattern:
    /^https:\/\/chatgpt\.com\/backend-api(?:\/[^\/]*)?\/conversation(?:\/[0-9a-f-]+)?$/,
  searchQuery: "",

  shouldLogRequest: function (url, method) {
    // keep simple; only test url pattern for now
    return this.apiPattern.test(url);
  },

  filterUserMessages: function () {
    const mapping = window.__CHATGPT_MONITOR_RESPONSE.mapping;
    if (!mapping) return {};
    for (const [id, node] of Object.entries(mapping)) {
      if (
        node &&
        node.message &&
        node.message.author &&
        node.message.author.role === "user"
      ) {
        const part = node?.message?.content?.parts?.[0];
        if (part !== undefined) {
          window.__CHATGPT_USER_MESSAGES[id] = part;
        }
      }
    }
    return window.__CHATGPT_USER_MESSAGES;
  },

  addUserPostRequests: function () {
    const requests = window.__CHATGPT_MONITOR_REQUEST || [];
    for (const request of requests) {
      const messageId = request?.messages?.[0]?.id;
      const message = request?.messages?.[0]?.content?.parts?.[0];
      if (messageId && message) {
        window.__CHATGPT_USER_MESSAGES[messageId] = message;
      }
    }
    return window.__CHATGPT_USER_MESSAGES;
  },

  scrollToMessage: function (messageId) {
    const targetElement = document.querySelector(
      `[data-message-id="${messageId}"]`
    );
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  },

  updateMonitorDiv: function (retryCount = 0) {
    const T = getThemeStyles();

    const monitorDiv = document.querySelector(".chatgpt-api-monitor");
    let userMessages = this.filterUserMessages();
    userMessages = this.addUserPostRequests();
    if (monitorDiv && Object.keys(userMessages).length > 0) {
      // Find or create content wrapper
      let contentWrapper = monitorDiv.querySelector(".content-wrapper");
      if (!contentWrapper) {
        contentWrapper = monitorDiv.children[1]; // fallback
      }

      // Clear previous content
      contentWrapper.innerHTML = "";

      // Add full mapping section
      const fullMappingSection = document.createElement("div");

      // Add a style to the fullMappingSection
      fullMappingSection.style.overflow = "auto";
      fullMappingSection.style.maxHeight = "360px";

      // Apply search filtering (coerce to string)
      const query = (this.searchQuery || "").toString().toLowerCase();

      // Check if we have user messages
      if (Object.keys(userMessages).length === 0) {
        fullMappingSection.innerHTML +=
          '<div style="margin: 10px 0;">No messages yet. Start a conversation with ChatGPT to see messages here.</div>';
      } else {
        let anyShown = false;
        Object.entries(userMessages).forEach(([id, message]) => {
          const messageText =
            message === undefined || message === null ? "" : String(message);
          if (query && !messageText.toLowerCase().includes(query)) {
            return;
          }

          anyShown = true;
          const messageDiv = document.createElement("div");
          messageDiv.style.marginBottom = "4px";
          messageDiv.style.padding = "4px";

          const idButton = document.createElement("button");
          idButton.innerHTML = messageText;
          idButton.style.cursor = "pointer";
          idButton.style.border = "none";
          idButton.style.padding = "4px 0";
          idButton.style.textAlign = "left";
          idButton.style.width = "100%";
          idButton.style.borderBottom = `1px solid ${T.borderColor}`;
          idButton.style.fontSize = "14px";
          idButton.style.display = "-webkit-box";
          idButton.style.webkitLineClamp = "2";
          idButton.style.webkitBoxOrient = "vertical";
          idButton.style.overflow = "hidden";
          idButton.style.textOverflow = "ellipsis";
          idButton.style.background = "transparent";
          idButton.style.color = "inherit";

          idButton.onclick = () => this.scrollToMessage(id);

          // Hover effect: turn text blue
          idButton.addEventListener("mouseover", () => {
            idButton.style.color = "#4da3ff"; // light blue
          });

          // Remove hover effect: return to normal
          idButton.addEventListener("mouseout", () => {
            idButton.style.color = T.textColor; // default text color
          });

          messageDiv.appendChild(idButton);
          fullMappingSection.appendChild(messageDiv);
        });

        if (!anyShown) {
          fullMappingSection.innerHTML +=
            '<div style="margin: 10px 0;">No messages matched your search.</div>';
        }
      }

      contentWrapper.appendChild(fullMappingSection);

      // Scroll to the bottom to show the latest messages
      fullMappingSection.scrollTop = fullMappingSection.scrollHeight;
    } else if (retryCount < 5) {
      setTimeout(() => {
        this.updateMonitorDiv(retryCount + 1);
      }, 2000);
    }
  },

  logResponse: function (url, response, request) {
    try {
      // Only update the mapping — DO NOT reset everything here
      if (typeof response === "object" && response?.mapping) {
        window.__CHATGPT_MONITOR_RESPONSE = response;
      }

      // Reset ONLY on delete or new chat
      const isDeleteChat = request && request?.is_visible === false;
      const isNewChat = request && !request.conversation_id;

      if (isDeleteChat || isNewChat) {
        window.__CHATGPT_MONITOR_RESPONSE = {};
        window.__CHATGPT_MONITOR_REQUEST = [];
        window.__CHATGPT_USER_MESSAGES = {};
        if (isDeleteChat) return;
      }

      // Store POSTed user messages
      if (request) {
        window.__CHATGPT_MONITOR_REQUEST.push(request);
      }

      // Update UI
      this.updateMonitorDiv(0);
    } catch (err) {
      console.error("monitor-config.logResponse error:", err);
    }
  },
};

// Ensure page script attaches search listener only after config exists.
(function waitForConfigListener() {
  if (window.__CHATGPT_MONITOR_CONFIG) {
    // Listen for search events dispatched from the content script UI
    document.addEventListener("chatgpt-monitor-search", function (e) {
      try {
        const cfg = window.__CHATGPT_MONITOR_CONFIG;
        if (cfg) {
          cfg.searchQuery = (e?.detail?.query || "").toString();
          // Immediately refresh the UI
          cfg.updateMonitorDiv(0);
        }
      } catch (err) {
        console.error("chatgpt-monitor: search event handler error", err);
      }
    });
    return;
  }
  requestAnimationFrame(waitForConfigListener);
})();

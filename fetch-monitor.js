// Wrapped in an IIFE to avoid leaking variables into page scope
// Overrides fetch at runtime to observe network traffic without blocking it

(function () {
  // Preserve native fetch so behavior remains unchanged
  const originalFetch = window.fetch;

  // Replace fetch to enable passive inspection
  window.fetch = async function (...args) {
    // Normalize fetch arguments for consistent access
    const [resource, config] = args;
    const url = resource instanceof Request ? resource.url : resource;
    const method =
      resource instanceof Request ? resource.method : config?.method || "GET";

    // Capture request body for later correlation with response
    let requestData = null;
    try {
      if (resource instanceof Request) {
        // Clone is required because request bodies are single-read
        const clonedRequest = resource.clone();
        const ct = clonedRequest.headers.get("content-type") || "";

        // Prefer structured data when possible for readability
        if (ct.includes("application/json")) {
          const text = await clonedRequest.text();
          try {
            requestData = JSON.parse(text);
          } catch {
            // Fallback keeps raw payload when JSON is invalid
            requestData = text;
          }
        } else {
          // Best-effort capture for non-JSON requests
          try {
            requestData = await clonedRequest.text();
          } catch {
            // Silently ignore unreadable bodies (streams, blobs, etc.)
            requestData = null;
          }
        }
      } else if (config && config.body) {
        // Handle fetch(url, { body }) usage
        try {
          const contentType =
            config.headers?.["Content-Type"] ||
            config.headers?.["content-type"] ||
            "";

          // Avoid parsing unless content type explicitly signals JSON
          if (
            typeof config.body === "string" &&
            contentType.includes("application/json")
          ) {
            requestData = JSON.parse(config.body);
          } else {
            requestData = config.body;
          }
        } catch (e) {
          // Never let monitoring break the actual request
          requestData = config.body;
        }
      }
    } catch (e) {
      // Defensive logging only; fetch must continue regardless
      console.error("Error extracting fetch request body:", e);
    }

    // Pull shared config injected earlier by the extension
    const monitorConfig = window.__CHATGPT_MONITOR_CONFIG;

    // Centralized filtering prevents unnecessary processing
    const shouldLog =
      monitorConfig && monitorConfig.shouldLogRequest(url, method);

    try {
      // Execute the real network request untouched
      const response = await originalFetch.apply(this, args);

      if (shouldLog) {
        // Clone response since body streams are single-use
        const clone = response.clone();

        clone
          .text()
          .then((body) => {
            try {
              // Prefer structured logging for downstream UI
              const responseData = JSON.parse(body);
              monitorConfig.logResponse(url, responseData, requestData);
            } catch {
              // Store raw text when JSON parsing fails
              monitorConfig.logResponse(url, body, requestData);
            }
          })
          .catch((err) => {
            // Graceful degradation when response body is unreadable
            if (
              monitorConfig &&
              typeof monitorConfig.logResponse === "function"
            ) {
              monitorConfig.logResponse(
                url,
                { error: err.message },
                requestData
              );
            }
            console.error("Error reading response body in fetch-monitor:", err);
          });
      }

      // Always return the original response to the caller
      return response;
    } catch (error) {
      // Do not swallow network errors
      throw error;
    }
  };
})();

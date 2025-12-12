// fetch-monitor.js (updated minimal)
// This script is injected into the page and wraps window.fetch to inspect requests/responses.

(function () {
  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const [resource, config] = args;
    const url = resource instanceof Request ? resource.url : resource;
    const method =
      resource instanceof Request ? resource.method : config?.method || "GET";

    // Extract request payload
    let requestData = null;
    try {
      if (resource instanceof Request) {
        // Clone the request to read its body if JSON
        const clonedRequest = resource.clone();
        const ct = clonedRequest.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          const text = await clonedRequest.text();
          try {
            requestData = JSON.parse(text);
          } catch {
            requestData = text;
          }
        } else {
          // non-json or multipart etc.
          try {
            requestData = await clonedRequest.text();
          } catch {
            requestData = null;
          }
        }
      } else if (config && config.body) {
        try {
          const contentType =
            config.headers?.["Content-Type"] ||
            config.headers?.["content-type"] ||
            "";
          if (
            typeof config.body === "string" &&
            contentType.includes("application/json")
          ) {
            requestData = JSON.parse(config.body);
          } else {
            requestData = config.body;
          }
        } catch (e) {
          requestData = config.body;
        }
      }
    } catch (e) {
      console.error("Error extracting fetch request body:", e);
    }

    // Use shared configuration
    const monitorConfig = window.__CHATGPT_MONITOR_CONFIG;
    const shouldLog =
      monitorConfig && monitorConfig.shouldLogRequest(url, method);

    try {
      const response = await originalFetch.apply(this, args);
      if (shouldLog) {
        const clone = response.clone();
        clone
          .text()
          .then((body) => {
            try {
              const responseData = JSON.parse(body);
              monitorConfig.logResponse(url, responseData, requestData);
            } catch {
              monitorConfig.logResponse(url, body, requestData);
            }
          })
          .catch((err) => {
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

      return response;
    } catch (error) {
      throw error;
    }
  };
})();

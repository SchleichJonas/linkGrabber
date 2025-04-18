let creating;
let realDebridApiKey = '';

// Load API key on startup
chrome.storage.local.get('apiKey', (data) => {
  if (data.apiKey) {
    realDebridApiKey = data.apiKey;
    console.log('API Key loaded.');
  }
});

// Listen for API key changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.apiKey) {
    realDebridApiKey = changes.apiKey.newValue;
    console.log('API Key updated.');
  }
});

// Function to create and manage the offscreen document
async function setupOffscreenDocument(path) {
    // Check if we have an existing document
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
        documentUrls: [chrome.runtime.getURL(path)]
    });

    if (existingContexts.length > 0) {
        return;
    }

    // create offscreen document
    if (creating) {
        await creating;
    } else {
        creating = chrome.offscreen.createDocument({
            url: path,
            reasons: [chrome.offscreen.Reason.DOM_PARSER],
            justification: 'Needed to parse HTML from Nyaa.si'
        });
        await creating;
        creating = null;
    }
}

// Central message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Store the API key if sent from popup
  if (request.action === "storeApiKey") {
    realDebridApiKey = request.apiKey;
    chrome.storage.local.set({ apiKey: realDebridApiKey }, () => {
        console.log('API Key stored.');
        sendResponse({ success: true });
    });
    return true; // Indicate async response
  }

  // Check if API key is set before proceeding with API calls
  if (!realDebridApiKey && request.action !== 'fetchSearch') {
      console.warn('Real-Debrid API Key not set.');
      sendResponse({ success: false, error: 'API Key not set. Please set it in the extension popup.' });
      return false;
  }

  // Handle different actions
  switch (request.action) {
    case "sendToRealDebrid":
      fetch("https://api.real-debrid.com/rest/1.0/torrents/addMagnet", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${realDebridApiKey}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({ magnet: request.magnetLink })
      })
      .then(response => response.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        sendResponse({ success: true, data });
      })
      .catch(error => sendResponse({ success: false, error: `Real-Debrid Error: ${error.message}` }));
      return true; // Indicate async response

    case "getTorrentInfo":
      fetch("https://api.real-debrid.com/rest/1.0/torrents/info/" + request.id, {
        method: "GET",
        headers: { "Authorization": `Bearer ${realDebridApiKey}` }
      })
      .then(response => response.json())
      .then(data => {
         if (data.error) throw new Error(data.error);
         sendResponse({ success: true, data });
      })
      .catch(error => sendResponse({ success: false, error: `Real-Debrid Error: ${error.message}` }));
      return true;

    case "selectFiles":
      fetch("https://api.real-debrid.com/rest/1.0/torrents/selectFiles/" + request.id, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${realDebridApiKey}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({ files: "all" })
      })
      .then(response => {
        if (!response.ok) {
          // Attempt to parse error from Real-Debrid if possible
          return response.json().then(errData => {
             throw new Error(errData.error || `HTTP error! Status: ${response.status}`);
          }).catch(() => {
             // If parsing error fails, throw generic error
             throw new Error(`HTTP error! Status: ${response.status}`);
          });
        }
        // If response is OK but potentially empty (like 204 No Content)
        if (response.status === 204) return {}; // Return empty object for consistency
        return response.json().catch(() => ({})); // Handle potential JSON parsing errors on success
      })
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: `Real-Debrid Error: ${error.message}` }));
      return true;

    case "getDownloads": // This fetches the user's torrent list from Real-Debrid
      fetch("https://api.real-debrid.com/rest/1.0/torrents?limit=100", { // Added limit
        method: "GET",
        headers: { "Authorization": `Bearer ${realDebridApiKey}` }
      })
      .then(response => response.json())
      .then(data => {
         if (Array.isArray(data) && data.length > 0 && data[0].error) throw new Error(data[0].error);
         sendResponse({ success: true, data });
      })
      .catch(error => sendResponse({ success: false, error: `Real-Debrid Error: ${error.message}` }));
      return true;

    case "unrestrictLink": // Added for getting the direct download link
      fetch("https://api.real-debrid.com/rest/1.0/unrestrict/link", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${realDebridApiKey}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({ link: request.downloadLink })
      })
      .then(response => response.json())
      .then(data => {
          if (data.error) throw new Error(data.error);
          sendResponse({ success: true, data });
      })
      .catch(error => sendResponse({ success: false, error: `Real-Debrid Error: ${error.message}` }));
      return true;

    case "fetchSearch": // Fetch Nyaa.si search results HTML
      fetch(request.url, {
          method: "GET",
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0" } // Common User-Agent
      })
      .then(response => {
          if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
          return response.text();
      })
      .then(async html => {
          // Setup and use offscreen document for parsing
          await setupOffscreenDocument('offscreen.html');
          // Send HTML to offscreen document for parsing
          chrome.runtime.sendMessage({ action: 'parseNyaaHtml', html: html, episodeNum: request.episodeNum });
          // The response will be sent back from the offscreen script later
      })
      .catch(error => {
          console.error("Error fetching Nyaa.si:", error);
          // Inform popup directly about the fetch error
          chrome.runtime.sendMessage({ action: 'fetchError', episodeNum: request.episodeNum, error: error.message });
      });
      // Don't return true here, response is handled when offscreen sends back 'parseComplete' or 'parseError'
      return false;

     case 'sendToJdownloader':
      const jdUrl = `http://127.0.0.1:9666/flash/add`;
      const data = new URLSearchParams();
      data.append('urls', request.urls.join('')); // JDownloader expects newline separated URLs

      fetch(jdUrl, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: data.toString() // Convert params to string
      })
      .then(response => {
          if (!response.ok) {
              throw new Error(`JDownloader connection failed. Status: ${response.status}`);
          }
          // Check response content if needed, JDownloader might return specific success/fail messages
          console.log('Successfully sent links to JDownloader.');
          sendResponse({ success: true });
      })
      .catch(error => {
          console.error('Error sending to JDownloader:', error);
          sendResponse({ success: false, error: error.message });
      });
      return true; // Required for async sendResponse
  }

  return false; // Default case for unhandled actions
});

// Listen for responses from the offscreen document
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'parseComplete' || request.action === 'parseError' || request.action === 'fetchError') {
    // Forward the result (or error) from the offscreen document/fetch to the popup
    chrome.runtime.sendMessage(request);
  }
});

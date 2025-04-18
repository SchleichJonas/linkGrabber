// background.js
let creating;
let realDebridApiKey = '';

// --- Initialization ---
chrome.runtime.onStartup.addListener(() => {
  loadApiKey();
});

// Load API key initially when installed/updated or background script starts
loadApiKey();

async function loadApiKey() {
    try {
        const data = await chrome.storage.local.get('apiKey');
        if (data.apiKey) {
            realDebridApiKey = data.apiKey;
            console.log('API Key loaded on startup/install.');
        } else {
            console.log('API Key not found on startup.');
        }
    } catch (error) {
        console.error('Error loading API key:', error);
    }
}

// Listen for API key changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local' && changes.apiKey) {
    realDebridApiKey = changes.apiKey.newValue;
    console.log('API Key updated in background script.');
  }
});

// --- Offscreen Document Management ---
async function setupOffscreenDocument(path) {
    const url = chrome.runtime.getURL(path);
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
        documentUrls: [url]
    });

    if (existingContexts.length > 0) {
        return;
    }

    if (creating) {
        await creating;
    } else {
        creating = chrome.offscreen.createDocument({
            url: path,
            reasons: [chrome.offscreen.Reason.DOM_PARSER],
            justification: 'Needed to parse HTML from Nyaa.si'
        });
        try {
            await creating;
        } finally {
            creating = null;
        }
    }
}

// --- Real-Debrid API Helper Functions ---

async function addMagnetToRD(magnetLink) {
    const response = await fetch("https://api.real-debrid.com/rest/1.0/torrents/addMagnet", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${realDebridApiKey}`,
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({ magnet: magnetLink })
    });
    const data = await response.json();
    if (!response.ok || data.error) {
        throw new Error(data.error || `HTTP Error: ${response.status}`);
    }
    return data; // { id: "...", uri: "..." }
}

async function selectFilesRD(torrentId) {
    const response = await fetch(`https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${torrentId}`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${realDebridApiKey}`,
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({ files: "all" })
    });
    if (!response.ok) {
        // Attempt to parse error, otherwise throw status
        try {
            const errData = await response.json();
            throw new Error(errData.error || `HTTP error! Status: ${response.status}`);
        } catch (e) {
             if (response.status === 204) return; // 204 No Content is OK for selectFiles
             throw new Error(`HTTP error! Status: ${response.status}`);
        }
    }
    // Handle 204 No Content specifically as success
    if (response.status === 204) {
        console.log(`Files selected for torrent ${torrentId} (Status 204)`);
        return; // Success
    }
    // If other success status with body, log it (though not typical for selectFiles)
    try{
        const data = await response.json();
        console.log("Select files response body:", data);
    } catch (e) {
        // Ignore if body is empty on success
    }

}

async function getTorrentInfoRD(torrentId) {
    const response = await fetch(`https://api.real-debrid.com/rest/1.0/torrents/info/${torrentId}`, {
        method: "GET",
        headers: { "Authorization": `Bearer ${realDebridApiKey}` }
    });
    const data = await response.json();
    if (!response.ok || data.error) {
        throw new Error(data.error || `HTTP Error: ${response.status}`);
    }
    return data;
}

async function getDownloadsRD() {
    const response = await fetch("https://api.real-debrid.com/rest/1.0/torrents?limit=100", {
        method: "GET",
        headers: { "Authorization": `Bearer ${realDebridApiKey}` }
    });
    const data = await response.json();
    // Check if the response *itself* is an error object (can happen with invalid token)
    if (!response.ok || data.error_code) {
        throw new Error(data.error || `HTTP Error: ${response.status}`);
    }
    // Check if the *first item* indicates an error (less common)
    if (Array.isArray(data) && data.length > 0 && data[0].error) {
        throw new Error(data[0].error);
    }
    return data;
}

async function unrestrictLinkRD(downloadLink) {
    const response = await fetch("https://api.real-debrid.com/rest/1.0/unrestrict/link", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${realDebridApiKey}`,
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({ link: downloadLink })
    });
    const data = await response.json();
    if (!response.ok || data.error) {
        throw new Error(data.error || `HTTP Error: ${response.status}`);
    }
    return data; // { id, filename, filesize, link, host, ... }
}

async function sendToJDownloader(urls) {
    const jdUrl = `http://127.0.0.1:9666/flash/add`;
    const data = new URLSearchParams();
    // Click'n'Load typically expects URLs separated by newlines for POST
    data.append('urls', urls.join(''));

    const response = await fetch(jdUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: data.toString()
    });

    if (!response.ok) {
        throw new Error(`JDownloader connection failed. Status: ${response.status}`);
    }
    console.log('Successfully sent links to JDownloader via background.');
    // JDownloader flash interface doesn't usually return a useful body on success
}


// --- Message Listener ---

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Handle messages without needing API key first
  if (request.action === "storeApiKey") {
    realDebridApiKey = request.apiKey;
    chrome.storage.local.set({ apiKey: realDebridApiKey }, () => {
      console.log('API Key stored via background.');
      sendResponse({ success: true });
    });
    return true; // Async response
  }

  if (request.action === "fetchSearch") {
      // Nyaa Fetch Logic (using offscreen document)
      (async () => {
          try {
              const response = await fetch(request.url, {
                  method: "GET",
                  headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0" }
              });
              if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
              const html = await response.text();
              await setupOffscreenDocument('offscreen.html');
              chrome.runtime.sendMessage({ action: 'parseNyaaHtml', html: html, episodeNum: request.episodeNum });
              // Response handled by offscreen script sending 'parseComplete'/'parseError'
          } catch (error) {
              console.error("Error fetching Nyaa.si:", error);
              // Inform popup/caller about the fetch error
              chrome.runtime.sendMessage({ action: 'fetchError', episodeNum: request.episodeNum, error: error.message });
          }
      })();
      // Indicate that response will be sent later (or maybe not at all if using chrome.runtime.sendMessage)
      // For simplicity with the offscreen flow, we don't use sendResponse here.
      return false;
  }

   // --- Actions requiring API Key ---
   if (!realDebridApiKey) {
    console.warn(`Action '${request.action}' blocked: Real-Debrid API Key not set.`);
    sendResponse({ success: false, error: 'API Key not set. Please set it in the extension popup.' });
    return false; // Synchronous response (error)
   }

  // Use an async IIFE to handle async operations within the listener
  (async () => {
    try {
      switch (request.action) {
        case "sendToRealDebrid":
          const addData = await addMagnetToRD(request.magnetLink);
          sendResponse({ success: true, data: addData });
          break;

        case "getTorrentInfo":
          const infoData = await getTorrentInfoRD(request.id);
          sendResponse({ success: true, data: infoData });
          break;

        case "selectFiles":
           await selectFilesRD(request.id);
           // selectFiles might return 204 No Content on success, so just send success: true
           sendResponse({ success: true, data: {} }); // Send empty data object for consistency
           break;

        case "getDownloads":
          const downloadsData = await getDownloadsRD();
          sendResponse({ success: true, data: downloadsData });
          break;

        case "unrestrictLink":
          const unrestrictData = await unrestrictLinkRD(request.downloadLink);
          sendResponse({ success: true, data: unrestrictData });
          break;

        case 'sendToJdownloader':
           await sendToJDownloader(request.urls);
           sendResponse({ success: true });
           break;

        case 'addMagnetToRdViaContentScript': // New action from content script
           console.log(`Background: Received request to add magnet: ${request.magnetLink}`);
           const addedTorrent = await addMagnetToRD(request.magnetLink);
           console.log(`Background: Added magnet (ID: ${addedTorrent.id}). Selecting files...`);
           await selectFilesRD(addedTorrent.id);
           console.log(`Background: Files selected for ${addedTorrent.id}. Sending success to content script.`);
           sendResponse({ success: true, data: { id: addedTorrent.id } });
           break;

        default:
          console.warn("Unknown action received:", request.action);
          sendResponse({ success: false, error: `Unknown action: ${request.action}` });
          return; // Exit IIFE
      }
    } catch (error) {
        console.error(`Error handling action '${request.action}':`, error);
        // Ensure error.message is included; default if missing
        const errorMessage = error.message || 'An unknown error occurred.';
        sendResponse({ success: false, error: `Real-Debrid Error: ${errorMessage}` });
    }
  })();

  return true; // Indicate that the response will be sent asynchronously
});


// --- Listener for Offscreen Document Responses ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Only handle messages expected from the offscreen script
    if (request.action === 'parseComplete' || request.action === 'parseError') {
        console.log(`Background received from offscreen: ${request.action}`, request);
        // Forward the result/error to the original caller (likely popup.js)
        // Use chrome.runtime.sendMessage to broadcast it; popup listener will pick it up.
        chrome.runtime.sendMessage(request);
    }
    // Do not return true here unless this listener needs to respond asynchronously itself.
});

// background.js
let creating;
let realDebridApiKey = '';

// --- Utility Functions ---
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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
        console.log("Offscreen document already exists.");
        return;
    }

    if (creating) {
        console.log("Waiting for existing offscreen document creation...");
        await creating;
    } else {
        console.log("Creating offscreen document...");
        creating = chrome.offscreen.createDocument({
            url: path,
            reasons: [chrome.offscreen.Reason.DOM_PARSER],
            justification: 'Needed to parse HTML from Nyaa.si'
        });
        try {
            await creating;
            console.log("Offscreen document created successfully.");
        } catch (error) {
            console.error("Error creating offscreen document:", error);
        } finally {
            creating = null;
        }
    }
}

// --- Real-Debrid API Helper Functions ---

async function addMagnetToRD(magnetLink) {
    console.log("Sending magnet to RD:", magnetLink);
    const response = await fetch("https://api.real-debrid.com/rest/1.0/torrents/addMagnet", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${realDebridApiKey}`,
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({ magnet: magnetLink })
    });
    const data = await response.json();
    console.log("Add Magnet Response Status:", response.status);
    console.log("Add Magnet Response Data:", data);
    if (!response.ok || data.error) {
        throw new Error(`RD Add Magnet Error: ${data.error || 'Unknown'} (Status: ${response.status})`);
    }
    return data; // { id: "...", uri: "..." }
}

async function selectFilesRD(torrentId) {
    console.log(`Selecting files for RD torrent ID: ${torrentId}`);
    const response = await fetch(`https://api.real-debrid.com/rest/1.0/torrents/selectFiles/${torrentId}`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${realDebridApiKey}`,
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({ files: "all" })
    });
    console.log("Select Files Response Status:", response.status);
    // 204 No Content is the expected success response
    if (response.status === 204) {
        console.log(`Files selected successfully for torrent ${torrentId} (Status 204)`);
        return; // Success
    }
    // Handle other statuses as errors
    let errorMsg = `HTTP Error: ${response.status}`;
    try {
        const errData = await response.json();
        errorMsg = errData.error || errorMsg;
        console.log("Select Files Error Data:", errData);
    } catch (e) { /* Ignore JSON parse error if body is empty */ }

    throw new Error(`RD Select Files Error: ${errorMsg}`);
}

async function getTorrentInfoRD(torrentId) {
    console.log(`Getting info for RD torrent ID: ${torrentId}`);
    const response = await fetch(`https://api.real-debrid.com/rest/1.0/torrents/info/${torrentId}`, {
        method: "GET",
        headers: { "Authorization": `Bearer ${realDebridApiKey}` }
    });
    const data = await response.json();
     console.log("Get Info Response Status:", response.status);
     console.log("Get Info Response Data:", data);
    if (!response.ok || data.error) {
        throw new Error(`RD Get Info Error: ${data.error || 'Unknown'} (Status: ${response.status})`);
    }
    return data;
}

// Polling function integrated into the main flow when needed
async function pollTorrentCompletionRD(torrentId, maxAttempts = 20, delay = 3000) {
    console.log(`Polling completion for torrent ${torrentId}...`);
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const torrentInfo = await getTorrentInfoRD(torrentId);
            console.log(`Polling attempt ${i + 1}/${maxAttempts}, Status: ${torrentInfo.status}, Progress: ${torrentInfo.progress}%`);

            if (torrentInfo.status === 'downloaded') {
                console.log(`Torrent ${torrentId} processing complete. Links:`, torrentInfo.links);
                return torrentInfo.links; // Return the original download links from RD
            } else if (['magnet_error', 'error', 'virus', 'dead'].includes(torrentInfo.status)) {
                console.error(`Torrent ${torrentId} failed on Real-Debrid. Status: ${torrentInfo.status}`);
                throw new Error(`Torrent failed on Real-Debrid. Status: ${torrentInfo.status}`);
            }
            // If still processing, wait for the next poll
            await sleep(delay);
        } catch (error) {
            console.error(`Polling error for ${torrentId} (Attempt ${i+1}):`, error);
            // Don't retry immediately on API error, wait for the delay
            if (i === maxAttempts - 1) { // Throw if last attempt also failed
                 throw new Error(`Polling failed for torrent ${torrentId} after ${maxAttempts} attempts: ${error.message}`);
            }
            await sleep(delay);
        }
    }
    throw new Error(`Torrent ${torrentId} did not complete processing within the time limit (${maxAttempts} attempts).`);
}

async function unrestrictLinksRD(links) {
    console.log(`Unrestricting ${links.length} links...`);
    const unrestrictedLinks = [];
    for (const link of links) {
        try {
            const response = await fetch("https://api.real-debrid.com/rest/1.0/unrestrict/link", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${realDebridApiKey}`,
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                body: new URLSearchParams({ link: link })
            });
            const data = await response.json();
            console.log("Unrestrict Response Status:", response.status);
            console.log("Unrestrict Response Data:", data);
            if (!response.ok || data.error) {
                 throw new Error(data.error || `HTTP Error: ${response.status}`);
            }
            if (data.download) {
                unrestrictedLinks.push(data.download);
                console.log(`Successfully unrestricted link: ${data.download}`);
            } else {
                 console.warn(`Unrestrict response OK, but no 'download' field found for link: ${link}`);
            }
             await sleep(200); // Small delay between unrestricting calls
        } catch (error) {
            console.warn(`Failed to unrestrict link ${link}: ${error.message}. Skipping this link.`);
            // Continue with other links even if one fails
        }
    }
    console.log(`Successfully unrestricted ${unrestrictedLinks.length}/${links.length} links.`);
    return unrestrictedLinks;
}

async function sendToJDownloader(urls) {
    if (!urls || urls.length === 0) {
        console.log("No URLs to send to JDownloader.");
        return; // Nothing to do
    }
    console.log(`Sending ${urls.length} links to JDownloader...`);
    const jdUrl = `http://127.0.0.1:9666/flash/add`;
    const data = new URLSearchParams();
    data.append('urls', urls.join('')); // JDownloader expects newline separated URLs for POST

    try {
        const response = await fetch(jdUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: data.toString()
        });

        console.log("JDownloader Response Status:", response.status);
        if (!response.ok) {
            throw new Error(`JDownloader connection failed. Status: ${response.status}`);
        }
        console.log('Successfully sent links to JDownloader via background.');
    } catch (error) {
         console.error('Error sending to JDownloader:', error);
         throw new Error(`JDownloader Send Error: ${error.message}. Make sure JDownloader & FlashGot/Click'n'Load are running.`);
    }
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
              console.log("Fetching Nyaa search URL:", request.url);
              const response = await fetch(request.url, {
                  method: "GET",
                  headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0" }
              });
              if (!response.ok) throw new Error(`Nyaa Fetch HTTP error! Status: ${response.status}`);
              const html = await response.text();
              await setupOffscreenDocument('offscreen.html');
              // Send to potentially existing offscreen doc or the newly created one
              chrome.runtime.sendMessage({ action: 'parseNyaaHtml', html: html, episodeNum: request.episodeNum });
              console.log(`Sent HTML for Ep ${request.episodeNum} to offscreen doc for parsing.`);
          } catch (error) {
              console.error(`Error fetching/sending Nyaa search (Ep ${request.episodeNum}):`, error);
              // Inform popup/caller about the fetch error
              chrome.runtime.sendMessage({ action: 'fetchError', episodeNum: request.episodeNum, error: error.message });
          }
      })();
      // Response handled when offscreen script sends back 'parseComplete' or 'parseError'
      return false;
  }

   // --- Actions requiring API Key ---
   if (!realDebridApiKey) {
    const errorMsg = 'API Key not set. Please set it in the extension popup.';
    console.warn(`Action '${request.action}' blocked: ${errorMsg}`);
    sendResponse({ success: false, error: errorMsg });
    return false; // Synchronous response (error)
   }

  // Use an async IIFE to handle async operations within the listener
  (async () => {
    let responseSent = false; // Flag to prevent sending multiple responses
    try {
      switch (request.action) {
        // Keep existing actions if needed by the popup
        case "sendToRealDebrid":
          const addData = await addMagnetToRD(request.magnetLink);
          sendResponse({ success: true, data: addData });
          responseSent = true;
          break;
        case "getTorrentInfo":
          const infoData = await getTorrentInfoRD(request.id);
          sendResponse({ success: true, data: infoData });
          responseSent = true;
          break;
        case "selectFiles":
           await selectFilesRD(request.id);
           sendResponse({ success: true, data: {} });
           responseSent = true;
           break;
        case "unrestrictLink": // Popup might still call this individually
          const unrestrictData = await unrestrictLinksRD([request.downloadLink]); // Expects array
          // Send back the first (and only) unrestricted link or error
          if (unrestrictData.length > 0) {
             sendResponse({ success: true, data: { download: unrestrictData[0] } }); // Match structure popup expects
          } else {
             throw new Error("Failed to unrestrict the provided link.");
          }
          responseSent = true;
          break;
        case 'sendToJdownloader': // Popup might still call this
           await sendToJDownloader(request.urls);
           sendResponse({ success: true });
           responseSent = true;
           break;

        // Combined action from content script
        case 'processAndSendToJdViaContentScript':
            console.log(`Background: Received JD2 request for magnet: ${request.magnetLink}`);
            // 1. Add magnet
            const addedTorrent = await addMagnetToRD(request.magnetLink);
            // 2. Select files (fire and forget, RD handles async)
            await selectFilesRD(addedTorrent.id);
            // 3. Poll for completion to get RD links
            const rdLinks = await pollTorrentCompletionRD(addedTorrent.id);
            if (!rdLinks || rdLinks.length === 0) {
                 throw new Error('Torrent processed, but no links returned from Real-Debrid.');
            }
            // 4. Unrestrict the links
            const finalLinks = await unrestrictLinksRD(rdLinks);
            if (!finalLinks || finalLinks.length === 0) {
                throw new Error('Links found on Real-Debrid, but failed to unrestrict them.');
            }
            // 5. Send to JDownloader
            await sendToJDownloader(finalLinks);
            console.log(`Background: Successfully processed and sent ${finalLinks.length} links to JD2.`);
            sendResponse({ success: true });
            responseSent = true;
            break;

        // Deprecated? Keep for now if popup uses it.
        case 'addMagnetToRdViaContentScript':
           console.warn("'addMagnetToRdViaContentScript' action is deprecated, use 'processAndSendToJdViaContentScript' or popup's 'RD' button.");
           const simpleAdd = await addMagnetToRD(request.magnetLink);
           await selectFilesRD(simpleAdd.id);
           sendResponse({ success: true, data: { id: simpleAdd.id } });
           responseSent = true;
           break;

        default:
          console.warn("Unknown action received:", request.action);
          if (!responseSent) sendResponse({ success: false, error: `Unknown action: ${request.action}` });
          return; // Exit IIFE
      }
    } catch (error) {
        console.error(`Error handling action '${request.action}':`, error);
        const errorMessage = error.message || 'An unknown error occurred.';
        if (!responseSent) sendResponse({ success: false, error: errorMessage }); // Send error if no success response sent
    }
  })();

  return true; // Indicate that the response will be sent asynchronously
});


// --- Listener for Offscreen Document Responses ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Only handle messages expected from the offscreen script
    if (request.action === 'parseComplete' || request.action === 'parseError' || request.action === 'fetchError') {
        console.log(`Background received from offscreen/fetch: ${request.action}`, request);
        // Forward the result/error to the original caller (likely popup.js)
        chrome.runtime.sendMessage(request);
    }
    // This listener doesn't send responses itself.
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "sendToRealDebrid") {
        fetch("https://api.real-debrid.com/rest/1.0/torrents/addMagnet", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${request.apiKey}`,
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({ magnet: request.magnetLink })
        })
        .then(response => response.json())
        .then(data => sendResponse({ success: true, data }))
        .catch(error => sendResponse({ success: false, error: error.message }));

        return true; // Required for async sendResponse
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getTorrentInfo") {
        fetch("https://api.real-debrid.com/rest/1.0/torrents/info/" + request.id, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${request.apiKey}`
            }
        })
        .then(response => response.json())
        .then(data => sendResponse({ success: true, data }))
        .catch(error => sendResponse({ success: false, error: error.message }));

        return true; // Required for async sendResponse
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getDownloads") {
        fetch("https://api.real-debrid.com/rest/1.0/torrents", {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${request.apiKey}`,
                "offset": 0,
                "page": 0,
                "limit": 100
            }
        })
        .then(response => response.json())
        .then(data => sendResponse({ success: true, data }))
        .catch(error => sendResponse({ success: false, error: error.message }));

        return true; // Required for async sendResponse
    }
});


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "selectFiles") {
        fetch("https://api.real-debrid.com/rest/1.0/torrents/selectFiles/" + request.id, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${request.apiKey}`,
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({ files : "all" })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.text();  // Get raw text response
        })
        .then(text => {
            let data = {};
            if (text) {
                try {
                    data = JSON.parse(text);  // Only parse if text exists
                } catch (error) {
                    console.warn("Warning: Response was not valid JSON.", text);
                }
            }
            sendResponse({ success: true, data });
        })
        .catch(error => {
            console.error("Error selecting files:", error);
            sendResponse({ success: false, error: error.message });
        });

        return true; // Required for async sendResponse
    }
});


chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "fetchSearch") {
        fetch(request.url, {
            method: "GET",
            headers: {
                "User-Agent": "Mozilla/5.0" // Spoof User-Agent to avoid Cloudflare bot detection
            }
        })
        .then(response => response.text())
        .then(html => sendResponse({ success: true, html: html }))
        .catch(error => sendResponse({ success: false, error: error.message }));

        return true; // Keep the message channel open for async response
    }
});
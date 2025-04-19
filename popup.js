// Global state
let REAL_DEBRID_API_KEY = "";

// DOM Elements
let apiKeyInput;
let saveApiKeyButton;
let magnetLinksList;
let statusMessage;
let loadingIndicator;
let myAnimeListSection;
let generalLinksSection;

document.addEventListener('DOMContentLoaded', async () => {
    // Get DOM elements
    apiKeyInput = document.getElementById('apiKeyInput');
    saveApiKeyButton = document.getElementById('saveApiKey');
    magnetLinksList = document.getElementById('magnetLinksList');
    statusMessage = document.getElementById('statusMessage');
    loadingIndicator = document.getElementById('loadingIndicator');
    myAnimeListSection = document.getElementById('myAnimeListSection');
    generalLinksSection = document.getElementById('generalLinksSection');

    // Load saved API key
    const data = await chrome.storage.local.get('apiKey');
    if (data.apiKey) {
        apiKeyInput.value = data.apiKey;
        REAL_DEBRID_API_KEY = data.apiKey;
        updateStatus('API Key loaded.', 'success');
    } else {
        updateStatus('Real-Debrid API Key not set.', 'warning');
    }

    // Save API key button listener
    saveApiKeyButton.addEventListener('click', saveApiKey);

    // Determine page type and execute appropriate logic
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.url && tab.url.includes("myanimelist.net/anime/")) {
        showSection(myAnimeListSection);
        handleMyAnimeListPage(tab);
    } else {
        showSection(generalLinksSection);
        handleGenericPage(tab);
    }
});

// --- UI Helper Functions ---

function updateStatus(message, type = 'info') { // types: info, success, warning, error
    if (!statusMessage) return;
    statusMessage.textContent = message;
    statusMessage.className = `status ${type}`;
    console.log(`Status (${type}): ${message}`);
}

function showLoading(message = 'Loading...') {
    if (loadingIndicator) {
        loadingIndicator.textContent = message;
        loadingIndicator.style.display = 'block';
    }
    if (magnetLinksList) magnetLinksList.style.display = 'none';
}

function hideLoading() {
    if (loadingIndicator) loadingIndicator.style.display = 'none';
    if (magnetLinksList) magnetLinksList.style.display = 'block';
}

function showSection(sectionToShow) {
    myAnimeListSection.style.display = 'none';
    generalLinksSection.style.display = 'none';
    if (sectionToShow) {
        sectionToShow.style.display = 'block';
    }
}

function clearMagnetLinksList() {
    if (magnetLinksList) magnetLinksList.innerHTML = '';
}

// --- API Key Handling ---

async function saveApiKey() {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey) {
        try {
            // Send to background to store securely
            await chrome.runtime.sendMessage({ action: "storeApiKey", apiKey: apiKey });
            REAL_DEBRID_API_KEY = apiKey;
            updateStatus('API Key saved successfully!', 'success');
        } catch (error) {
            console.error("Error saving API Key:", error);
            updateStatus(`Failed to save API Key: ${error.message}`, 'error');
        }
    } else {
        updateStatus('API Key cannot be empty.', 'warning');
    }
}

// --- Generic Page Logic ---

async function handleGenericPage(tab) {
    updateStatus('Looking for magnet links...');
    showLoading('Extracting links...');
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: extractMagnetLinksFromPage // Function defined below
        });

        hideLoading();
        const links = results[0]?.result || [];
        clearMagnetLinksList();

        if (links.length > 0) {
            updateStatus(`Found ${links.length} magnet links.`, 'success');
            links.forEach(link => addMagnetLinkToList(link));
        } else {
            updateStatus('No magnet links found on this page.', 'info');
            magnetLinksList.innerHTML = '<li>No magnet links found.</li>';
        }
    } catch (error) {
        hideLoading();
        console.error("Error extracting magnet links:", error);
        updateStatus(`Error extracting links: ${error.message}`, 'error');
    }
}

// This function is injected into the content page
function extractMagnetLinksFromPage() {
    const links = document.getElementsByTagName('a');
    const magnetLinks = [];
    for (let i = 0; i < links.length; i++) {
        if (links[i].href.startsWith('magnet:?')) {
            magnetLinks.push(links[i].href);
        }
    }
    return magnetLinks;
}

function addMagnetLinkToList(link) {
    const listItem = document.createElement('li');

    const linkText = document.createElement('span');
    linkText.textContent = link.substring(0, 60) + '...'; // Shorten display
    linkText.title = link; // Full link on hover

    const buttonContainer = document.createElement('div');
    buttonContainer.classList.add('button-group');

    // Real-Debrid Button
    const rdButton = createButton('RD', 'rd-btn', () => processLinkWithRealDebrid(link));
    // JDownloader Button (via Real-Debrid)
    const jdButton = createButton('JD2', 'jd-btn', () => processAndSendToJdownloader(link));
    // Copy Button
    const copyButton = createButton('Copy', 'copy-btn', () => {
        navigator.clipboard.writeText(link)
            .then(() => updateStatus('Link copied!', 'success'))
            .catch(err => updateStatus(`Copy failed: ${err.message}`, 'error'));
    });

    buttonContainer.appendChild(rdButton);
    buttonContainer.appendChild(jdButton);
    buttonContainer.appendChild(copyButton);

    listItem.appendChild(linkText);
    listItem.appendChild(buttonContainer);
    magnetLinksList.appendChild(listItem);
}

// --- MyAnimeList Page Logic ---

async function handleMyAnimeListPage(tab) {
    updateStatus('MyAnimeList page detected. Fetching info...');
    showLoading('Fetching anime details...');
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: extractAnimeInfoFromPage // Function defined below
        });

        const animeInfo = results[0]?.result;
        if (!animeInfo || !animeInfo.name || !animeInfo.episodes) {
            throw new Error('Could not extract anime details from the page.');
        }

        updateStatus(`Found: ${animeInfo.name} (${animeInfo.episodes} episodes).`, 'info');

        // Display MAL info and button
        displayMyAnimeListInfo(animeInfo);
        hideLoading(); // Hide loading before starting episode search

    } catch (error) {
        hideLoading();
        console.error("Error handling MyAnimeList page:", error);
        updateStatus(`Error: ${error.message}`, 'error');
    }
}

// This function is injected into the MAL page
function extractAnimeInfoFromPage() {
    let name = document.querySelector('.title-name')?.textContent.trim() ||
               document.querySelector('h1.title-name strong')?.textContent.trim(); // Try alternative selector
    let episodesText = "Unknown";
    const detailElements = document.querySelectorAll('.spaceit_pad');
    for (let element of detailElements) {
        const textContent = element.textContent || "";
        if (textContent.includes("Episodes:")) {
            episodesText = textContent.replace(/Episodes:/i, "").trim();
            break;
        }
    }
    // Convert episodesText to number, handle 'Unknown' or ranges
    let episodes = parseInt(episodesText, 10);
    if (isNaN(episodes)) {
        episodes = 0; // Or handle 'Unknown' appropriately
    }

    return { name, episodes };
}

function displayMyAnimeListInfo(animeInfo) {
    const malInfoDiv = document.getElementById('malInfo');
    const fetchEpisodesButton = document.getElementById('fetchEpisodesButton');
    const episodeLinksList = document.getElementById('episodeLinksList');
    const malStatus = document.getElementById('malStatus');

    malInfoDiv.textContent = `Anime: ${animeInfo.name} | Episodes: ${animeInfo.episodes}`;
    episodeLinksList.innerHTML = ''; // Clear previous results
    malStatus.textContent = '';
    fetchEpisodesButton.disabled = false; // Ensure it's enabled initially

    fetchEpisodesButton.onclick = () => {
        // Disable button immediately on click
        fetchEpisodesButton.disabled = true;
        malStatus.textContent = 'Starting fetch...'; // Give immediate feedback

        if (animeInfo.episodes > 0) {
            // Pass the button itself to re-enable it later
            fetchAllEpisodes(animeInfo.name, animeInfo.episodes, fetchEpisodesButton);
        } else {
             malStatus.textContent = 'No episodes found to fetch.';
             fetchEpisodesButton.disabled = false; // Re-enable if nothing to do
        }
    };
    // Removed the line: fetchEpisodesButton.disabled = false; (it's handled above)
}


// Modify fetchAllEpisodes signature and completion block:
async function fetchAllEpisodes(name, totalEpisodes, fetchButtonElement) { // Added fetchButtonElement
    const searchName = name.replace(/ /g, "+");
    const malStatus = document.getElementById('malStatus');
    const episodeLinksList = document.getElementById('episodeLinksList');
    const sendAllToJDButton = document.getElementById('sendAllToJD');
    const episodeLinks = new Map(); // Store magnet links per episode

    malStatus.textContent = 'Fetching episode links...';
    episodeLinksList.innerHTML = ''; // Clear previous results
    episodeLinksList.innerHTML = '<li>Initializing search...</li>';
    sendAllToJDButton.style.display = 'none'; // Hide button initially
    sendAllToJDButton.onclick = null; // Clear previous handler

    let foundCount = 0;
    let completedCount = 0;
    const requestDelay = 500; // Fixed delay in ms between each request

    // Prepare UI elements map for quick access
    const statusSpans = new Map();

    // Prepare listeners for background responses
    const messageListener = async (message) => {
        // Ensure message has an episodeNum, otherwise ignore
        if (!message.episodeNum) return;

        if (message.action === 'parseComplete' || message.action === 'parseError' || message.action === 'fetchError') {
            const episodeNum = message.episodeNum;
            const statusSpan = statusSpans.get(episodeNum); // Get the span from the map

            // Avoid double counting if listener fires unexpectedly
            if (!statusSpan || statusSpan.dataset.processed) return;
            statusSpan.dataset.processed = true; // Mark as processed

            completedCount++;
            malStatus.textContent = `Fetching... (${completedCount}/${totalEpisodes}) | Found: ${foundCount}`;

            if (message.action === 'parseComplete' && message.magnetLink) {
                foundCount++;
                episodeLinks.set(episodeNum, message.magnetLink);
                if (statusSpan) {
                    statusSpan.textContent = '✅ Found';
                    statusSpan.className = 'status success'; // Add class for styling
                 } else {
                     console.warn(`Status span for Ep ${episodeNum} not found.`);
                 }
            } else {
                const errorMsg = message.action === 'fetchError' ? 'Fetch Error' : (message.action === 'parseError' ? 'Parse Error' : 'Not Found');
                const errorDetails = message.error || 'No link found';
                console.warn(`Error or no link for episode ${episodeNum}: ${errorDetails}`);
                 if (statusSpan) {
                     statusSpan.textContent = `❌ ${errorMsg}`;
                     statusSpan.title = errorDetails; // Show details on hover
                     statusSpan.className = message.action === 'fetchError' ? 'status error' : 'status warning'; // Add class
                 } else {
                     console.warn(`Status span for Ep ${episodeNum} not found.`);
                 }
            }

            // Check if all episodes are processed
            if (completedCount === totalEpisodes) {
                chrome.runtime.onMessage.removeListener(messageListener); // Clean up listener
                malStatus.textContent = `Search complete. Found ${foundCount}/${totalEpisodes} links.`;

                if (foundCount > 0) {
                    displayFoundEpisodeLinks(episodeLinks); // Display results
                    sendAllToJDButton.style.display = 'inline-block';
                    sendAllToJDButton.onclick = () => sendMultipleLinksToJdownloader(Array.from(episodeLinks.values()));
                } else {
                    // Clear the list items and show a single message
                    episodeLinksList.innerHTML = '<li>No magnet links found for any episode.</li>';
                }

                // Re-enable the fetch button now that processing is done
                if (fetchButtonElement) {
                    fetchButtonElement.disabled = false;
                }
            }
        }
    };
    // Clear any previous listeners just in case (though disabling button is primary fix)
    // Be cautious with this if other parts of the popup use listeners
    // chrome.runtime.onMessage.removeListener(messageListener); // Potentially risky if listener is shared
    chrome.runtime.onMessage.addListener(messageListener);

    // --- Modified Fetch Loop ---
    // Display placeholders first
    episodeLinksList.innerHTML = ''; // Clear "Initializing..." message
    for (let episodeNum = 1; episodeNum <= totalEpisodes; episodeNum++) {
        const listItem = document.createElement('li');
        listItem.className = 'episode-item'; // Add class for styling

        const labelSpan = document.createElement('span');
        labelSpan.className = 'episode-label';
        labelSpan.textContent = `Ep ${episodeNum}: `;

        const statusSpan = document.createElement('span');
        statusSpan.id = `status-ep-${episodeNum}`; // Keep ID for potential future use
        statusSpan.className = 'status info'; // Default status style
        statusSpan.textContent = '⏳ Pending...';
        statusSpan.dataset.processed = false; // Flag to prevent double counting
        statusSpans.set(episodeNum, statusSpan); // Store span in map

        listItem.appendChild(labelSpan);
        listItem.appendChild(statusSpan);
        episodeLinksList.appendChild(listItem);
    }

    // Initiate fetch requests sequentially with delay
    for (let episodeNum = 1; episodeNum <= totalEpisodes; episodeNum++) {
        const statusSpan = statusSpans.get(episodeNum);
        if (statusSpan) {
             statusSpan.textContent = '🔍 Searching...';
             statusSpan.className = 'status info'; // Ensure correct class
        }

        const episodeSearch = `https://nyaa.si/?f=0&c=0_0&q=${searchName}+S01E${String(episodeNum).padStart(2, "0")}&s=seeders&o=desc`;
        console.log(`Requesting search for Ep ${episodeNum}: ${episodeSearch}`);

        // Send the request
        chrome.runtime.sendMessage({ action: "fetchSearch", url: episodeSearch, episodeNum: episodeNum });

        // Wait before sending the next request
        if (episodeNum < totalEpisodes) {
           // console.log(`Waiting ${requestDelay}ms before next request...`);
            await sleep(requestDelay);
        }
    }
    console.log("All fetch requests sent.");
    // Note: Button is re-enabled in the message listener's completion block
}

function displayFoundEpisodeLinks(episodeLinksMap) {
    const episodeLinksList = document.getElementById('episodeLinksList');
    episodeLinksList.innerHTML = ''; // Clear previous logs

    // Sort episodes by number
    const sortedEpisodes = Array.from(episodeLinksMap.keys()).sort((a, b) => a - b);

    sortedEpisodes.forEach(epNum => {
        const magnetLink = episodeLinksMap.get(epNum);
        const listItem = document.createElement('li');

        const linkText = document.createElement('span');
        linkText.textContent = `Ep ${epNum}: ${magnetLink.substring(0, 40)}...`;
        linkText.title = magnetLink;

        const linkContainer = document.createElement('div');
        linkContainer.classList.add('link-container');

        const buttonGroup = document.createElement('div');
        buttonGroup.classList.add('button-group');

        const rdButton = createButton('RD', 'rd-btn', () => processLinkWithRealDebrid(magnetLink));
        const jdButton = createButton('JD2', 'jd-btn', () => processAndSendToJdownloader(magnetLink));
        const copyButton = createButton('Copy', 'copy-btn', () => {
            navigator.clipboard.writeText(magnetLink)
            .then(() => updateStatus(`Ep ${epNum} link copied!`, 'success'))
            .catch(err => updateStatus(`Copy failed: ${err.message}`, 'error'));
        });

        buttonGroup.appendChild(rdButton);
        buttonGroup.appendChild(jdButton);
        buttonGroup.appendChild(copyButton);
        // Add link to search query
        const searchLink = addSearchLink(episodeLinksList, epNum, episodeLinksMap);
        linkContainer.appendChild(buttonGroup);
        linkContainer.appendChild(searchLink);
        listItem.appendChild(linkText);
        listItem.appendChild(linkContainer);
        episodeLinksList.appendChild(listItem);
    });
}


// --- Core Processing Logic (Real-Debrid & JDownloader) ---

async function processLinkWithRealDebrid(magnetLink) {
    if (!REAL_DEBRID_API_KEY) {
        updateStatus('Set Real-Debrid API Key first!', 'error');
        return;
    }
    updateStatus(`Adding magnet to Real-Debrid...`, 'info');
    showLoading('Adding to RD...');

    try {
        // 1. Add magnet to RD
        const addResponse = await chrome.runtime.sendMessage({
            action: "sendToRealDebrid",
            magnetLink: magnetLink
        });
        if (!addResponse.success) throw new Error(addResponse.error || 'Failed to add magnet.');
        const torrentId = addResponse.data.id;
        updateStatus(`Added magnet (ID: ${torrentId}). Selecting files...`, 'info');

        // 2. Select files (async, RD handles this)
        const selectResponse = await chrome.runtime.sendMessage({
            action: "selectFiles",
            id: torrentId
        });
        // Selection might return 204 No Content on success, or RD might take time.
        // We don't strictly need to wait for this for basic adding.
        if (!selectResponse.success) {
            // Log warning but proceed, user might need to manually select on RD website
            console.warn(`File selection for ${torrentId} might have failed: ${selectResponse.error}`);
             updateStatus(`Added magnet (ID: ${torrentId}). File selection may need manual confirmation on RD website.`, 'warning');
        } else {
             updateStatus(`Added magnet (ID: ${torrentId}) and selected files.`, 'success');
        }

        hideLoading();
        // Optionally: Poll getTorrentInfo until status is 'downloaded'
        // Optionally: Call unrestrictLink if needed immediately (usually not for just adding)

    } catch (error) {
        hideLoading();
        console.error("Real-Debrid processing error:", error);
        updateStatus(`RD Error: ${error.message}`, 'error');
    }
}

async function processAndSendToJdownloader(magnetLink) {
    if (!REAL_DEBRID_API_KEY) {
        updateStatus('Set Real-Debrid API Key first!', 'error');
        return;
    }
    updateStatus(`Processing link for JDownloader...`, 'info');
    showLoading('RD > JD2...');

    try {
        // 1. Add magnet to RD
        const addResponse = await chrome.runtime.sendMessage({ action: "sendToRealDebrid", magnetLink: magnetLink });
        if (!addResponse.success) throw new Error(`RD Add Magnet: ${addResponse.error}`);
        const torrentId = addResponse.data.id;
        updateStatus(`Added (ID: ${torrentId}). Selecting files...`, 'info');

        // 2. Select files
        const selectResponse = await chrome.runtime.sendMessage({ action: "selectFiles", id: torrentId });
        // Allow continuing even if selection has issues, RD might auto-select common files.
        if (!selectResponse.success) {
            console.warn(`RD File Select (${torrentId}): ${selectResponse.error}`);
            updateStatus(`Added (ID: ${torrentId}). File selection warning: ${selectResponse.error}. Checking status...`, 'warning');
        } else {
            updateStatus(`Added & selected (ID: ${torrentId}). Checking status...`, 'info');
        }

        // 3. Poll for completion and get download links
        const finalLinks = await pollTorrentCompletion(torrentId);
        if (!finalLinks || finalLinks.length === 0) {
            throw new Error('Could not get download links from Real-Debrid after processing.');
        }
        updateStatus(`Got ${finalLinks.length} download links. Sending to JDownloader...`, 'info');

        // 4. Send to JDownloader
        await sendLinksToJdownloader(finalLinks);
        updateStatus(`Successfully sent ${finalLinks.length} links to JDownloader.`, 'success');
        hideLoading();

    } catch (error) {
        hideLoading();
        console.error("RD to JDownloader error:", error);
        updateStatus(`Error: ${error.message}`, 'error');
    }
}

async function sendMultipleLinksToJdownloader(magnetLinks) {
    if (!REAL_DEBRID_API_KEY) {
        updateStatus('Set Real-Debrid API Key first!', 'error');
        return;
    }
    updateStatus(`Processing ${magnetLinks.length} links for JDownloader...`, 'info');
    showLoading(`Processing ${magnetLinks.length} links...`);

    let allFinalLinks = [];
    let errors = [];
    let currentLinkIndex = 0;

    for (const magnet of magnetLinks) {
        currentLinkIndex++;
        updateStatus(`Processing link ${currentLinkIndex}/${magnetLinks.length}...`, 'info');
        showLoading(`RD > JD2 (${currentLinkIndex}/${magnetLinks.length})...`);
        try {
            // 1. Add magnet
            const addResponse = await chrome.runtime.sendMessage({ action: "sendToRealDebrid", magnetLink: magnet });
            if (!addResponse.success) throw new Error(`Add Magnet: ${addResponse.error}`);
            const torrentId = addResponse.data.id;

            // 2. Select files
            const selectResponse = await chrome.runtime.sendMessage({ action: "selectFiles", id: torrentId });
            if (!selectResponse.success) console.warn(`File Select Warn (${torrentId}): ${selectResponse.error}`);

            // 3. Poll for completion
            const finalLinks = await pollTorrentCompletion(torrentId);
            if (finalLinks && finalLinks.length > 0) {
                allFinalLinks.push(...finalLinks);
            } else {
                 console.warn(`No links found for torrent ${torrentId} after polling.`);
                 // Optionally add a user-facing warning here
            }
             await sleep(500); // Small delay between processing links
        } catch (error) {
            console.error(`Error processing magnet [${magnet.substring(0,30)}...]: ${error.message}`);
            errors.push(`Link ${currentLinkIndex}: ${error.message}`);
            // Continue to next magnet link
        }
    }

    // 4. Send all collected links to JDownloader
    if (allFinalLinks.length > 0) {
        updateStatus(`Collected ${allFinalLinks.length} links. Sending to JDownloader...`, 'info');
        try {
            await sendLinksToJdownloader(allFinalLinks);
            updateStatus(`Sent ${allFinalLinks.length} links to JDownloader. ${errors.length} errors occurred.`, errors.length > 0 ? 'warning' : 'success');
        } catch (jdError) {
            errors.push(`JDownloader Send Error: ${jdError.message}`);
            updateStatus(`Failed to send links to JDownloader: ${jdError.message}. ${errors.length} other errors.`, 'error');
        }
    } else {
        updateStatus(`No links collected to send. ${errors.length} errors occurred during processing.`, errors.length > 0 ? 'error' : 'warning');
    }

    hideLoading();
    if (errors.length > 0) {
        console.error("Errors during batch processing:", errors);
        // Optionally display errors more prominently
    }
}

async function pollTorrentCompletion(torrentId, maxAttempts = 20, delay = 3000) {
    updateStatus(`Waiting for RD processing (ID: ${torrentId})...`, 'info');
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const infoResponse = await chrome.runtime.sendMessage({ action: "getTorrentInfo", id: torrentId });
            if (!infoResponse.success) throw new Error(`GetInfo: ${infoResponse.error}`);

            const torrentInfo = infoResponse.data;
            updateStatus(`RD Status (ID: ${torrentId}): ${torrentInfo.status} (${torrentInfo.progress}%)`, 'info');

            if (torrentInfo.status === 'downloaded') {
                console.log(`Torrent ${torrentId} ready. Unrestricting links.`);
                // Need to unrestrict the links provided in torrentInfo.links
                const unrestrictedLinks = [];
                for (const link of torrentInfo.links) {
                     const unrestrictResponse = await chrome.runtime.sendMessage({ action: "unrestrictLink", downloadLink: link });
                     if (unrestrictResponse.success && unrestrictResponse.data.download) {
                         unrestrictedLinks.push(unrestrictResponse.data.download);
                     } else {
                         console.warn(`Failed to unrestrict link ${link}: ${unrestrictResponse.error || 'Unknown reason'}`);
                         // Decide if you want to skip this link or fail entirely
                     }
                     await sleep(200); // Small delay between unrestricting calls
                }
                return unrestrictedLinks;
            } else if (['magnet_error', 'error', 'virus', 'dead'].includes(torrentInfo.status)) {
                throw new Error(`Torrent failed on Real-Debrid. Status: ${torrentInfo.status}`);
            }
            // If still processing, wait
            await sleep(delay);
        } catch (error) {
            // If getTorrentInfo fails, maybe retry or throw
            console.error(`Polling error for ${torrentId}: ${error.message}`);
            if (i === maxAttempts - 1) { // Throw if last attempt failed
                 throw new Error(`Polling failed for torrent ${torrentId}: ${error.message}`);
            }
            await sleep(delay); // Wait before retrying after an error
        }
    }
    throw new Error(`Torrent ${torrentId} did not complete processing within the time limit.`);
}

function addSearchLink(episodeLinksList, epNum, episodeLinksMap) {
    const searchLink = document.createElement('a');
    const episodeSearch = episodeLinksMap.get(epNum).split('&tr')[0].split('magnet:?xt=urn:btih:')[0];
    searchLink.href = episodeSearch;
    searchLink.textContent = "Search Query";
    searchLink.target = "_blank";
    return searchLink;
}

async function sendLinksToJdownloader(links) {
    if (!links || links.length === 0) {
        updateStatus('No links to send to JDownloader.', 'warning');
        return;
    }
    updateStatus(`Sending ${links.length} links to JDownloader...`, 'info');
    try {
        const response = await chrome.runtime.sendMessage({
            action: 'sendToJdownloader',
            urls: links
        });
        if (!response.success) {
            throw new Error(response.error || 'Unknown JDownloader error');
        }
        console.log('Successfully sent links to JDownloader via background.');
        updateStatus('Links sent to JDownloader successfully!', 'success');
    } catch (error) {
        console.error('Failed to send links to JDownloader:', error);
        updateStatus(`JDownloader Error: ${error.message}`, 'error');
        // Re-throw the error if needed for higher-level handling
        throw error;
    }
}

// --- Utility Functions ---

function createButton(text, className, onClick) {
    const button = document.createElement('button');
    button.textContent = text;
    button.className = className; // Add specific class
    button.classList.add('action-button'); // Add general class
    button.addEventListener('click', onClick);
    return button;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Listen for messages from background (e.g., Nyaa parse results)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // This listener in popup.js is primarily for messages *not* handled
    // by specific async/await flows, like the Nyaa parse results.
    // The fetchAllEpisodes function now sets up its own temporary listener.
    console.log("Popup received message: ", message);
});

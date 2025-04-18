// offscreen.js

chrome.runtime.onMessage.addListener(async (request) => {
  if (request.action === 'parseNyaaHtml') {
    const { html, episodeNum } = request;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      // Get the first torrent row
      const firstRow = doc.querySelector("tbody tr.default");
      if (!firstRow) {
        console.log(`No valid result found for Episode ${episodeNum}`);
        chrome.runtime.sendMessage({ action: 'parseComplete', episodeNum, magnetLink: null });
        return;
      }

      // Get the magnet link
      const magnetLinkTag = firstRow.querySelector('td a[href^="magnet:"]');
      const magnetLink = magnetLinkTag ? magnetLinkTag.href : null;

      if (magnetLink) {
        console.log(`Found magnet link for Episode ${episodeNum}:`, magnetLink);
      } else {
        console.log(`No magnet link found on the first row for Episode ${episodeNum}`);
      }

      // Send the result back to the service worker
      chrome.runtime.sendMessage({ action: 'parseComplete', episodeNum, magnetLink });
    } catch (error) {
      console.error(`Error parsing HTML for episode ${episodeNum}:`, error);
      chrome.runtime.sendMessage({ action: 'parseError', episodeNum, error: error.message });
    }
  }
});

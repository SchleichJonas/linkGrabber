// content.js

function addJdButton(container, magnetLink) {
    // Check if button already exists
    if (container.querySelector('.jd2-button-site')) {
        return; // Already added
    }

    const jdButton = document.createElement('button');
    jdButton.textContent = 'JD2';
    jdButton.className = 'jd2-button-site btn btn-success btn-sm'; // Use Nyaa classes + custom (changed color)
    jdButton.style.marginLeft = '5px'; // Add some space
    jdButton.style.verticalAlign = 'middle'; // Align with other links/buttons
    jdButton.title = 'Send to Real-Debrid then to JDownloader2'; // Tooltip

    jdButton.addEventListener('click', (event) => {
        event.preventDefault(); // Prevent any default action
        event.stopPropagation(); // Stop event bubbling

        console.log('JD2 Button clicked:', magnetLink);
        jdButton.textContent = 'Processing...';
        jdButton.disabled = true;

        // Send message to background to handle the full RD -> JD2 flow
        chrome.runtime.sendMessage({ action: "processAndSendToJdViaContentScript", magnetLink: magnetLink }, (response) => {
            if (chrome.runtime.lastError) {
                // Handle errors like background script not ready or other issues
                console.error('Error sending message:', chrome.runtime.lastError.message);
                jdButton.textContent = 'Error!';
                jdButton.style.backgroundColor = '#dc3545'; // Red for error
                setTimeout(() => {
                    jdButton.textContent = 'JD2';
                    jdButton.disabled = false;
                    jdButton.style.backgroundColor = ''; // Reset style
                }, 5000); // Longer timeout for errors
            } else if (response && response.success) {
                console.log('Successfully processed and sent to JD2');
                jdButton.textContent = 'Sent!';
                jdButton.style.backgroundColor = '#198754'; // Darker green for success
                // Optionally reset button after a delay
                setTimeout(() => {
                    jdButton.textContent = 'JD2';
                    jdButton.disabled = false;
                    jdButton.style.backgroundColor = ''; // Reset style
                }, 3000);
            } else {
                const errorMessage = response ? (response.error || 'Unknown Error') : 'No response';
                console.error('Failed to process/send to JD2:', errorMessage);
                jdButton.textContent = 'Failed!';
                jdButton.title = `Error: ${errorMessage}`; // Show error on hover
                jdButton.style.backgroundColor = '#dc3545'; // Red for error
                 setTimeout(() => {
                    jdButton.textContent = 'JD2';
                    jdButton.disabled = false;
                    jdButton.style.backgroundColor = ''; // Reset style
                    jdButton.title = 'Send to Real-Debrid then to JDownloader2'; // Reset tooltip
                }, 5000); // Longer timeout for errors
            }
        });
    });

    // Insert the button after the magnet link
    const magnetLinkElement = container.querySelector('a[href^="magnet:?"]');
    if (magnetLinkElement) {
        // Insert after the magnet link
        magnetLinkElement.parentNode.insertBefore(jdButton, magnetLinkElement.nextSibling);
    }
}

function findAndAddButtons() {
    // Selectors for both the torrent listing table and the torrent details page footer
    const containers = document.querySelectorAll('div.panel-footer.clearfix, td.text-center');

    containers.forEach(container => {
        const magnetLinkElement = container.querySelector('a[href^="magnet:?"]');
        if (magnetLinkElement) {
            const magnetLink = magnetLinkElement.href;
            // Determine the correct parent/reference element for insertion
            let insertionReference = container;
            if (container.tagName === 'TD') {
                // In table view, find the magnet link within the TD
                insertionReference = container.querySelector('a[href^="magnet:?"]');
            }
            if (insertionReference) {
                 addJdButton(insertionReference.parentNode, magnetLink); // Pass parent node for insertion
            }

        }
    });
}

// Run the function initially when the page loads
findAndAddButtons();

// Use MutationObserver to detect dynamically loaded content or page updates (less common on Nyaa)
const observer = new MutationObserver((mutations) => {
    let needsReScan = false;
    for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
            // Simple check: if any nodes were added, re-scan
            needsReScan = true;
            break;
        }
    }
    if (needsReScan) {
        // Debounce this in a real-world scenario if it fires too often
        // console.log("DOM changed, re-scanning for buttons...");
        findAndAddButtons();
    }
});

// Observe the body for changes in the DOM tree
observer.observe(document.body, { childList: true, subtree: true });

// Add some basic styles for the button if Nyaa's default styling isn't sufficient
const style = document.createElement('style');
style.textContent = `
    .jd2-button-site {
        /* Add any custom styles here if needed, */
        /* e.g., ensure visibility if classes change */
        padding: 2px 6px; /* Adjust padding slightly */
        font-size: 0.8em; /* Slightly smaller font */
    }
`;
document.head.appendChild(style);

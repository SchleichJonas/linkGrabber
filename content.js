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
            // *** BEGIN Context Invalidation Check ***
            if (chrome.runtime.lastError) {
                // Check if the error message indicates context invalidation
                if (chrome.runtime.lastError.message?.includes("Extension context invalidated")) {
                    console.warn('JD2 Button Response: Context invalidated (e.g., page navigated away). Cannot update button status.');
                    // No further action needed, button is likely gone or irrelevant
                } else {
                    // Handle other unexpected errors during message sending/receiving
                    console.error('JD2 Button Response Error:', chrome.runtime.lastError.message);
                    // Attempt to update button to show error, but it might fail if context is gone
                    try {
                       jdButton.textContent = 'Error!';
                       jdButton.style.backgroundColor = '#dc3545'; // Red for error
                       jdButton.title = `Error: ${chrome.runtime.lastError.message}`;
                    } catch (e) { /* Ignore if button access fails */ }
                }
                return; // Stop processing this callback
            }
            // *** END Context Invalidation Check ***

            // --- Proceed only if context is valid ---

            if (response && response.success) {
                console.log('Successfully processed and sent to JD2');
                jdButton.textContent = 'Sent!';
                jdButton.style.backgroundColor = '#198754'; // Darker green for success
                jdButton.title = 'Successfully sent to JDownloader2 via Real-Debrid';
                // Optionally reset button after a delay
                setTimeout(() => {
                    // Check if button still exists before resetting
                    if (document.body.contains(jdButton)) {
                        jdButton.textContent = 'JD2';
                        jdButton.disabled = false;
                        jdButton.style.backgroundColor = ''; // Reset style
                        jdButton.title = 'Send to Real-Debrid then to JDownloader2';
                    }
                }, 3000);
            } else {
                const errorMessage = response ? (response.error || 'Unknown Error') : 'Failed (No response from background)';
                console.error('Failed to process/send to JD2:', errorMessage);
                jdButton.textContent = 'Failed!';
                jdButton.title = `Error: ${errorMessage}`; // Show error on hover
                jdButton.style.backgroundColor = '#dc3545'; // Red for error
                 setTimeout(() => {
                     // Check if button still exists before resetting
                    if (document.body.contains(jdButton)) {
                        jdButton.textContent = 'JD2';
                        jdButton.disabled = false;
                        jdButton.style.backgroundColor = ''; // Reset style
                        jdButton.title = 'Send to Real-Debrid then to JDownloader2'; // Reset tooltip
                    }
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
             // In table view (td.text-center), the magnet link is usually inside the TD.
             // In footer view (div.panel-footer), the magnet link is directly inside.
             // We need the *parent* of the magnet link to insert the button *after* it.
            let parentForInsertion = magnetLinkElement.parentNode;

            if (parentForInsertion) {
                 addJdButton(parentForInsertion, magnetLink);
            } else {
                 console.warn("Could not find suitable parent to insert JD2 button near:", magnetLinkElement);
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
            // Check if any added node might contain relevant elements
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    if (node.querySelector('a[href^="magnet:?"]')) {
                        needsReScan = true;
                    }
                }
            });
        }
        if (needsReScan) break; // No need to check further mutations
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

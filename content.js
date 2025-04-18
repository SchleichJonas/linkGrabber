// content.js

function addRealDebridButton(container, magnetLink) {
    // Check if button already exists
    if (container.querySelector('.rd-button-site')) {
        return; // Already added
    }

    const rdButton = document.createElement('button');
    rdButton.textContent = 'Add to RD';
    rdButton.className = 'rd-button-site btn btn-primary btn-sm'; // Use Nyaa classes + custom
    rdButton.style.marginLeft = '5px'; // Add some space
    rdButton.style.verticalAlign = 'middle'; // Align with other links/buttons

    rdButton.addEventListener('click', (event) => {
        event.preventDefault(); // Prevent any default action
        event.stopPropagation(); // Stop event bubbling

        console.log('RD Button clicked:', magnetLink);
        rdButton.textContent = 'Adding...';
        rdButton.disabled = true;

        chrome.runtime.sendMessage({ action: "addMagnetToRdViaContentScript", magnetLink: magnetLink }, (response) => {
            if (chrome.runtime.lastError) {
                // Handle errors like background script not ready or other issues
                console.error('Error sending message:', chrome.runtime.lastError.message);
                rdButton.textContent = 'Error!';
                rdButton.style.backgroundColor = '#dc3545'; // Red for error
                setTimeout(() => {
                    rdButton.textContent = 'Add to RD';
                    rdButton.disabled = false;
                    rdButton.style.backgroundColor = ''; // Reset style
                }, 3000);
            } else if (response && response.success) {
                console.log('Successfully added to RD:', response.data);
                rdButton.textContent = 'Added!';
                rdButton.style.backgroundColor = '#28a745'; // Green for success
                 // Optionally reset button after a delay
                setTimeout(() => {
                    rdButton.textContent = 'Add to RD';
                    rdButton.disabled = false;
                    rdButton.style.backgroundColor = ''; // Reset style
                }, 3000);
            } else {
                console.error('Failed to add to RD:', response ? response.error : 'No response');
                rdButton.textContent = 'Failed!';
                rdButton.style.backgroundColor = '#dc3545'; // Red for error
                 setTimeout(() => {
                    rdButton.textContent = 'Add to RD';
                    rdButton.disabled = false;
                    rdButton.style.backgroundColor = ''; // Reset style
                }, 3000);
            }
        });
    });

    // Insert the button after the magnet link
    const magnetLinkElement = container.querySelector('a[href^="magnet:?"]');
    if (magnetLinkElement) {
        magnetLinkElement.parentNode.insertBefore(rdButton, magnetLinkElement.nextSibling);
    }
}

function findAndAddButtons() {
    console.log("Content script running on nyaa.si");
    const containers = document.querySelectorAll('div.panel-footer.clearfix, td.text-center'); // Add both list and view page selectors

    containers.forEach(container => {
        const magnetLinkElement = container.querySelector('a[href^="magnet:?"]');
        if (magnetLinkElement) {
            const magnetLink = magnetLinkElement.href;
            // Determine the correct parent for insertion based on selector
            let insertionParent = container;
            if (container.tagName === 'TD') {
                 // In table view, the TD itself is a good reference, or its parent TR
                 insertionParent = container; // Or container.parentElement for the row
            }
            addRealDebridButton(insertionParent, magnetLink);
        }
    });
}

// Run the function initially
findAndAddButtons();

// Optional: Use MutationObserver to detect dynamically loaded content if needed
// (Nyaa.si doesn't seem to load results dynamically on standard browsing, but good practice)
const observer = new MutationObserver((mutations) => {
    // Check if new nodes were added that might contain links
    let needsReScan = false;
    for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
            needsReScan = true;
            break;
        }
    }
    if (needsReScan) {
        // Debounce or throttle this if it fires too often
        findAndAddButtons();
    }
});

// Start observing the document body for added nodes
observer.observe(document.body, { childList: true, subtree: true });

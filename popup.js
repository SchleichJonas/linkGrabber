REAL_DEBRID_API_KEY = "";

document.addEventListener('DOMContentLoaded', function () {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        let tab = tabs[0];
        let url = tab.url;

        if (url.includes("myanimelist.net/anime/")) {
            MyAnimeList(tab.id);
        } else {
            extractMagnetLinks(tab.id);
        }
        
    });
});

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchEpisodes(episodes, searchName) {
    link_list = [];
    for (let i = 1; i <= episodes; i++) {
        let episodeSearch = `https://nyaa.si/?f=0&c=0_0&q=${searchName}+S01E${i.toString().padStart(2, "0")}&s=seeders&o=desc`;
        console.log("episodeSearch: " + episodeSearch);

        try {
            const response = await new Promise((resolve) => {
                chrome.runtime.sendMessage({ action: "fetchSearch", url: episodeSearch }, resolve);
            });

            if (response.success) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(response.html, "text/html");

                // Get the first torrent row
                const firstRow = doc.querySelector("tbody tr.default");
                if (!firstRow) {
                    console.log(`No valid result found for Episode ${i}`);
                    continue;
                }

                // Get the torrent title
                const firstResult = firstRow.querySelector("td:nth-child(2) a");
                if (firstResult) {
                    console.log("First Result:", firstResult.textContent.trim());
                } else {
                    console.log(`No valid title found for Episode ${i}`);
                }

                // Get the magnet link (find <a> inside <td> that has an <i class="fa fa-fw fa-magnet">)
                const magnetLinkTag = firstRow.querySelector('td a[href^="magnet:"]');
                const magnetLink = magnetLinkTag ? magnetLinkTag.href : "No magnet link found";
                link_list.push(magnetLink);
                console.log("Magnet Link:", magnetLink);
            } else {
                console.error("Error fetching search results:", response.error);
            }
        } catch (error) {
            console.error("Fetch failed:", error);
        }

        // Wait 500ms before the next iteration
        await sleep(500);
    }
    return link_list;
}



async function MyAnimeList(tabId) {
    try {
        // Wrap chrome.tabs.executeScript inside a promise to allow using await
        let results = await new Promise((resolve, reject) => {
            chrome.tabs.executeScript(tabId, {
                code: '(' + extractInfo.toString() + ')();'
            }, (results) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(results);
                }
            });
        });

        console.log("Extracted info:", results[0]);

        let animeInfo = results[0];
        let name = animeInfo.name;
        let episodes = animeInfo.episodes;

        let searchName = name.replace(/ /g, "+");
        console.log("searchName: " + searchName);

        // Call the async function to fetch episodes
        let link_list = await fetchEpisodes(episodes, searchName);

        console.log("Anime Name:", name);
        console.log("Episodes:", episodes);

        let list = document.getElementById('magnetLinksList');
        if (!list) {
            console.error("Element with ID 'magnetLinksList' not found.");
            return;
        }
        console.log(window.getComputedStyle(list).display);
        list.innerHTML = ''; // Clear previous list

        let listItem = document.createElement('li');

        let button_jd2 = document.createElement('button');
        button_jd2.textContent = "Click'n Load";
        button_jd2.classList.add("download-btn"); // Use CSS class for styling
        button_jd2.addEventListener('click', async function () {  // Make this async
            for (const element of link_list) {
                await downloadFiles(element, function (torrent) {
                    SendToJD2(torrent);
                });
                await sleep(500); // You can now await here
            }
        });
        console.log("Appending button to listItem:", button_jd2);
        console.log("Appending listItem to list:", list);

        listItem.appendChild(button_jd2);
        list.appendChild(listItem);

        console.log("Final list innerHTML:", list.innerHTML);
    } catch (error) {
        console.error("Error occurred:", error);
    }
}

function extractInfo() {
    console.log("extractInfo is running");

    let name = document.querySelector('.title-english.title-inherit')?.textContent.trim() || "No name found";
    let elements = document.querySelectorAll('.spaceit_pad');
    let episodes = 0;

    console.log("Extracted name:", name);

    for (let element of elements) {
        let label = element.querySelector('.dark_text')?.textContent.trim();
        if (label === "Episodes:") {
            episodes = element.textContent.replace("Episodes:", "").trim();
        }
    }

    console.log("Extracted episodes:", episodes);

    return { name, episodes };
}


function extractMagnetLinks(tabId){
    chrome.tabs.executeScript(tabId, {
        code: `
            var links = document.getElementsByTagName('a');
            var magnetLinks = [];
            for (var i = 0; i < links.length; i++) {
                if (links[i].href.includes('magnet')) {
                    magnetLinks.push(links[i].href);
                }
            }
            magnetLinks;
        `
    }, function (results) {
        if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError);
            return;
        }

        let links = results[0] || [];
        let list = document.getElementById('magnetLinksList');
        list.innerHTML = ''; // Clear previous list

        if (links.length > 0) {
            links.forEach(function (link) {
                let listItem = document.createElement('li');
                
                // Create anchor tag
                let anchor = document.createElement('a');
                anchor.href = link;
                anchor.textContent = link;
                anchor.target = "_blank";

                // Create button
                let button = document.createElement('button');
                button.textContent = "Copy";
                button.classList.add("copy-btn"); // Use CSS class for styling
                button.addEventListener('click', function () {
                    navigator.clipboard.writeText(link).then(() => {
                        alert("Magnet link copied!");
                    }).catch(err => console.error("Failed to copy: ", err));
                });


                let button_debrid = document.createElement('button');
                button_debrid.textContent = "Real Debrid";
                button_debrid.classList.add("debrid-btn"); // Use CSS class for styling
                button_debrid.addEventListener('click', function () {
                    addFilesToRealDebrid(link);
                });

                let button_download = document.createElement('button');
                button_download.textContent = "Download";
                button_download.classList.add("download-btn"); // Use CSS class for styling
                button_download.addEventListener('click', function () {
                    downloadFiles(link, function(torrent){
                        
                    });
                });

                let button_jd2 = document.createElement('button');
                button_jd2.textContent = "Click'n Load";
                button_jd2.classList.add("download-btn"); // Use CSS class for styling
                button_jd2.addEventListener('click', function () {
                    downloadFiles(link, function(torrent){
                        SendToJD2(torrent);
                    });
                });


                listItem.appendChild(anchor);
                listItem.appendChild(button);
                listItem.appendChild(button_debrid);
                listItem.appendChild(button_download);
                listItem.appendChild(button_jd2);
                list.appendChild(listItem);
            });
        } else {
            list.innerHTML = '<li>No magnet links found.</li>';
        }
    });
}


document.addEventListener('DOMContentLoaded', function () {
    const apiKeyInput = document.getElementById('apiKeyInput');
    const saveApiKeyButton = document.getElementById('saveApiKey');

    chrome.storage.local.get('apiKey', function (data) {
        if (data.apiKey) {
            apiKeyInput.value = data.apiKey;
            REAL_DEBRID_API_KEY = data.apiKey;
        }
    });

    // Save API key when button is clicked
    saveApiKeyButton.addEventListener('click', function () {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            chrome.storage.local.set({ apiKey: apiKey }, function () {
                alert("API Key saved successfully!");
            });
        }
    });
});





function sendToRealDebrid(magnetLink, callback) {
    chrome.runtime.sendMessage({
        action: "sendToRealDebrid",
        apiKey: REAL_DEBRID_API_KEY,
        magnetLink: magnetLink
    }, response => {
        if (response.success) {
            console.log("Magnet link: " + magnetLink);
            console.log("Magnet added! Torrent ID: " + response.data.id);
            callback(response.data)
        } else {
            console.warn("Error: " + response.error);
        }
    });
}

function getTorrentInfo(id, callback){
    chrome.runtime.sendMessage({
        action: "getTorrentInfo",
        apiKey: REAL_DEBRID_API_KEY,
        id: id
    }, response => {
        if(response.success){
            callback(response.data);
        } else {
            console.warn("Error: " + response.error);
        }
    })
}

function selectFiles(id, callback){
    chrome.runtime.sendMessage({
        action: "selectFiles",
        apiKey: REAL_DEBRID_API_KEY,
        id: id
    }, response => {
        if(response.success){
            console.log("selected all files successfully")
            if (callback) callback();
        } else {
            console.warn("Error: " + response.error);
        }
    })
}

function getDownloadLinks(callback) {
    chrome.runtime.sendMessage({
        action: "getDownloads",
        apiKey: REAL_DEBRID_API_KEY
    }, response => {
        if (response.success) {
            console.log("Download links received:", response.data);
            callback(response.data);  // Pass the download links to the callback
        } else {
            console.warn("Error: " + response.error);
        }
    });
}


function addFilesToRealDebrid(magnetLink, callback) {
    sendToRealDebrid(magnetLink, function(magnetResponseData){
        console.log(magnetResponseData.id);
        selectFiles(magnetResponseData.id, function(){
            getTorrentInfo(magnetResponseData.id, function(infoResponseData){
                console.log(infoResponseData.filename);
                console.log(infoResponseData.host);
                console.log(infoResponseData.progress);
                console.log(infoResponseData.status);
                if (callback) callback();
            });
        });
    });
}

function downloadFiles(magnetLink, callback){
    sendToRealDebrid(magnetLink, function(magnetResponseData){
        console.log(magnetResponseData.id);
        selectFiles(magnetResponseData.id, function(){
            getTorrentInfo(magnetResponseData.id, function(infoResponseData){
                console.log(infoResponseData.filename);
                console.log(infoResponseData.host);
                console.log(infoResponseData.progress);
                console.log(infoResponseData.status);
                getDownloadLinks(function(downloadLinks){
                    console.log("Received download links:", downloadLinks);
                    downloadLinks.forEach(link => {
                        // Here you could create download buttons or open the download links
                        if(link.id == magnetResponseData.id){
                            console.log("Download this link:", link);
                            link.links.forEach(download_link => {
                                console.log(download_link);
                            })
                            callback(link);
                    }
                    });
                });
            });
        });
    });
}


function SendToJD2(torrent){
    const jdUrl = "http://127.0.0.1:9666/flash/add";

    let urls = ""
    torrent.links.forEach(link =>{
        urls = urls + link + ","
    })
    fetch(jdUrl + "?" +"&&"+ urls, {
        method: "GET"
    })
    .catch(error => {
        alert("Error connecting to JDownloader: " + error.message);
    });
}

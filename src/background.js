// context menu entries need to be tracked to be updated
window.contextMenuMatchRegexMenus = [];
window.contextMenuSearchTerms = "";
window.tabTerms = [];

var userOptions = {};
var userOptionsBackup = {};
var highlightTabs = [];
var isAndroid = false;
var firefoxSearchEngines = [];

(async() => {
	let info = await browser.runtime.getPlatformInfo();
	if ( info && info.os === "android")
		isAndroid = true;
})();

// init
(async () => {
	await loadUserOptions();
	debug("userOptions loaded. Updating objects");
	userOptions = await updateUserOptionsVersion(userOptions);
	await browser.storage.local.set({"userOptions": userOptions});
	await checkForOneClickEngines();
	await buildContextMenu();
	resetPersist();
	setIcon();
	document.dispatchEvent(new CustomEvent("loadUserOptions"));
})();

// listeners
if ( browser.contextMenus ) // catch android
	browser.contextMenus.onClicked.addListener(contextMenuSearch);

// domain follower highlighting
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {

	if ( !userOptions.highLight.followDomain && !userOptions.highLight.followExternalLinks ) return;

	if ( changeInfo.status !== 'complete' || tab.url === 'about:blank') return;
		
	let url = new URL(tab.url);

	let highlightInfo = highlightTabs.find( ht => ( ht.tabId === tabId || ht.tabId === tab.openerTabId ) && ( ( userOptions.highLight.followExternalLinks && ht.domain !== url.hostname ) || ( userOptions.highLight.followDomain && ht.domain === url.hostname ) ) );
	
	if ( highlightInfo ) {
		debug('found openerTabId ' + tab.openerTabId + ' in hightlightTabs');

		waitOnInjection(tabId).then(value => {
			highlightSearchTermsInTab(tab, highlightInfo.searchTerms);
		});
	}
});

browser.tabs.onRemoved.addListener(tabId => {
	notify({action: "removeTabHighlighting", tabId: tabId});
});

browser.tabs.onRemoved.addListener(tabId => removeTabTerms(tabId));
browser.tabs.onActivated.addListener(info => deactivateTabTerms(info.tabId));
browser.tabs.onActivated.addListener(info => {
	if ( userOptions.quickMenuCloseOnTabChange ) {
		browser.tabs.sendMessage(info.previousTabId, {action: "cancelQuickMenuRequest"}).then(() => {}, () => {});
		browser.tabs.sendMessage(info.previousTabId, {action: "closeQuickMenuRequest"}).then(() => {}, () => {});
	}
})

browser.runtime.onMessage.addListener(notify);

browser.runtime.onInstalled.addListener( details => {
	
	document.addEventListener('loadUserOptions', async() => {

		if ( details.temporary ) {}

		if ( 
			 details.reason === 'update'
			 && userOptions.version != userOptionsBackup.version
			// userOptions.version < 1.47 /*details.previousVersion < "1.47" */ 
		)  {

			debug("Backing up userOptions to userOptionsBackup");

			// this is the untouched copy from the previous session
			await browser.storage.local.set({"userOptionsBackup": userOptionsBackup});
			return;
		}
		
	//	Show install page
		if ( details.reason === 'install' ) {
			browser.tabs.create({
				url: "/options.html#engines"
			}).then(_tab => {
				browser.tabs.executeScript(_tab.id, {
					code: `cacheAllIcons()`
				});
			});
		}
	});
});

// trigger zoom event
browser.tabs.onZoomChange.addListener( async zoomChangeInfo => {

	let tab = await browser.tabs.get(zoomChangeInfo.tabId);

	if ( !isValidHttpUrl(tab.url) ) return;

	browser.tabs.executeScript( zoomChangeInfo.tabId, {
		code: 'document.dispatchEvent(new CustomEvent("zoom"));'
	}).then(() => {}, err => debug(err));
});

async function notify(message, sender, sendResponse) {

	function sendMessageToTopFrame() {
		return browser.tabs.sendMessage(sender.tab.id, message, {frameId: 0});
	}
	
	function sendMessageToAllFrames() {
		return browser.tabs.sendMessage(sender.tab.id, message);
	}
	
	sender = sender || {};
	if ( !sender.tab ) { // page_action & browser_action popup has no tab, use current tab
		let onFound = tabs => sender.tab = tabs[0];
		let onError = err => console.error(err);
		
		await browser.tabs.query({currentWindow: true, active: true}).then(onFound, onError);
	}

	try {
		debug(sender.tab.id, sender.tab.url, message.action);
	} catch (error) {}

	if ( message.sendMessageToTopFrame ) {
		return sendMessageToTopFrame();
	}

	if ( message.sendMessageToAllFrames ) {
		return sendMessageToAllFrames();
	}

	switch(message.action) {

		case "saveUserOptions":
			userOptions = message.userOptions;
			userOptions.lastUpdated = Date.now();

			debug("saveUserOptions", message.source || "", sender.tab.url);

			return browser.storage.local.set({"userOptions": userOptions}).then(() => {
				notify({action: "updateUserOptions", source: sender});
			});
			
		case "updateUserOptions":

			debounce(async () => {
				debug('updateUserOptions');
				let tabs = await getAllOpenTabs();
				for (let tab of tabs) {
					browser.tabs.sendMessage(tab.id, {"userOptions": userOptions, source: message.source}).catch( error => {/*debug(error)*/});	
				}
				buildContextMenu();
			}, 1000, "updateUserOptionsTimer");
			break;
			
		case "openOptions": {
			let optionsPageURL = browser.runtime.getURL("/options.html");
			let optionsPage = await browser.tabs.query({url: optionsPageURL + "*"});

			optionsPage = optionsPage.shift();

			if ( optionsPage ) {
				browser.windows.update(optionsPage.windowId, {focused: true})
				browser.tabs.update(optionsPage.id, { active: true, url: browser.runtime.getURL("/options.html" + (message.hashurl || "")), openerTabId: sender.tab.id});
			//	browser.tabs.reload(optionsPage.id);
				return optionsPage;

			}
			return browser.tabs.create({
				url: browser.runtime.getURL("/options.html" + (message.hashurl || "")) 
			});
		}
			
		case "quickMenuSearch":
		case "search":
			message.info.tab = sender.tab;
			return openSearch(message.info);
			
		case "enableContextMenu":
			userOptions.contextMenu = true;
			return buildContextMenu();

		case "fetchURI":
			return new Promise(r => {
				let start = Date.now();
				let img = new Image();
				img.onload = async function() {
					let dataURI = await imageToBase64(img);
					r(dataURI);
					debug("URI encode took", Date.now() - start);
				}
				img.src = message.url;
			
			});
			
		case "getUserOptions":
			return userOptions;
			
		case "getDefaultUserOptions":
			return defaultUserOptions;

		case "getSearchEngineById":
			if ( !message.id) return;

			return {"searchEngine": findNode(userOptions.nodeTree, n => n.id === message.id)};
			
		case "dispatchEvent":
			return browser.tabs.executeScript(sender.tab.id, {
				code: `document.dispatchEvent(new CustomEvent("${message.e}"));`,
				allFrames: true
			});

		case "openQuickMenu":
			return sendMessageToTopFrame();
			
		case "closeQuickMenuRequest":
			return sendMessageToAllFrames();
		
		case "quickMenuIframeLoaded":
			return sendMessageToTopFrame();
		
		case "updateQuickMenuObject":
			return sendMessageToAllFrames();
			
		case "lockQuickMenu":
			return sendMessageToTopFrame();
			
		case "unlockQuickMenu":
			return sendMessageToTopFrame();

		case "deselectAllText":
			return sendMessageToAllFrames();

		case "toggleLockQuickMenu":
			return browser.tabs.executeScript(sender.tab.id, {
				code: 'if ( quickMenuObject && quickMenuObject.locked ) unlockQuickMenu(); else lockQuickMenu();',
				allFrames:false
			});
			
		case "rebuildQuickMenu":
			return sendMessageToTopFrame();
			
		case "closeWindowRequest":
			return browser.windows.remove(sender.tab.windowId);
		
		case "closeCustomSearch":
			return sendMessageToTopFrame();
			
		case "openFindBar":
			if ( userOptions.highLight.findBar.openInAllTabs ) {
				let _message = Object.assign({}, message);
				
				if ( !userOptions.highLight.findBar.searchInAllTabs )
					_message.searchTerms = "";
				
				let tabs = await getAllOpenTabs();
				return Promise.all(tabs.map( tab => {
					return browser.tabs.sendMessage(tab.id, ( tab.id !== sender.tab.id ) ? _message : message, {frameId: 0});
				}));
				
			} else
				return sendMessageToTopFrame();
			
		case "closeFindBar":
			if ( userOptions.highLight.findBar.openInAllTabs ) {
				
				let tabs = await getAllOpenTabs();
				return Promise.all(tabs.map( tab => {
					return browser.tabs.sendMessage(tab.id, message, {frameId: 0});
				}));
				
			} else
				return sendMessageToTopFrame();
			
		case "updateFindBar":
			return sendMessageToTopFrame();
			
		case "findBarNext":
			return sendMessageToTopFrame();
			
		case "findBarPrevious":
			return sendMessageToTopFrame();
		
		case "getFindBarOpenStatus":
			onFound = result => result
			onError = () => {}
			return browser.tabs.executeScript(sender.tab.id, {
				code: "getFindBar() ? true : false;"
			}).then(onFound, onError);

		case "mark":
			if ( message.findBarSearch && userOptions.highLight.findBar.searchInAllTabs ) {
				let tabs = await getAllOpenTabs();
				return Promise.all(tabs.map( tab => browser.tabs.sendMessage(tab.id, message)));
			} else {
				return sendMessageToAllFrames();
			}

			
		case "unmark":
			return sendMessageToAllFrames();
		
		case "findBarUpdateOptions":
			return sendMessageToTopFrame();

		case "markDone":
			return sendMessageToTopFrame();
			
		case "toggleNavBar":
			return sendMessageToTopFrame();
			
		case "closeSideBar":
			return sendMessageToTopFrame();
		
		case "openSideBar":
		case "sideBarHotkey":
			return sendMessageToTopFrame();
			
		case "getOpenSearchLinks":

			onFound = results => results.shift();
			onError = results => null;
		
			return await browser.tabs.executeScript( sender.tab.id, {
				code: `
					(() => {
						let oses = document.querySelectorAll('link[type="application/opensearchdescription+xml"]');
						if ( oses ) return [...oses].map( ose => {return {title: ose.title || document.title, href: ose.href }})
					})()`,
				frameId: message.frame ? sender.frameId : 0
			}).then(onFound, onError);

		case "updateSearchTerms":

			window.searchTerms = message.searchTerms;
			
			if ( userOptions.autoCopy && message.searchTerms && ( userOptions.autoCopyOnInputs || !message.input))
				notify({action: "copyRaw", autoCopy:true});
			//	notify({action: "copy", msg: message.searchTerms});
			
			return browser.tabs.sendMessage(sender.tab.id, message, {frameId: 0});
			
		case "updateContextMenu":
		
			var searchTerms = message.searchTerms;

			if ( window.contextMenuSearchTerms === searchTerms ) {
		//		debug('same search terms');
		//		return;
			}
			
			window.contextMenuSearchTerms = searchTerms;

			if ( userOptions.contextMenuUseContextualLayout ) {

				let ccs = [...message.currentContexts];

				// image wrapped in link, only use one
				if ( ccs.includes("image") && ccs.includes("link") ) {
					ccs = ccs.filter(c => c != (message.ctrlKey ? "image" : "link"));

				// using linkText, remove link context and add selection
				} else if ( message.linkMethod && message.linkMethod === "text") {
					ccs = ccs.filter(c => c != "link");
					if ( !ccs.includes("selection") )
						ccs.push("selection");
				}

				// relabel selection based on linkMethod
				test: try {

					if ( message.currentContexts.includes("image")) break test;

					let title = i18n("SearchForContext", (message.linkMethod && message.linkMethod === "text" ? i18n("LINKTEXT") : i18n("LINK")).toUpperCase()) + getMenuHotkey();

					// using linkText
					if ( message.linkMethod && message.linkMethod === "text" ) {
						browser.contextMenus.update("selection", {
							title: title,
							contexts:["link", "selection"]
						});
					} else {
						browser.contextMenus.update("selection", {
							title: i18n("SearchForContext", i18n("selection").toUpperCase()) + getMenuHotkey(),
							contexts:["selection"]
						});
					}
				} catch ( error ) {
					console.error(error);
				}

				try {
					contexts.forEach(c => {
						browser.contextMenus.update(c, {visible: ccs.includes(c) });
					});

				} catch ( error ) {
					console.error(error);
				}

				updateMatchRegexFolders(searchTerms);

			} else {
				// legacy menus
				let title = contextMenuTitle(searchTerms);

				try {
					browser.contextMenus.update(ROOT_MENU, {visible: true, title: title}).then(() => {
						updateMatchRegexFolder(searchTerms);
					});

				} catch (err) {
					debug(err);
				}
			} 

			break;
			
		case "getFirefoxSearchEngineByName": {
			return firefoxSearchEngines.find(ocse => ocse.name === message.name);
		}
			
		case "addSearchEngine": {
			let url = message.url;

			if ( browser.runtime.getBrowserInfo && browser.search && browser.search.get ) {

				// skip for Firefox version < 78 where window.external.AddSearchProvider is available
				let info = await browser.runtime.getBrowserInfo();	
				if ( parseFloat(info.version) < 78 ) return;
				
				let match = /SHORTNAME=(.*?)&DESCRIPTION/.exec(url);	
				
				if (!match[1]) return;

				let title = decodeURIComponent(match[1]);
				
				if ( firefoxSearchEngines.find(e => e.name === title) ) {
					await browser.tabs.executeScript(sender.tab.id, {
						code: `alert("${i18n("FFEngineExists", title)}");`
					});
					return;
				}

				await browser.tabs.executeScript(sender.tab.id, {
					file: "/addSearchProvider.js"
				});
				
				// check for existing opensearch engine of the same name					
				let exists = await browser.tabs.executeScript(sender.tab.id, {
					code: `getSearchProviderUrlByTitle("${title}")`
				});

				exists = exists.shift();

				if ( exists ) {
					debug('OpenSearch engine with name ' + title + ' already exists on page');

					let oldURL = new URL(exists);
					let newURL = new URL(url);

					if ( oldURL.href == newURL.href ) {
						debug('exists but same url');
					} else {
						debug('open new tab to include fresh opensearch link');
						
						let favicon = sender.tab.favIconUrl;
						
						let tab = await browser.tabs.create({
							active:true,
							url: browser.runtime.getURL('addSearchProvider.html')
						});

						await browser.tabs.executeScript(tab.id, {
							code: `
								var userOptions = {};

								browser.runtime.sendMessage({action: "getUserOptions"}).then( uo => {
									userOptions = uo;
								});
								
								setFavIconUrl("${favicon}");`
						});
						
						// some delay needed
						await new Promise(r => setTimeout(r, 500));

						notify({action: "addSearchEngine", url: url});
						return;
					}
				}
				
				await browser.tabs.executeScript(sender.tab.id, {
					code: `addSearchProvider("${url}");`
				});
					
			}
			
			window.external.AddSearchProvider(url);
			break;
		}
		
		case "addContextSearchEngine": {
		
			let se = message.searchEngine;
			
			debug('addContextSearchEngine', se)
			
			if ( findNode(userOptions.nodeTree, n => n.title === se.title) ) {
				sendResponse({errorMessage: 'Name must be unique. Search engine already exists'});
				return;
			}
			
			se.id = gen();

			let parentNode = message.folderId ? findNode(userOptions.nodeTree, n => n.id === message.folderId) : userOptions.nodeTree;

			// generic node
			let node = {
				type: "searchEngine",
				hidden: false,
				contexts:32
			}

			// populate generic node with se values
			Object.assign(node, se);

			parentNode.children.push(node);

			notify({action: "saveOptions", userOptions:userOptions});
			return node;
			
		}
			
		case "removeContextSearchEngine":

			if ( !message.id ) return;

			removeNodesById(userOptions.nodeTree, message.id)	
			notify({action: "saveOptions", userOptions:userOptions});
			
			break;
			
		case "testSearchEngine":
			
			openSearch({
				searchTerms: message.searchTerms,
				tab: sender.tab,
				temporarySearchEngine: message.tempSearchEngine,
				openMethod: message.openMethod || "openBackgroundTab"
			});

			break;
			
		case "enableAddCustomSearchMenu":

			if (!userOptions.contextMenuShowAddCustomSearch) return;

			try {
				browser.contextMenus.update("add_engine", { visible: true }).then(() => {
					if (browser.runtime.lastError)
						debug(browser.runtime.lastError);
				});
			} catch (err) {
				debug(err);
			}

			break;
		
		case "disableAddCustomSearchMenu":
			
			try {
				browser.contextMenus.update("add_engine", { visible: false }).then(() => {
					if (browser.runtime.lastError)
						debug(browser.runtime.lastError);
				});
			} catch (err) {
				debug(err);
			}
			break;

		case "log":
			debug(message, sender);
			break;
			
		case "focusSearchBar":
			browser.tabs.sendMessage(sender.tab.id, message);
			break;
			
		case "setLastSearch":
			sessionStorage.setItem("lastSearch", message.lastSearch);
			break;
			
		case "getLastSearch":
			return {lastSearch: sessionStorage.getItem("lastSearch")};
			
		case "getCurrentTheme":
			browser.theme.getCurrent().then( theme => {
				debug(theme);
			});
			break;
			
		case "executeTestSearch": {

			let searchTerms = encodeURIComponent(message.searchTerms);
			let searchRegex = new RegExp(searchTerms + "|" + searchTerms.replace(/%20/g,"\\+") + "|" + searchTerms.replace(/%20/g,"_"), 'g');
			
			let timeout = Date.now();

			let urlCheckInterval = setInterval( () => {
				browser.tabs.get(sender.tab.id).then( tabInfo => {
					
					if (tabInfo.status !== 'complete') return;

					if ( searchRegex.test(tabInfo.url) ) {
						
						clearInterval(urlCheckInterval);
						
						let newUrl = tabInfo.url.replace(searchRegex, "{searchTerms}");
						
						let se = message.badSearchEngine;
						
						se.template = newUrl;

						browser.tabs.sendMessage(tabInfo.id, {action: "openCustomSearch", searchEngine: se}, {frameId: 0});
					}
					
					// No recognizable GET url. Prompt for advanced options
					if (Date.now() - timeout > 5000) {

						debug('urlCheckInterval timed out');
						browser.tabs.sendMessage(tabInfo.id, {action: "openCustomSearch", timeout: true}, {frameId: 0});
						clearInterval(urlCheckInterval);
					}

				});
			}, 1000);
			
			return true;
			
		}
			
		case "copy":
			try {
				await navigator.clipboard.writeText(message.msg);
				
				return true;
			} catch (error) {
				debug(error);
				return false;
			}

		case "copyRaw":
			return browser.tabs.sendMessage(sender.tab.id, message, {frameId: 0 /*sender.frameId*/});
			
		case "hasBrowserSearch":
			return typeof browser.search !== 'undefined' && typeof browser.search.get !== 'undefined';
			
		case "checkForOneClickEngines":	
			return checkForOneClickEngines();
			
		case "getCurrentTabInfo": 
			return Promise.resolve(sender.tab);
		
		case "removeTabHighlighting": {
		
			let tabId = message.tabId || sender.tab.id;
			highlightTabs.findIndex( (hl, i) => {
				if (hl.tabId === tabId) {
					highlightTabs.splice(i, 1);
					debug('removing tabId ' + tabId + ' from array');
					return true;
				}
			});

			break;
		}
			
		case "dataToSearchEngine":
			return dataToSearchEngine(message.formdata);
			
		case "openSearchUrlToSearchEngine":
			return readOpenSearchUrl(message.url).then( xml => {
				if ( !xml ) return false;
				
				return openSearchXMLToSearchEngine(xml);
			});
		
		case "showNotification":
			return sendMessageToTopFrame();
			
		case "getTabQuickMenuObject":

			try {
				return (await browser.tabs.executeScript(sender.tab.id, {
					code: `quickMenuObject;`
				})).shift();
			} catch (error) {
				return null;
			}
		
		case "addToHistory": {

			if ( sender.tab.incognito && userOptions.incognitoTabsForgetHistory ) return debug('incognito - do not add to history')
	
			let terms = message.searchTerms.trim();
			
			if ( !terms ) return;

			// send last search to backgroundPage for session storage
			notify({action: "setLastSearch", lastSearch: terms});
			
			// return if history is disabled
			if ( ! userOptions.searchBarEnableHistory ) return;

			// remove first entry if over limit
			if (userOptions.searchBarHistory.length >= userOptions.searchBarHistoryLength)
				userOptions.searchBarHistory.shift();

			(() => { // ignore duplicates
				let index = userOptions.searchBarHistory.indexOf(terms);
				if ( index !== -1 )
					userOptions.searchBarHistory.splice(index, 1);
			})();
			
			// add new term
			userOptions.searchBarHistory.push(terms);

			// update prefs
			notify({action: "saveUserOptions", "userOptions": userOptions, source: "addToHistory" });
			
			debug('adding to history', terms);
			return Promise.resolve(userOptions);
		}
			
		case "setLastOpenedFolder":
			window.lastOpenedFolder = message.folderId;
			return true;
			
		case "getLastOpenedFolder":
			return window.lastOpenedFolder || null;

		case "executeScript": 
			return browser.tabs.executeScript(sender.tab.id, {
				code: message.code,
				frameId: 0
			});

		case "injectContentScripts":

			if ( isAllowedURL(sender.tab.url)) {
				injectContentScripts(sender.tab, sender.frameId);
			} else {
				debug("blacklisted", sender.tab.url);
			}
			break;
			
		case "injectComplete":

			if ( userOptions.quickMenu ) {
				await browser.tabs.executeScript(sender.tab.id, {
					file: "/inject_quickmenu.js",
					frameId: sender.frameId
				});
				
				debug("injected quickmenu");
			}
			
			if ( userOptions.pageTiles.enabled ) {
				await browser.tabs.executeScript(sender.tab.id, {
					file: "/inject_pagetiles.js",
					frameId: sender.frameId
				});
				
				debug("injected pagetiles");
			}

			if ( /\/\/mycroftproject.com/.test(sender.tab.url) && userOptions.modify_mycroftproject ) {
				await browser.tabs.executeScript(sender.tab.id, {
					file: "/inject_mycroftproject.js",
					frameId: sender.frameId
				});
				
				debug("injected mycroftproject");
			}
			
			break;
			
		case "getFirefoxSearchEngines":
			return firefoxSearchEngines;
			
		case "setLastUsed":
			lastSearchHandler(message.id, message.method || null);
			break;
			
		case "getSelectedText":
			onFound = () => {}
			onError = () => {}

			return browser.tabs.executeScript(sender.tab.id, {
				code: "getSelectedText(document.activeElement);"
			}).then(onFound, onError);	

		case "addUserStyles": {
			if ( !userOptions.userStylesEnabled ) return false;

			debug('adding user styles');

			let style = message.global ? userOptions.userStylesGlobal : userOptions.userStyles;

			if ( !style.trim() ) return false;

			// debug(message.global, style);

			return browser.tabs.insertCSS( sender.tab.id, {
				code: style,
				frameId: message.global ? 0 : sender.frameId,
				cssOrigin: "user"
			});
		}

		case "editQuickMenu":
			sendMessageToTopFrame();
			break;

		case "addStyles":
			return browser.tabs.insertCSS( sender.tab.id, {
				file: message.file,
				frameId: sender.frameId,
				cssOrigin: "user"
			});

		case "closePageTiles":
			return sendMessageToTopFrame();

		case "openBrowserAction":
			debug('openBrowserAction')
			browser.browserAction.openPopup();
			return;

		case "openPageTiles":
			// await browser.tabs.executeScript(sender.tab.id, {
			// 	file: "/inject_pagetiles.js"
			// }).catch(e => {});

			return sendMessageToTopFrame();

		case "minifySideBar":
			debug('bg');
			return sendMessageToTopFrame();

		case "getZoom":
			return browser.tabs.getZoom(sender.tab.id);

		case "sideBarOpenedOnSearchResults":

			onFound = results => results;
			onError = results => null;
			
			return await browser.tabs.executeScript(sender.tab.id, {
				code: `(() => {
					let result = window.openedOnSearchResults;
					delete window.openedOnSearchResults;
					return result;
				})();`
			}).then( onFound, onError);

		case "openCustomSearch":
			sendMessageToTopFrame();
			break;

		case "getRawSelectedText":
			onFound = results => results[0];
			onError = results => null;
			
			return await browser.tabs.executeScript(sender.tab.id, {
				code: `getRawSelectedText(document.activeElement)`
			}).then( onFound, onError);

		case "updateUserOptionsObject":
			return updateUserOptionsObject(message.userOptions);

		case "updateUserOptionsVersion":
			return updateUserOptionsVersion(message.userOptions);

		case "requestPermission":
			return browser.permissions.request({permissions: [message.permission]});

		case "hasPermission":
			return browser.permissions.contains({permissions: [message.permission]});

		case "openTab":
			return openWithMethod(message);

		case "closeTab":
			return browser.tabs.remove(message.tabId || sender.tab.id )

		case "getIconsFromIconFinder":
			return browser.tabs.create({
				url: "https://www.iconfinder.com/search?q=" + message.searchTerms,
				active:false
			}).then(async tab => {
				await new Promise(r => setTimeout(r, 1000));
				urls = await browser.tabs.executeScript(tab.id, {
					code: `[...document.querySelectorAll(".icon-grid IMG")].map(img => img.src);`
				});
				browser.tabs.remove(tab.id);
				return urls.shift();
			});

		case "cancelQuickMenuRequest":
			sendMessageToTopFrame();
			break;

		case "download":
			if ( !await browser.permissions.contains({permissions: ["downloads"]}) ) {
				let optionsTab = await notify({action: "openOptions", hashurl:"?permission=downloads#requestPermissions"});
				return;
			}

			return browser.downloads.download({url: message.url, saveAs: true});

		case "getBookmarksAsNodeTree":
			return await CSBookmarks.treeToFolders(message.id || "root________");

		case "getTabTerms":
			return window.tabTerms.find(t => t.tabId === sender.tab.id);

		case "isSidebar":
			return sender.hasOwnProperty("frameId");

		case "restorePreviousVersion":
			return restorePreviousVersion();

		case "getSessionBackup":
			return userOptionsBackup;

		case "disablePageClicks":
			if ( !userOptions.toolBarMenuDisablePageClicks ) return;
			return browser.tabs.insertCSS( sender.tab.id, {
				code:"HTML{pointer-events:none;}",
				cssOrigin: "user",
				allFrames:true
			});

		case "enablePageClicks":
			if ( !userOptions.toolBarMenuDisablePageClicks ) return;

			function logTabs(tabs) {
			  for (const tab of tabs) {
				browser.tabs.removeCSS( tab.id, {
					code:"HTML{pointer-events:none;}",
					cssOrigin: "user",
					allFrames:true
				});
			  }
			}

			return browser.tabs.query({ currentWindow: true }).then(logTabs);
	}
}

function checkUserOptionsValueTypes(repair) {
	const traverse  = (obj, obj2) => {
		Object.keys(obj).forEach(key => {

			if ( typeof obj[key] !== typeof obj2[key]) {
				console.error('mismatched object types', key, typeof obj[key], typeof obj2[key], obj[key], obj2[key]);

				if ( repair ) {
					debug('repairing');
					obj2[key] = Object.assign({}, obj[key]);
				}
			}

			if (typeof obj[key] === 'object' && obj[key] instanceof Object ) {
				traverse(obj[key], obj2[key])
			}
		})
	}

	traverse(defaultUserOptions, userOptions);
}

function updateUserOptionsObject(uo) {
	// Update default values instead of replacing with object of potentially undefined values
	function traverse(defaultobj, userobj) {
		for (let key in defaultobj) {
			userobj[key] = (userobj[key] !== undefined && userobj[key] == userobj[key] ) ? userobj[key] : JSON.parse(JSON.stringify(defaultobj[key]));

			if (typeof userobj[key] !== typeof defaultobj[key] ) {
				console.error(key, "mismatched types");
				userobj[key] = defaultobj[key];
			}

			if ( defaultobj[key] instanceof Object && Object.getPrototypeOf(defaultobj[key]) == Object.prototype && key !== 'nodeTree' )
				traverse(defaultobj[key], userobj[key]);

			// fix broken object arrays but skip searchEngines
			if ( defaultobj[key] instanceof Array && defaultobj[key][0] && defaultobj[key][0] instanceof Object && key !== "searchEngines" ) {
				
				if ( userobj[key].includes( undefined ) ) {
					console.error(key, "Found broken settings array in config. Restoring defaults")
					userobj[key] = JSON.parse(JSON.stringify(defaultobj[key]));
				}

				for(let i=userobj[key].length-1;i>-1;i--) {
					try {
						String(userobj[key][i]);
					} catch (e) {
						console.error('Dead objects found. Replacing with defaults');
						userobj[key] = JSON.parse(JSON.stringify(defaultobj[key]));
						break;
					}
				}
			}

			// fix broken values
			if ( typeof defaultobj[key] === 'number' && ( typeof userobj[key] !== 'number' || !isFinite(userobj[key]) ) ) {
				console.error(key, userobj[key], "Found broken value. Restoring default");
				userobj[key] = JSON.parse(JSON.stringify(defaultobj[key]));
			}
		}
	}

	traverse(defaultUserOptions, uo);
	
	return uo;
}

function loadUserOptions() {
	
	function onGot(result) {
		
		// no results found, use defaults
		if ( !result.userOptions ) {
			userOptions = Object.assign({}, defaultUserOptions);
			userOptions.nodeTree.children = defaultEngines;
			return false;
		}

		// store a session copy
		userOptionsBackup = JSON.parse(JSON.stringify(result.userOptions));;

		userOptions = updateUserOptionsObject( result.userOptions );

		return true;
	}
  
	function onError(error) {
		debug(`Error: ${error}`);
	}

	var getting = browser.storage.local.get("userOptions");
	return getting.then(onGot, onError);
}

function openWithMethod(o) {
	if ( !o.url ) return;
	
	o.openerTabId = o.openerTabId || null;
	o.index = o.index || null;

	function filterOptions(_o) {
		if ( isAndroid) delete _o.openerTabId;

		return _o;
	}
	
	switch (o.openMethod) {
		case "openCurrentTab":
			return openCurrentTab();

		case "openNewTab":
			return openNewTab(false);

		case "openNewWindow":
			return openNewWindow(false);

		case "openNewIncognitoWindow":
			return openNewWindow(true);

		case "openBackgroundTab":
		case "openBackgroundTabKeepOpen":
			return openNewTab(true);

		case "openSideBarAction":
			return openSideBarAction(o.url);
	}
	
	function openCurrentTab() {
		
		return browser.tabs.update(filterOptions({
			url: o.url,
			openerTabId: o.openerTabId
		}));
	} 
	function openNewWindow(incognito) {	// open in new window

		return browser.windows.create({
			url: o.url,
			incognito: incognito
		});
	} 
	async function openNewTab(inBackground) {	// open in new tab

		if ( userOptions.forceOpenResultsTabsAdjacent ) {
			try {
				let tabs = await browser.tabs.query({currentWindow: true});
				let active = tabs.find(t => t.active === true );
				let tabChildren = tabs.filter(t => t.openerTabId === active.id);
				let indexes = tabChildren.map(t => t.index);
				o.index = Math.max(...indexes, active.index) + 1;

			} catch (err) {
				debug(err);
			}
		}

		return browser.tabs.create(filterOptions({
			url: o.url,
			active: !inBackground,
			openerTabId: o.openerTabId,
			index: o.index
			//openerTabId: (info.folder ? null : openerTabId)
		}));

	}	

	async function openSideBarAction(url) {

		if ( !browser.sidebarAction ) return;
		
		await browser.sidebarAction.setPanel( {panel: null} ); // firefox appears to ignore subsequent calls to setPanel if old url = new url, even in cases of differing #hash
		
		await browser.sidebarAction.setPanel( {panel: url} );
			
		if ( !await browser.sidebarAction.isOpen({}) )
			notify({action: "showNotification", msg: i18n('NotificationOpenSidebar')}, {});

		return {};
	}
}

function executeBookmarklet(info) {
	
	//let searchTerms = info.searchTerms || window.searchTerms || escapeDoubleQuotes(info.selectionText);
	let searchTerms = escapeDoubleQuotes(info.searchTerms || info.selectionText || window.searchTerms);

	// run as script
	if ( info.node.searchCode ) {

		return browser.tabs.query({currentWindow: true, active: true}).then( async tabs => {
			browser.tabs.executeScript(tabs[0].id, {
				code: `CS_searchTerms = searchTerms = "${searchTerms}";
					${info.node.searchCode}`		
			})
		});
	}

	if (!browser.bookmarks) {
		console.error('No bookmarks permission');
		return;
	}

	// run as bookmarklet
	browser.bookmarks.get(info.menuItemId).then( bookmark => {
		bookmark = bookmark.shift();
		
		if (!bookmark.url.startsWith("javascript")) { // assume bookmark
		
			openWithMethod({
				openMethod: info.openMethod, 
				url: bookmark.url,
				openerTabId: userOptions.disableNewTabSorting ? null : info.tab.id
			});

			return false;
		}
		
		browser.tabs.query({currentWindow: true, active: true}).then( async tabs => {
			let code = decodeURI(bookmark.url);
			
			browser.tabs.executeScript(tabs[0].id, {
				code: `CS_searchTerms = searchTerms = "${searchTerms}";
					${code}`
			});
		});

	}, error => {
		console.error(error);
	});
}

function executeOneClickSearch(info) {

	let searchTerms = info.searchTerms || info.selectionText;
	let openMethod = info.openMethod;
	let openerTabId = userOptions.disableNewTabSorting ? null : info.tab.id;
	
	if ( !info.multiURL )
		notify({action: "addToHistory", searchTerms: searchTerms});

	async function searchAndHighlight(tab) {

		browser.search.search({
			query: searchTerms,
			engine: info.node.title,
			tabId: tab.id
		});

		browser.tabs.onUpdated.addListener(async function listener(tabId, changeInfo, __tab) {
			
			if ( tabId !== tab.id ) return;
		
			if ( changeInfo.status !== 'complete' || __tab.url === 'about:blank' ) return;

			browser.tabs.onUpdated.removeListener(listener);

			waitOnInjection(tabId).then(value => {
				highlightSearchTermsInTab(__tab, searchTerms);
			});
		});
	}
	
	function onError(error) {
		debug(`Error: ${error}`);
	}
	
	if ( openMethod === "openSideBarAction" ) {
		return debug("one-click search engines cannot be used with sidebaraction");
	}
	
	openWithMethod({
		openMethod: openMethod, 
		url: "about:blank",
		openerTabId: openerTabId
	}).then( async tab => {
		// if new window
		if (tab.tabs) tab = tab.tabs[0];

		let start = Date.now();

		if ( !info.multiURL )
			addTabTerms(info.node, tab.id, searchTerms);

		browser.tabs.onUpdated.addListener(async function listener(tabId, changeInfo, __tab) {
			if ( tabId !== tab.id ) return;
		
			if ( changeInfo.status !== 'complete' ) return;

			browser.tabs.onUpdated.removeListener(listener);

			debug('tab took', Date.now() - start );

			// .search.get() requires some delay
			await new Promise(r => setTimeout(r, 500));

			searchAndHighlight(tab);
		});

	}, onError);

}

async function executeExternalProgram(info) {

	let node = info.node;
	let searchTerms = info.searchTerms || info.selectionText;
	let downloadURL = null;
	let downloadPath = null;

	if ( node.searchRegex ) {
		try {
			runReplaceRegex(node.searchRegex, (r, s) => searchTerms = searchTerms.replace(r, s));
		} catch (error) {
			console.error("regex replace failed");
		}
	}

	let path = node.path.replace(/{searchTerms}/g, searchTerms)
		.replace(/{url}/g, info.tab.url);

	// {download_url} is a link to be downloaded by python and replaced by the file path
	let matches = path.match(/{download_url(?:=(.+))?}/);
	if ( matches ) {
		downloadURL = searchTerms;
		downloadPath = matches[1] || null;
	}

	if ( downloadPath === "ASK") {

		if ( !await awaitPermission("downloads") ) return;

		// if ( downloadURL.startsWith('data') ) {
		// 	let blob = new Blob(downloadURL);
		// 	downloadURL = URL.createObjectURL(blob);
		// }

		let id = await browser.downloads.download({
			url:downloadURL,
			saveAs:true
		});

		let dl = await browser.downloads.search({id}).then( dls => {
			return dls[0];
		});

		debug(dl);

		downloadURL = null;
		path = path.replace(/{download_url=ASK}/, dl.filename);
	}

	if ( !await awaitPermission("nativeMessaging") ) return;

	try {
		await browser.runtime.sendNativeMessage("contextsearch_webext", {verify: true});
	} catch (error) {
		return notify({action: "showNotification", msg: i18n('NativeAppMissing')})
	}

	let msg = {
		path: path, 
		cwd:node.cwd, 
		return_stdout: ( node.postScript ? true : false ), 
		downloadURL: downloadURL, 
		downloadFolder: downloadPath || userOptions.nativeAppDownloadFolder || null,

	};

	debug("native app message ->", msg);

	return browser.runtime.sendNativeMessage("contextsearch_webext", msg).then( async result => {
		if ( node.postScript.trim() ) {
			await browser.tabs.executeScript(info.tab.id, { code: 'result = `' + escapeBackticks(result) + '`;'});
			await browser.tabs.executeScript(info.tab.id, { code: node.postScript });
		}
	});
}

function lastSearchHandler(id, method) {

	let node = findNode(userOptions.nodeTree, n => n.id === id );
	
	if ( !node ) return;
	
	userOptions.lastUsedId = id;
	userOptions.lastOpeningMethod = method;
	
	if ( node.type !== "folder" ) {
		userOptions.recentlyUsedList.unshift(userOptions.lastUsedId);
		userOptions.recentlyUsedList = [...new Set(userOptions.recentlyUsedList)].slice(0, userOptions.recentlyUsedListLength);
	}
	
	notify({action: "saveUserOptions", userOptions: userOptions, source: "lastSearchHandler"});
}

function isValidHttpUrl(str) {
	let url;

	try {
		url = new URL(str);
	} catch(e) {
		return false;  
	}

	return url.protocol === "http:" || url.protocol === "https:";
}

async function openSearch(info) {

	if ( info.openMethod === "openSideBarAction" ) {
		debug('open Firefox sidebar');
		browser.sidebarAction.open();
	}
	
	if ( info.node && info.node.type === "folder" ) return folderSearch(info);

	debug(info);

	var searchTerms = (info.searchTerms || info.selectionText || "").trim();

	var openMethod = info.openMethod || "openNewTab";
	var tab = info.tab || null;
	var openUrl = info.openUrl || false;
	var temporarySearchEngine = info.temporarySearchEngine || null; // unused now | intended to remove temp engine
	var domain = info.domain || null;
	var node = info.node || findNode(userOptions.nodeTree, n => n.id === info.menuItemId) || null;
	info.node = info.node || node; // in case it wasn't sent
	
	if (!info.folder) delete window.folderWindowId;
	
	if ( !info.temporarySearchEngine && !info.folder && !info.openUrl) 
		lastSearchHandler(info.menuItemId, info.openMethod);

	if ( userOptions.preventDuplicateSearchTabs ) {
		try {
			let oldTab = await getTabTermsTab(node.id, searchTerms);
			debug('tab with same engine and terms exists');
			return false;
		} catch ( error ) {}
	}

	if ( userOptions.multilinesAsSeparateSearches ) {

		try {
			searchTerms = info.quickMenuObject.searchTermsObject.selection.trim() || searchTerms;
		} catch (err) {}

		let terms = searchTerms.split('\n');

		if ( terms.length > 1 ) {

			let ps = [];

			if ( terms.length > userOptions.multilinesAsSeparateSearchesLimit ) {

				// try to inject confirm dialog
				try {
					let valid = await browser.tabs.executeScript(info.tab.id, {	code:"hasRun;" });
					if ( valid ) {
						let _confirm = await browser.tabs.executeScript(info.tab.id, {	code:`confirm('Exceeds terms limit. Continue?');` });
						
						if ( !_confirm[0] ) return;
					}
				} catch ( err ) { // can't inject a confirm dialog
					debug(err);
					return;
				}
			}

			terms.forEach((t, i) => {
				t = t.trim();

				if ( !t ) return;

				let _info = Object.assign({}, info);
				_info.searchTerms = t;
				_info.openMethod = i ? "openBackgroundTab" : _info.openMethod;
				delete _info.quickMenuObject;

				ps.push(openSearch(_info));
			})

			Promise.all(ps);
			return;
		}
	}

	if ( node && node.type === "oneClickSearchEngine" ) {
		debug("oneClickSearchEngine");
		return executeOneClickSearch(info);
	}
	
	//if (browser.bookmarks !== undefined && !findNode(userOptions.nodeTree,  n => n.id === info.menuItemId ) && !info.openUrl ) {
	if ( node && node.type === "bookmarklet" ) {
		debug("bookmarklet");
		return executeBookmarklet(info);
	}

	if ( node && node.type === "externalProgram" ) {
		debug("externalProgram");
		return executeExternalProgram(info);
	}

	var se = (node && node.id ) ? temporarySearchEngine || findNode(userOptions.nodeTree, n => n.id === node.id ) : temporarySearchEngine || null;

	if ( !se && !openUrl) return false;
	
	// check for multiple engines (v1.27+)
	if ( se && !info.multiURL ) {
		
		// check for arrays
		try {
			JSON.parse(se.template).forEach( (url, index) => {

				// make sure not the same node
				if ( url === node.id ) return;

				let _info = Object.assign({multiURL: true}, info);
				_info.openMethod = index ? "openBackgroundTab" : _info.openMethod;
				
				// if url and not ID
				if ( isValidHttpUrl(url) ) {
					
					_info.temporarySearchEngine = Object.assign({}, se);
					_info.temporarySearchEngine.template = url;

					// parse encoding for multi-URLs
					let matches = /{encoding=(.*?)}/.exec(url);
		
					if ( matches && matches[1] )
						_info.temporarySearchEngine.queryCharset = matches[1];

				} else if ( findNode(userOptions.nodeTree, n => n.id === url )) {
					delete _info.temporarySearchEngine;
					_info.menuItemId = url;
					_info.node = findNode(userOptions.nodeTree, n => n.id === url );
				} else {
					debug('url invalid', url);
					return;
				}
				openSearch(_info);
			});
			
			notify({action: "addToHistory", searchTerms: searchTerms});

			// overwrite last multi-child
			lastSearchHandler(info.menuItemId, info.openMethod);

			return;
			
		} catch (error) {
		//	debug(error);
		}
	}
	
	if (!tab) tab = {url:"", id:0}
	
	var openerTabId = userOptions.disableNewTabSorting ? null : tab.id;
	
	if ( !openUrl && !temporarySearchEngine && !info.multiURL ) 
		notify({action: "addToHistory", searchTerms: searchTerms});

	if (!openUrl) {

		// must be invalid
		if ( !se.template) return false;

		// legacy fix
		se.queryCharset = se.queryCharset || "UTF-8";
		
		if ( se.searchRegex ) {
			try {
				runReplaceRegex(se.searchRegex, (r, s) => {
					searchTerms = searchTerms.replace(r, s);
				});

			} catch (error) {
				console.error("regex replace failed");
			}
		}

		var encodedSearchTermsObject = encodeCharset(searchTerms, se.queryCharset);
		
		var q = replaceOpenSearchParams({template: se.template, searchterms: encodedSearchTermsObject.uri, url: tab.url, domain: domain});

	//	q.replace("%i", await imageToUri(searchTerms));


		// set landing page for POST engines
		if ( 
			!searchTerms || // empty searches should go to the landing page also
			(typeof se.method !== 'undefined' && se.method === "POST") // post searches should go to the lander page
		) {
			
			if ( se.searchForm )
				q = se.searchForm;
			else {
				let url = new URL(se.template);
				q = url.origin + url.pathname;
			}
			
		}
	} else {	
		// if using Open As Link from quick menu
		q = searchTerms;
		if (searchTerms.match(/^.*:\/\//) === null)
			q = "http://" + searchTerms;
	}
	
	openWithMethod({
		openMethod: openMethod, 
		url: q, 
		openerTabId: openerTabId
	}).then(onCreate, onError);
	
	function executeSearchCode(tabId) {
		if ( !se.searchCode ) return;
		
		browser.tabs.executeScript(tabId, {
			code: `searchTerms = "${escapeDoubleQuotes(searchTerms)}"; ${se.searchCode}`,
			runAt: 'document_idle'
		});
	}
	
	function onCreate(_tab) {

		// if new window
		if (_tab.tabs) {
			window.folderWindowId = _tab.id;
			_tab = _tab.tabs[0];
			
			debug('window created');
		}

		try {
			if ( !info.multiURL )
				addTabTerms(node, _tab.id, searchTerms);
		} catch (err) {
			debug(err);
		}

		browser.tabs.onUpdated.addListener(async function listener(tabId, changeInfo, __tab) {
			
			if ( tabId !== _tab.id ) return;

			// prevent redirects - needs testing
			
			let landing_url = new URL(q);
			let current_url = new URL(__tab.url);
				
			if ( userOptions.ignoreSearchRedirects && current_url.hostname.replace("www.", "") !== landing_url.hostname.replace("www.", "")) return;

			// non-POST should wait to complete
			if (typeof se.method === 'undefined' || se.method !== "POST" || !searchTerms) {

				if ( changeInfo.status !== 'complete' ) return;

				browser.tabs.onUpdated.removeListener(listener);
				
				waitOnInjection(tabId).then(value => {
					highlightSearchTermsInTab(__tab, searchTerms);
					executeSearchCode(_tab.id);
				});
				return;
			}
			
			browser.tabs.onUpdated.removeListener(listener);

			let promises = ['/lib/browser-polyfill.min.js', '/opensearch.js', '/post.js'].map( async (file) => {
				await browser.tabs.executeScript(_tab.id, {
					file: file,
					runAt: 'document_start'
				});
			});
			
			await Promise.all(promises);
			
			browser.tabs.executeScript(_tab.id, {
				code: `
					let se = ${JSON.stringify(se)};
					let _SEARCHTERMS = "${escapeDoubleQuotes(searchTerms)}";
					post(se.template, se.params);
					`,
				runAt: 'document_start'
			});
	
			// listen for the results to complete
			browser.tabs.onUpdated.addListener(async function _listener(_tabId, _changeInfo, _tabInfo) {
					
				if ( _tabId !== _tab.id ) return;

				if ( _tabInfo.status !== 'complete' ) return;
				browser.tabs.onUpdated.removeListener(_listener);
				
				waitOnInjection(tabId).then(value => {
					highlightSearchTermsInTab(_tabInfo, searchTerms);
					executeSearchCode(_tabId);
				});
			});
		});
	}
	
	function onError(error) {
		debug(`Error: ${error}`);
	}

}

function addTabTerms(node, tabId, s) {
	debug('tabTerms add', node.title);
	window.tabTerms.unshift({id: node.id, folderId: node.parentId, tabId: tabId, searchTerms: s});
}

function removeTabTerms(tabId) {
	window.tabTerms = window.tabTerms.filter(t => t.tabId !== tabId);
}

function deactivateTabTerms(tabId) {
	
	for ( tt in window.tabTerms) {
		if ( tt.tabId === tabId ) {
			tt.deactivated = true;
		}
	}
}

function getTabTermsTab(id, s) {
	let t = window.tabTerms.find(_t => _t.id === id && _t.searchTerms === s && !_t.deactivated );
	return browser.tabs.get(t.tabId);
}

async function folderSearch(info, allowFolders) {

	let node = info.node;

	let messages = [];
	
	if ( ["openNewWindow", "openNewIncognitoWindow"].includes(info.openMethod) ) {
		
		let win = await browser.windows.create({
			url: "about:blank",
			incognito: info.openMethod === "openNewIncognitoWindow" ? true : false
		});
		
		info.tab = win.tabs[0];
		info.openMethod = "openCurrentTab";	

		// delay required in FF, else blank page
		await new Promise(r => setTimeout(r, 500));
	}

	// track index outside forEach to avoid incrementing on skipped nodes
	let index = 0;

	node.children.forEach( _node => {
		
		if ( _node.hidden) return;
		if ( _node.type === "separator" ) return;
		if ( _node.type === "folder" && !allowFolders ) return;

		let _info = Object.assign({}, info);
		
		_info.openMethod = index ? "openBackgroundTab" : _info.openMethod;
		_info.folder = index++ ? true : false;
		_info.menuItemId = _node.id;
		_info.searchTerms = info.selectionText || info.searchTerms; // contextMenu uses both, be careful
		_info.node = _node;

		if ( _node.type === "folder" && allowFolders )
			messages.push( async() => await folderSearch(_info) );
		else
			messages.push( async() => await openSearch(_info) );
	});

	async function runPromisesInSequence(promises) {
		for (let promise of promises)
			await promise();
		
		lastSearchHandler(node.id);
	}

	return runPromisesInSequence(messages);
}

function escapeDoubleQuotes(str) {
	if ( !str ) return str;
	return str.replace(/\\([\s\S])|(")/g,"\\$1$2");
}

function escapeBackticks(str) {
	if ( !str ) return str;
	return str.replace(/\\([\s\S])|(`)/g,"\\$1$2");
}

async function highlightSearchTermsInTab(tab, searchTerms) {
	
	if ( !tab ) return;

	if ( userOptions.sideBar.openOnResults ) {
		await browser.tabs.executeScript(tab.id, {
			code: `openSideBar({noSave: true, minimized: ${userOptions.sideBar.openOnResultsMinimized}, openedOnSearchResults: true, openOnResultsLastOpenedFolder: true})`,
			runAt: 'document_idle'
		});
	}

	if ( !userOptions.highLight.enabled ) return;
	
	// show the page_action for highlighting
	// if ( browser.pageAction ) {
	// 	browser.pageAction.show(tab.id);
	// 	browser.pageAction.onClicked.addListener( tab => {
	// 		notify({action: "unmark"});
	// 		notify({action: "removeTabHighlighting", tabId: tab.id});
	// 		browser.pageAction.hide(tab.id);
	// 	});
	// }

	await browser.tabs.executeScript(tab.id, {
		code: `document.dispatchEvent(new CustomEvent("CS_markEvent", {detail: {type: "searchEngine", searchTerms: "`+ escapeDoubleQuotes(searchTerms) + `"}}));`,
		runAt: 'document_idle',
		allFrames: true
	});

	if ( userOptions.highLight.followDomain || userOptions.highLight.followExternalLinks ) {
		
		let url = new URL(tab.url);

		let obj = {tabId: tab.id, searchTerms: searchTerms, domain: url.hostname};
		
		if ( ! highlightTabs.find( ht => JSON.stringify(obj) === JSON.stringify(ht) ) )
			highlightTabs.push(obj);
	}

	browser.tabs.executeScript(tab.id, {
		file: "inject_resultsEngineNavigator.js"
	});
}

function getAllOpenTabs() {
	
	function onGot(tabs) { return tabs; }
	function onError(error) { debug(`Error: ${error}`); }

	var querying = browser.tabs.query({});
	return querying.then(onGot, onError);
}

function encodeCharset(string, encoding) {

	try {
		
		if ( encoding.toLowerCase() === "none" )
			return {ascii: string, uri: string};
		
		if (encoding.toLowerCase() === 'utf-8') 
			return {ascii: string, uri: encodeURIComponent(string)};
		
		let uint8array = new TextEncoder(encoding, { NONSTANDARD_allowLegacyEncoding: true }).encode(string);
		let uri_string = "", ascii_string = "";
		
		for (let uint8 of uint8array) {
			let c = String.fromCharCode(uint8);
			ascii_string += c;
			uri_string += (c.match(/[a-zA-Z0-9\-_.!~*'()]/) !== null) ? c : "%" + uint8.toString(16).toUpperCase();
		}

		return {ascii: ascii_string, uri: uri_string};
	} catch (error) {
		debug(error.message);
		return {ascii: string, uri: string};
	}
}

function updateUserOptionsVersion(uo) {

	let start = Date.now();

	// v1.1.0 to v 1.2.0
	return browser.storage.local.get("searchEngines").then( result => {
		if (typeof result.searchEngines !== 'undefined') {
			debug("-> 1.2.0");
			uo.searchEngines = result.searchEngines || uo.searchEngines;
			browser.storage.local.remove("searchEngines");
		}
		
		return uo;
	}).then( _uo => {
	
		// v1.2.4 to v1.2.5
		if (_uo.backgroundTabs !== undefined && _uo.swapKeys !== undefined) {
			
			debug("-> 1.2.5");
			
			if (_uo.backgroundTabs) {
				_uo.contextMenuClick = "openBackgroundTab";
				_uo.quickMenuLeftClick = "openBackgroundTab";
			}
			
			if (_uo.swapKeys) {
				_uo.contextShift = [_uo.contextCtrl, _uo.contextCtrl = _uo.contextShift][0];
				_uo.quickMenuShift = [_uo.quickMenuCtrl, _uo.quickMenuCtrl = _uo.quickMenuShift][0];
			}
			
			delete _uo.backgroundTabs;
			delete _uo.swapKeys;
			
		}
		
		return _uo;
		
	}).then( _uo => {
	
		//v1.5.8
		if (_uo.quickMenuOnClick !== undefined) {
			
			debug("-> 1.5.8");
			
			if (_uo.quickMenuOnClick)
				_uo.quickMenuOnMouseMethod = 'click';
			
			if (_uo.quickMenuOnMouse)
				_uo.quickMenuOnMouseMethod = 'hold';
			
			if (_uo.quickMenuOnClick || _uo.quickMenuOnMouse)
				_uo.quickMenuOnMouse = true;
			
			delete _uo.quickMenuOnClick;
		}
		
		return _uo;

	}).then( _uo => {
		
		if (browser.bookmarks === undefined) return _uo;

		if (i18n("ContextSearchMenu") === "ContextSearch Menu") return _uo;
		
		debug("-> 1.6.0");
		
		browser.bookmarks.search({title: "ContextSearch Menu"}).then( bookmarks => {

			if (bookmarks.length === 0) return _uo;

			debug('New locale string for bookmark name. Attempting to rename');
			return browser.bookmarks.update(bookmarks[0].id, {title: i18n("ContextSearchMenu")}).then(() => {
				debug(bookmarks[0]);
			}, error => {
				debug(`An error: ${error}`);
			});

		});
		
		return _uo;
	}).then( _uo => {

		// version met
		if (_uo.nodeTree.children) return _uo;
	
		debug("-> 1.8.0");
	
		function buildTreeFromSearchEngines() {
			let root = {
				title: "/",
				type: "folder",
				children: [],
				hidden: false
			}

			for (let se of _uo.searchEngines) {
				root.children.push({
					type: "searchEngine",
					title: se.title,
					hidden: se.hidden || false,
					id: se.id
				});
			}
			
			return root;
		}

		// generate unique id for each search engine
		for (let se of _uo.searchEngines)
			se.id = gen();

		// neither menu uses bookmarks, build from search engine list
		if (!_uo.quickMenuBookmarks && !_uo.contextMenuBookmarks) {
			let root = buildTreeFromSearchEngines();
			_uo.nodeTree = root;
			return _uo;
		}  	
		
		// both menus use bookmarks, build from bookmarks
		else if (_uo.quickMenuBookmarks && _uo.contextMenuBookmarks) {
			return CSBookmarks.treeToFolders().then( root => {
				_uo.nodeTree = root;
				return _uo;
			});
		}

		else {

			return CSBookmarks.treeToFolders().then( (bmTree) => {
				let seTree = buildTreeFromSearchEngines();

				if (_uo.quickMenuBookmarks) {
					debug("BM tree + SE tree");
					bmTree.children = bmTree.children.concat({type:"separator"}, seTree.children);

					_uo.nodeTree = bmTree;
					
				} else {
					debug("SE tree + BM tree");
					seTree.children = seTree.children.concat({type:"separator"}, bmTree.children);

					_uo.nodeTree = seTree;
				}
				
				return _uo;

			});
				
		}

	}).then( _uo => {
		
		if ( _uo.quickMenuItems == undefined ) return _uo;
		
		// fix for 1.8.1 users
		if ( _uo.quickMenuItems != undefined && _uo.quickMenuRows != undefined) {
			debug('deleting quickMenuItems for 1.8.1 user');
			delete _uo.quickMenuItems;
			return _uo;
		}
		// convert items to rows
		let toolCount = _uo.quickMenuTools.filter( tool => !tool.disabled ).length;
		
		// any position but top is safe to ignore
		if (_uo.quickMenuToolsPosition === 'hidden')
			toolCount = 0;
		
		let totalTiles = toolCount + _uo.quickMenuItems;
		
		let rows = Math.ceil(totalTiles / _uo.quickMenuColumns);
		
		if ( _uo.quickMenuUseOldStyle )
			rows = totalTiles;

		_uo.quickMenuRows = rows;
		
		return _uo;
	}).then( _uo => {
		
		if (!_uo.searchEngines.find(se => se.hotkey) ) return _uo;
		
		debug("-> 1.8.2");
		
		_uo.searchEngines.forEach( se => {
			if (se.hotkey) {
				let nodes = findNodes(_uo.nodeTree, node => node.id === se.id);
				nodes.forEach(node => {
					node.hotkey = se.hotkey;
				});
				
				delete se.hotkey;
			}
		});
		
		return _uo;
		
	}).then( _uo => {
		
		if ( !_uo.sideBar.type ) return _uo;
		
		debug("-> 1.9.7");
		
		_uo.sideBar.windowType = _uo.sideBar.type === 'overlay' ? 'undocked' : 'docked';
		delete _uo.sideBar.type;
		
		_uo.sideBar.offsets.top = _uo.sideBar.widget.offset;

		return _uo;
		
	}).then( _uo => {
		
		// remove campaign ID from ebay template ( mozilla request )
		
		let index = _uo.searchEngines.findIndex( se => se.query_string === "https://rover.ebay.com/rover/1/711-53200-19255-0/1?ff3=4&toolid=20004&campid=5338192028&customid=&mpre=https://www.ebay.com/sch/{searchTerms}" );
		
		if ( index === -1 ) return _uo;

		debug("-> 1.14");
		
		_uo.searchEngines[index].query_string = "https://www.ebay.com/sch/i.html?_nkw={searchTerms}";

		return _uo;	
		
	}).then( _uo => {
		
		if ( _uo.nodeTree.id ) return _uo;
		
		debug("-> 1.19");
		
		findNodes(_uo.nodeTree, node => {
			if ( node.type === "folder" && !node.id )
				node.id = gen();
		});

		return _uo;	
	}).then( _uo => {
		
		// delete se.query_string in a future release
		// if ( !_uo.searchEngines.find( se => se.query_string ) ) return _uo;

		let flag = false;
		
		_uo.searchEngines.forEach( (se,index,arr) => {
			if ( se.query_string ) {
				
				if ( se.query_string.length > se.template.length) {
					debug("replacing template with query_string", se.template, se.query_string);
					arr[index].template = arr[index].query_string;
				}
				
				arr[index].query_string = arr[index].template;

				delete se.query_string;

				flag = true;
			}
		});

		if ( flag ) debug("-> 1.27");

		return _uo;	
	}).then( _uo => {

		// replace hotkeys for sidebar ( quickMenuHotkey ) and findbar
		if ( 'quickMenuHotkey' in _uo ) {
			let enabled = _uo.quickMenuOnHotkey;
			let key = _uo.quickMenuHotkey;

			if ( 'key' in key ) {
				key.id = 4;
				key.enabled = enabled;

				debug('userShortcuts', _uo.userShortcuts);

				let us_index = _uo.userShortcuts.findIndex(s => s.id === 4 );
				if ( us_index !== -1 ) _uo.userShortcuts[us_index] = key;
				else _uo.userShortcuts.push(key);
			}

		}

		if ( 'hotKey' in _uo.highLight.findBar ) {
			let enabled = _uo.highLight.findBar.enabled;
			let key = _uo.highLight.findBar.hotKey;

			if ( 'key' in key ) {
				key.id = 1;
				key.enabled = enabled;

				let us = _uo.userShortcuts.find(s => s.id === 1 );
				if ( us ) _uo.userShortcuts[_uo.userShortcuts.indexOf(us)] = key;
				else _uo.userShortcuts.push(key);
			}
			debug("-> 1.29");
		}

		if ( !_uo.highLight.styles.find(s => s.background !== "#000000" && s.color !== "#000000") ) {
			debug('resetting highLight.styles');
			_uo.highLight.styles = defaultUserOptions.highLight.styles; 
			_uo.highLight.activeStyle = defaultUserOptions.highLight.activeStyle; 
		}

		return _uo;

	}).then( _uo => {

		// groupFolder object changed from true/false to false/inline/block
		findNodes(_uo.nodeTree, n => {

			if ( !n.groupFolder ) return;

			if ( n.groupFolder === true ) {
				n.groupFolder = "inline";
				debug(n.title, "groupFolder changed to inline");
			} else if ( n.groupFolder === "none" ) {
				n.groupFolder = false;
				debug(n.title, "groupFolder changed to false");
			}
		});

		return _uo;
	}).then( _uo => {

		// 1.32
		if ( _uo.searchBarIcon.indexOf('icon48.png') )
			_uo.searchBaricon = 'icons/icon.svg'
		return _uo;

	}).then( _uo => {

		if ( _uo.hasOwnProperty("forceOpenReultsTabsAdjacent") ) {
			_uo.forceOpenResultsTabsAdjacent = _uo.forceOpenReultsTabsAdjacent;
			delete _uo.forceOpenReultsTabsAdjacent;
		}
		return _uo;

	}).then( _uo => {

		findNodes(_uo.nodeTree, n => {
			if ( ['folder', 'separator', 'bookmark'].includes(n.type) ) return;

			if ( !n.hasOwnProperty('contexts') )
				n.contexts = 32; // selection)
		})
		return _uo;

	}).then( _uo => {

		if ( _uo.rightClickMenuOnMouseDownFix )
			_uo.quickMenuMoveContextMenuMethod = "dblclick";

		delete _uo.rightClickMenuOnMouseDownFix;
		return _uo;
	}).then( _uo => { // final cleanup

		// remove duplicates
		_uo.searchBarHistory = [...new Set([..._uo.searchBarHistory].reverse())].reverse();

		// set version
		_uo.version = browser.runtime.getManifest().version;
		return _uo;

	}).then( _uo => {
		let els = _uo.quickMenuDomLayout.split(",");

		if ( !els.includes("contextsBar") && !els.includes("!contextsBar") ) {
			els.push("!contextsBar");
			_uo.quickMenuDomLayout = els.join(",");
		}
		return _uo;
	}).then( _uo => {
		if (  _uo.hasOwnProperty("quickMenuUseOldStyle" ) ) {
			_uo.quickMenuDefaultView = _uo.quickMenuUseOldStyle ? 'text' : 'grid';
			delete _uo.quickMenuUseOldStyle;

			debug("removing quickMenuUseOldStyle");
		}

		if ( _uo.hasOwnProperty("searchBarUseOldStyle" ) ) {
			_uo.searchBarDefaultView = _uo.searchBarUseOldStyle ? 'text' : 'grid';
			delete _uo.searchBarUseOldStyle;

			debug("removing searchBarUseOldStyle");
		}

		return _uo;
	}).then( _uo => {

		// unify nodeTree and searchEngines
		if ( _uo.searchEngines.length ) {
			for ( let se of _uo.searchEngines ) {
				let nodes = findNodes(_uo.nodeTree, n => n.id === se.id );

				if ( !nodes.length ) continue;
				else {
					Object.assign(nodes[0], se);

					nodes.forEach( (n,i) => {
						if ( i == 0 ) return;

						for ( let key in n )
							delete n[key];

						Object.assign(n, {
							type: "shortcut",
							id: gen(),
							referenceId: se.id
						});

						debug('shotcut', se.title);
					});

				}
			}

			_uo.searchEngines = [];
		}

		findNodes(_uo.nodeTree, n => {
			if ( n.type === "searchEngine" ) {
				if ( n.hasOwnProperty("icon_base64String") ) {
					n.iconCache = n.icon_base64String;
					delete n.icon_base64String;
				}

				if ( n.hasOwnProperty("icon_url") ) {
					n.icon = n.icon_url;
					delete n.icon_url;
				}
			}

			// favicons are handled through search.get()
			if ( n.type === "oneClickSearchEngine" ) {
				delete n.icon;
			}

			if ( n.hasOwnProperty("icon") && !n.hasOwnProperty("iconCache") ) {
				n.iconCache = "";
			}
		});

		(() => {

			let id = "___tools___"

			if ( findNode(userOptions.nodeTree, n => n.id === id)) return;

			let ts = userOptions.quickMenuTools;

			let folder = {
				type:"folder",
				title:"Tools Menu",
				children:[],
				hidden:false,
				id:id
			}

			ts.forEach(t => {

				let tool = QMtools.find( _t => _t.name === t.name);

				folder.children.push({
					type: "tool",
					hidden: t.disabled,
					title: tool.title,
					icon: tool.icon,
					tool: tool.name
				})
			})

			userOptions.nodeTree.children.unshift(folder);
		});

		debug("-> 1.47");

		return _uo;
	}).then( _uo => {
	
		return _uo;
	}).then( _uo => {

		// 1.47+
		if ( Object.keys(uo.nodeTree).length === 0 ) {
			uo.nodeTree.children = defaultEngines;
		}

		debug('Done ->', _uo.version, Date.now() - start);
		return _uo;
	});
}

function resetPersist() {
// turn off if persist = false 
	userOptions.quickMenuTools.forEach( (tool,index) => { 
		if ( tool.persist && tool.persist === false )
			userOptions.quickMenuTools[index].on = false;
	});
}

function setIcon() {
	browser.browserAction.setIcon({path: userOptions.searchBarIcon || 'icons/logo_notext.svg'});
}

async function checkForOneClickEngines() {

	await updateBrowserEngines();

	let newEngineCount = 0;
	let folder = findNode(userOptions.nodeTree, n => n.id === "___browser_engines___");
	let hasFolder = true;

	if ( !folder ) {
		folder = {
			type:"folder",
			title: i18n("SearchBarEngines"),
			icon: "https://design.firefox.com/product-identity/firefox/firefox/firefox-logo.png",
			id: "___browser_engines___",
			children:[]
		}

		hasFolder = false;
	}

	firefoxSearchEngines.forEach( engine => {
		let found = findNode(userOptions.nodeTree, node => node.title === engine.name && ( node.type === "searchEngine" || node.type === "oneClickSearchEngine") );
		
		if ( found ) return;

		let node = {
			type: "oneClickSearchEngine",
			title: engine.name,
			hidden: false,
			id: gen()
		}

		debug('adding One-Click engine ' + engine.name);
		folder.children.push(node);
		
		newEngineCount++;
		
	});

	if ( newEngineCount && !hasFolder )
		userOptions.nodeTree.children.push(folder);

	return newEngineCount;
}

// note: returns a promise to loadRemoteIcons
function dataToSearchEngine(data) {
	
	// useful when using page_action to trigger custom search iframe
	if (!data) return null;

	let favicon_href = data.favicon_href || "";

	let template = "";
	let params = [];
	
	// convert single object to array
	for (let k in data.params)
		params.push({name: k, value: data.params[k]});

	if (data.method === "GET" && data.query) {
		
		let param_str = data.query + "={searchTerms}";

		for (let i in data.params) {
			param_str+="&" + i + "=" + data.params[i];
		}
		// If the form.action already contains url parameters, use & not ?
		template = data.action + ((data.action.indexOf('?') === -1) ? "?":"&") + param_str;	
		
	} else {
		// POST form.template = form.action
		template = data.action;
		
		if (data.query)
			params.unshift({name: data.query, value: "{searchTerms}"});

	}
	
	// build search engine from form data
	let se = {
		"searchForm": data.origin, 
		"icon": data.favicon_href || data.origin + "/favicon.ico",
		"title": data.name || data.title,
		"iconCache": "", 
		"method": data.method, 
		"params": params, 
		"template": template, 
		"queryCharset": data.characterSet.toUpperCase(),
		"description": data.description,
		"id": gen()
	};

	return loadRemoteIcon({
		searchEngines: [se],
		timeout:5000
	});

}

function readOpenSearchUrl(url) {
	return new Promise( async (resolve, reject) => {
		
		let t = setTimeout(() => {
			console.error('Error fetching ' + url + " This may be due to Content Security Policy https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP");
			
			reject(false);
		}, 2000);
		
		let resp = await fetch(url);
		let text = await resp.text();
		
		let parsed = new DOMParser().parseFromString(text, 'application/xml');

		if (parsed.documentElement.nodeName=="parsererror") {
			debug('xml parse error');
			clearTimeout(t);
			resolve(false);
		}
		
		clearTimeout(t);
		resolve(parsed);
	});
}

function openSearchXMLToSearchEngine(xml) {
		
	let se = {};

	let shortname = xml.documentElement.querySelector("ShortName");
	if (shortname) se.title = shortname.textContent;
	else return Promise.reject();
	
	let description = xml.documentElement.querySelector("Description");
	if (description) se.description = description.textContent;
	else return Promise.reject();
	
	let inputencoding = xml.documentElement.querySelector("InputEncoding");
	if (inputencoding) se.queryCharset = inputencoding.textContent.toUpperCase();
	
	let url = xml.documentElement.querySelector("Url[template]");
	if (!url) return Promise.reject();
	
	let template = url.getAttribute('template');
	if (template) se.template = template;
	
	let searchform = xml.documentElement.querySelector("moz\\:SearchForm");
	if (searchform) se.searchForm = searchform.textContent;
	else if (template) se.searchForm = new URL(template).origin;
	
	let image = xml.documentElement.querySelector("Image");
	if (image) se.icon = image.textContent;
	else se.icon = new URL(template).origin + '/favicon.ico';
	
	let method = url.getAttribute('method');
	if (method) se.method = method.toUpperCase() || "GET";

	let params = [];
	for (let param of url.getElementsByTagName('Param')) {
		params.push({name: param.getAttribute('name'), value: param.getAttribute('value')})
	}
	se.params = params;
	
	if (se.params.length > 0 && se.method === "GET") {
		se.template = se.template + ( (se.template.match(/[=&\?]$/)) ? "" : "?" ) + nameValueArrayToParamString(se.params);
	}
	
	se.id = gen();

	return loadRemoteIcon({
		searchEngines: [se],
		timeout:5000
	});

}

function isAllowedURL(_url) {

	try {
		let url = new URL(_url);

		// test for pure hostname
		if ( userOptions.blockList.includes(url.hostname)) return false;

		for ( let pattern of userOptions.blockList) {

			// skip blank
			if ( !pattern.trim() ) continue;

			// skip disabled
			if ( /^!|^#/.test(pattern) ) continue

			// test for pure regex
			try {
				let regex = new RegExp(pattern);
				if ( regex.test(url.href)) {
					debug(url.href + " matches " + pattern);
					return false;
				}
				continue;
			} catch( err ) {}
			
			// test for wildcards
			try {
				let regex = new RegExp(pattern.replace(/\*/g, "[^ ]*").replace(/\./g, "\\."));
				if ( regex.test(url.hostname) || regex.test(url.href)) {
					debug(url.href + " matches " + pattern);
					return false;
				}
				continue;
			} catch (err) {}
		}
	} catch (err) { debug('bad url for tab', _url)}

	return true;
}

async function injectContentScripts(tab, frameId) {

	//let contentType = await browser.tabs.executeScript(tab.id, { code: "document.contentType", matchAboutBlank:false, frameId: frameId });

	// filter documents that can't attach menus
	let isHTML = await browser.tabs.executeScript(tab.id, { code: "document.querySelector('html') ? true : false", matchAboutBlank:false, frameId: frameId });
	if ( !isHTML.shift() ) return;

	let check = await browser.tabs.executeScript(tab.id, { code: "window.hasRun", matchAboutBlank:false, frameId: frameId });
	if ( check[0] && check[0] === true ) {
		debug('already injected', tab.url, frameId);
		return;
	}

	onFound = () => {}
	onError = (err) => {debug(err, tab.url)}

	// inject into any frame
	[
		"/lib/browser-polyfill.min.js",
		"/utils.js", // for isTextBox
		"/inject.js",
		"/lib/mark.es6.min.js",
		"/inject_highlight.js",
		"/hotkeys.js",
		"/defaultShortcuts.js",
		"/dragshake.js",
		"/contexts.js",
		"/tools.js" // for shortcuts
	].forEach(js => browser.tabs.executeScript(tab.id, { file: js, matchAboutBlank:false, frameId: frameId, runAt: "document_end"}).then(onFound, onError))
	browser.tabs.insertCSS(tab.id, {file: "/inject.css", matchAboutBlank:false, frameId: frameId, cssOrigin: "user"}).then(onFound, onError);

	if ( frameId === 0 ) { /* top frames only */
		[
			"/nodes.js",
			"/opensearch.js",
			"/dock.js",
			"/inject_sidebar.js",
			"/inject_customSearch.js",
			"/resizeWidget.js"
		].forEach(js => browser.tabs.executeScript(tab.id, { file: js, matchAboutBlank:false, runAt: "document_end"}).then(onFound, onError))
		browser.tabs.insertCSS(tab.id, {file: "/inject_sidebar.css", matchAboutBlank:false, cssOrigin: "user"}).then(onFound, onError);
	}
}

function waitOnInjection(tabId) {

	let interval;
	let timeout;
	const start = Date.now();

	const cleanup = () => {
		clearInterval(interval);
		clearTimeout(timeout);
	}

	return Promise.race([

		// timeout
		new Promise(r => {
			timeout = setTimeout(() => {
				cleanup();
				console.error('waitOnInjection timeout', tabId);
				r(false);
			}, userOptions.waitOnInjectionTimeout);
		}),

		// interval test
		new Promise(r => {
			interval = setInterval(async () => {
				try {
					let result = await browser.tabs.executeScript(tabId, { code: "window.hasRun"} );

					if ( result[0] ) {
						cleanup();
						debug(`waitOnInjection (tab ${tabId}) took ${Date.now() - start}ms`);
						r(true);
					}

				} catch ( error ) {
					cleanup();
					console.error('waitOnInjection failed', tabId);
					r(false);
				}				
			}, 500);
		})
	]);
}

async function scrapeBookmarkIcons() {
	let bms = await CSBookmarks.treeToFolders("root________");
	findNode(bms, n => {
		if ( n.type !== 'bookmark') return false;
		browser.bookmarks.get(n.id).then( bm => {
			bm = bm.shift();
			debug(bm);
			fetchFavicon(bm.url);
		})
		
	});

	async function fetchFavicon(_url) {

		debug(_url);

		try {

			let url = new URL(_url);
			debug('fetching', url.origin);
			var response = await fetch(url.origin + "/favicon.ico");
			switch (response.status) {
				// status "OK"
				case 200:
					debug(url.origin + "/favicon.ico found!");
					// var template = await response.text();

					// debug(template);
					break;
				// status "Not Found"
				case 404:
					debug('Not Found');
					break;
			}
		} catch ( error ) {}
	} 


    // var response = await fetch('https://google.com ');
    // switch (response.status) {
    //     // status "OK"
    //     case 200:
    //         var template = await response.text();

    //         debug(template);
    //         break;
    //     // status "Not Found"
    //     case 404:
    //         debug('Not Found');
    //         break;
    // }
}

async function updateBrowserEngines() {
	if ( !browser.search || !browser.search.get ) return;

	firefoxSearchEngines = await browser.search.get();
}

async function restorePreviousVersion() {
	try {
		let uob = await browser.storage.local.get("userOptionsBackup");
		userOptions = updateUserOptionsVersion(uob);

		notify({action: "saveUserOptions", userOptions:userOptions});

		return userOptions;
		
	} catch (error ) {
		console.error(error);
		return null;
	}
}

function exportJSONObject(o, filename) {

	try {
		let blob = new Blob([JSON.stringify(o)], {type: "application/json"}); 
		let url  = URL.createObjectURL(blob);

		return browser.downloads.download({
			url: url,
			filename: filename
		});
	} catch( error ) { console.error(error)}
}

function exportUserOptions(uo) {

	uo = uo || userOptions;
	let date = new Date().toISOString().replace(/:|\..*/g,"").replace("T", "_");
	let filename = `ContextSearchOptions_${date}.json`;

	return exportJSONObject(uo, filename);
}

async function awaitPermission(permission) {
	if ( ! await browser.permissions.contains({permissions: [permission]}) ) {
		let tabs = await browser.tabs.query({active:true});
		let tab = tabs[0];
		let optionsTab = await notify({action: "openOptions", hashurl:`?permission=${permission}#requestPermissions`});
		browser.tabs.onRemoved.addListener( function handleRemoved(tabId, removeInfo) {
			browser.tabs.onRemoved.removeListener(handleRemoved);
			setTimeout(() => browser.tabs.update(tab.id, {active: true}), 50);

		});
	}

	return Promise.race([
		new Promise(r => {
			setInterval(async() => {
				if ( await browser.permissions.contains({permissions: [permission]}) ) r(true);
			}, 500)
		}),
		new Promise(r => setTimeout(() => r(false), 30000))
	]);
}

// unique object to reference globally
var quickMenuObject = { 
	keyDownTimer: 0,
	mouseDownTimer: null,
	mouseCoords: {x:0, y:0},
	screenCoords: {x:0, y:0},
	mouseCoordsInit: {x:0, y:0},
	mouseLastClickTime: 0,
	lastSelectTime: 0,
	lastSelectText:"",
	locked: false,
	searchTerms: "",
	searchTermsObject:{},
	disabled: false,
	mouseDownTargetIsTextBox: false,
	mouseLastContextMenuTime:0,
	contexts: []
};

var userOptions = {};
var killswitch = false; // global switch for disabling injected functions on the fly
window.suspendSelectionChange = false;

browser.runtime.sendMessage({action: "getUserOptions"}).then( uo => userOptions = uo);

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {

	if ( message.userOptions ) userOptions = message.userOptions;

	switch (message.action) {
		case "updateSearchTerms":

			quickMenuObject.searchTerms = message.searchTerms;

			// track the last selection with value
			quickMenuObject.lastSelectText = message.searchTerms || quickMenuObject.lastSelectText

			// send event to OpenAsLink tile to enable/disable
			document.dispatchEvent(new CustomEvent('updatesearchterms'));

			browser.runtime.sendMessage({
				action: "updateQuickMenuObject", 
				quickMenuObject: quickMenuObject
			});
			break;

		case "updateQuickMenuObject":

			quickMenuObject = Object.assign(quickMenuObject, { 
				keyDownTimer: quickMenuObject.keyDownTimer,
				mouseDownTimer: quickMenuObject.mouseDownTimer,
				mouseDownHoldTimer: quickMenuObject.mouseDownHoldTimer,
				mouseCoords: quickMenuObject.mouseCoords,
				screenCoords: quickMenuObject.screenCoords,
				mouseCoordsInit: message.quickMenuObject.mouseCoordsInit,
				mouseLastClickTime: Math.max(message.quickMenuObject.mouseLastClickTime, quickMenuObject.mouseLastClickTime),
				lastSelectTime: Math.max(message.quickMenuObject.lastSelectTime, quickMenuObject.lastSelectTime),
				lastSelectText: message.quickMenuObject.lastSelectText,
				locked: message.quickMenuObject.locked,
				searchTerms: message.quickMenuObject.searchTerms,
				searchTermsObject: message.quickMenuObject.searchTermsObject,
				disabled: message.quickMenuObject.disabled,
				mouseDownTargetIsTextBox: message.quickMenuObject.mouseDownTargetIsTextBox,
				mouseLastContextMenuTime:Math.max(message.quickMenuObject.mouseLastContextMenuTime, quickMenuObject.mouseLastContextMenuTime),
				contexts:message.quickMenuObject.contexts
			});

			break;

		case "showNotification":
			showNotification(message);
			break;

		case "copyRaw":
			return copyRaw(message.autoCopy);
			break;
	}
});

function getRawSelectedText(el) {
	if (el && typeof el.selectionStart !== 'undefined') {
		let start = el.selectionStart;
		let finish = el.selectionEnd;
		return el.value.substring(start, finish);
	} else
		return window.getSelection().toString().trim();

}

function getSelectedText(el) {
	return getRawSelectedText(el).trim();
}

async function copyImage(imageURL){

	const dataURI = await browser.runtime.sendMessage({action: "fetchURI", url: imageURL});
	const blob = await (await fetch(dataURI)).blob();
	const item = new ClipboardItem({ [blob.type]: blob });
	navigator.clipboard.write([item]);
}

async function copyRaw(autoCopy) {

	// if ( userOptions.autoCopyImages && quickMenuObject.searchTermsObject.image ) {
	// 	console.log('attempting to copy image to clipboard');
	// 	return copyImage(quickMenuObject.searchTermsObject.image);
	// }

	let rawText = getRawSelectedText(document.activeElement);

	if ( !rawText ) rawText = quickMenuObject.searchTerms;

	if ( !rawText ) return;

	console.log('autoCopy:', rawText);

	try {
		navigator.clipboard.writeText(rawText);
	} catch (err) {

		let active = document.activeElement;

		save = () => {

			if ( active && typeof active.selectionStart !== 'undefined' ) {
				return {start: active.selectionStart, end: active.selectionEnd};
			}
		    const selection = window.getSelection();
		    return selection.rangeCount === 0 ? null : selection.getRangeAt(0);
		};

		// Restore the selection
		restore = (range) => {
			if ( active && typeof active.selectionStart !== 'undefined' ) {
				active.selectionStart = range.start;
				active.selectionEnd = range.end;
				active.focus();
				return;
			}
		    const selection = window.getSelection();
		    selection.removeAllRanges();
		    selection.addRange(range);
		};

		window.suspendSelectionChange = true;

		let activeRange = save();
		
		var t = document.createElement("textarea");

		// Avoid scrolling to bottom
		t.style.top = "-1000px";
		t.style.left = "-1000px";
		t.style.position = "fixed";
		t.style.width = 0;
		t.style.height = 0;
		t.style.display = "none";

		t.value = rawText;

		document.body.appendChild(t);
		t.focus();
		t.select();

		try {
			document.execCommand('copy');
		} catch (_err) {
			console.log(_err);
		}

		document.body.removeChild(t);

		restore(activeRange);
		active.focus();

		console.log('autoCopy');

		// delay required in Waterfox
		setTimeout(() => window.suspendSelectionChange = false, 10);

	}
}

function getContexts(el, e) {

	let co = getContextsObject(el, e);

	let c = [];
	for ( let key in co ) {
		if ( co[key] ) c.push(key);
	}

	if ( co.linkText && getLinkMethod(e) === 'text' && !c.includes("selection") ) c.push("selection");

	if ( c.length > 2) c = c.filter(_c => _c !== "frame" );
	if ( c.length > 1) c = c.filter(_c => _c !== "page" );

	return c;
}

function getContextsObject(el, e) {
	let o = {};
	["audio", "frame", "image", "link", "page", "selection", "video"].forEach(c => o[c] = null);

	if ( !el ) return o;

	o['image'] = getImage(el);
	if ( el instanceof HTMLAudioElement ) o['audio'] = el.src;
	if ( el instanceof HTMLVideoElement ) o['video'] = el.src;

	if ( el.closest && el.closest('a')) {
		o['link'] = el.closest('a').href;
		o['linkText'] = el.closest('a').innerText;
	}
	
	o['selection'] = getSelectedText(el);

	if ( el.nodeName === 'IFRAME' || ( el.ownerDocument && el.ownerDocument.defaultView != top ) ) o['frame'] = window.location.href;

	o['page'] = window.location.href;
	
	return o;
}

// update searchTerms when selecting text and quickMenuObject.locked = true
document.addEventListener("selectionchange", e => {

	if ( window.suspendSelectionChange ) return;

	// debouncer is causing issues on double-click selection with qm ( empty terms )
	if ( isTextBox(e.target) ) return false;

	// reset before the debounce
	quickMenuObject.lastSelectTime = Date.now();

	debounce(() => {

		if ( window.suspendSelectionChange ) return;

		let searchTerms = window.getSelection().toString().trim();

		// causing errant menu updates
		if (quickMenuObject.searchTerms === searchTerms) return;

		// if an opener method timer is running, skip
		if ( quickMenuObject.mouseDownTimer && !searchTerms ) return;

		if ( searchTerms ) quickMenuObject.lastSelectText = searchTerms;

		quickMenuObject.searchTerms = searchTerms;
		
		browser.runtime.sendMessage({action: "updateSearchTerms", searchTerms: searchTerms});
		browser.runtime.sendMessage({action: 'updateContextMenu', searchTerms: searchTerms, currentContexts: getContexts(e.target, e), ctrlKey:e.ctrlKey});

	}, 250, "selectionchangedebouncer");
});

// selectionchange handler for input nodes
for (let el of document.querySelectorAll("input, textarea, [contenteditable='true']")) {
	el.addEventListener('mouseup', e => {

		// left-button only
		if ( e.button !== 0 ) return;

		if ( !isTextBox(e.target) ) return false;
		
		let searchTerms = getSelectedText(e.target);

		if (searchTerms) {
			quickMenuObject.searchTerms = searchTerms;
			browser.runtime.sendMessage({action: "updateSearchTerms", searchTerms: searchTerms, input:true});
			browser.runtime.sendMessage({action: 'updateContextMenu', searchTerms: searchTerms, currentContexts: getContexts(e.target, e), ctrlKey:e.ctrlKey});
		}

	});
}

// Relabel context menu root on mousedown to fire before oncontextmenu
window.addEventListener('mousedown', async e => {

	if ( e.button !== 2 ) return false;

	if ( e.target.closest("contextsearch-widgets") ) return false;

	let searchTerms = getSelectedText(e.target) || linkOrImage(e.target, e) || "";

	if ( !searchTerms && userOptions.contextMenuUseInnerText ) {
		searchTerms = e.target.innerText.trim();
	}
	
	browser.runtime.sendMessage({action: "updateSearchTerms", searchTerms: searchTerms});
	browser.runtime.sendMessage({action: 'updateContextMenu', searchTerms: searchTerms, currentContexts: getContexts(e.target), linkMethod:getLinkMethod(e), ctrlKey:e.ctrlKey});
});

function linkOrImage(el, e) {
	
	let link = getLink(el, e);
	let img = getImage(el, e);

	if ( img && userOptions.quickMenuOnImages ) return img;
	
	if ( link && userOptions.quickMenuOnLinks ) return link;

	if ( el instanceof HTMLVideoElement && userOptions.quickMenuOnVideos )
		return el.currentSrc || el.src;

	if ( el instanceof HTMLAudioElement && userOptions.quickMenuOnAudios ) {
		return el.currentSrc || el.src;
	}
	
	return false;	
}

// https://stackoverflow.com/a/1045012
function offset(elem) {
    if(!elem) elem = this;

    var x = elem.offsetLeft;
    var y = elem.offsetTop;

    while (elem = elem.offsetParent) {
        x += elem.offsetLeft;
        y += elem.offsetTop;
    }

    return { left: x, top: y };
}

function repositionOffscreenElement( element, padding ) {

	padding = padding || { top:0, bottom:0, left:0, right:0 };

	let fixed = window.getComputedStyle( element, null ).getPropertyValue('position') === 'fixed' ? true : false;
	
	let originalTransition = element.style.transition || null;
	// let originalDisplay = element.style.display || null;
	// element.style.transition = 'none';

//	element.style.display = 'none';

	element.style.maxHeight = element.style.maxWidth = 0;

	// move if offscreen
	let scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
	let scrollbarHeight = window.innerHeight - document.documentElement.clientHeight;
	
	element.style.maxHeight = element.style.maxWidth = null;
	
	// element.style.display = originalDisplay;

	// element.style.transition = 'all .15s';
	
	let rect = element.getBoundingClientRect();
	
	if ( ! fixed ) {
		
		let maxWidth = Math.min(window.innerWidth, document.body.getBoundingClientRect().right);
		let maxHeight = Math.min(window.innerHeight, document.body.getBoundingClientRect().bottom);
		
		if (rect.y < 0) 
			element.style.top = Math.max(parseFloat(element.style.top) - rect.y, 0) + padding.top + "px";
		
		if (rect.bottom > window.innerHeight) 
			element.style.top = parseFloat(element.style.top) - ((rect.y + rect.height) - window.innerHeight) - scrollbarHeight - padding.bottom + "px";
		
		if (rect.x < 0) 
			element.style.left = Math.max(parseFloat(element.style.left) - rect.x, 0) + padding.left + "px";
		
		if (rect.right > maxWidth ) 
			element.style.left = parseFloat(element.style.left) - ((rect.x + rect.width) - maxWidth) - padding.right + "px";

		return;
	}
	
	if ( rect.bottom > window.innerHeight - scrollbarHeight ) {
		if ( element.style.bottom )
			element.style.bottom = "0";
		else 
			element.style.top = (window.innerHeight - scrollbarHeight - rect.height) + "px";
		
		// console.log('bottom overflow');
	}

	if (rect.top < 0) {
		if ( element.style.bottom ) 
			element.style.bottom = (window.innerHeight - rect.height) + "px";
		else
			element.style.top = "0";
		
		// console.log('top overflow');
	}
	
	if ( rect.right > window.innerWidth - scrollbarWidth ) {
		if ( element.style.right )
			element.style.right = "0";
		else 
			element.style.left = (window.innerWidth - scrollbarWidth - rect.width) + "px";
		
		// console.log('right overflow');
	}
	
	if ( rect.left < 0 ) {
		if ( element.style.right ) 
			element.style.right = (window.innerWidth - rect.width) + "px";
		else
			element.style.left = "0";
		
		// console.log('left overflow');
	}

	runAtTransitionEnd(element, ["top", "bottom", "left", "right"], () => {
		element.style.transition = originalTransition;
	})
	
	// if (rect.y + rect.height > window.innerHeight) 
		// element.style.top = parseFloat(element.style.top) - ((rect.y + rect.height) - window.innerHeight) - scrollbarHeight + "px";
	
	// if (rect.left < 0) 
		// element.style.left = (parseFloat(element.style.left) - rect.x) + "px";
	
	// if (rect.x + rect.width > window.innerWidth) 
		// element.style.left = parseFloat(element.style.left) - ((rect.x + rect.width) - window.innerWidth) - scrollbarWidth + "px";

}

function getLinkText(el) {

	if ( !el.closest ) return false;

	let a = el.closest('a');
	
	if ( !a ) return "";

	return a.innerText;
}

function getLinkMethod(e) {
	let method = userOptions.contextMenuSearchLinksAs;
	
	if ( e && e.ctrlKey ) return method === 'url' ? 'text' : 'url';
	else return method;
}

function getLinkURL(el) {
	if ( !el.closest ) return false;

	let a = el.closest('a');
	
	return a ? a.href : "";
}

function getLink(el, e) {

	if ( !el.closest ) return false;

	let a = el.closest('a');
	
	if ( !a ) return "";
	
	return getLinkMethod(e) === 'url' ? a.href || a.innerText : a.innerText || a.href;
}

function getImage(el, e) {

	if ( !el.closest ) return false;
	
	if ( el.innerText ) return false;
	
	if ( el.tagName === 'IMG' ) return el.src;
	
	let style = window.getComputedStyle(el, false);
	
	let backgroundImage = style.backgroundImage;

	if ( ! /^url\(/.test(backgroundImage) ) return false;

	return backgroundImage.slice(4, -1).replace(/"/g, "")
}

function showNotification(message) {

	let msg = message.msg;

	let id = "CS_notification" + btoa(msg).substr(0,8);

	let n = document.getElementById(id) || document.createElement('notification');
	n.id = id;
	n.className = 'CS_notification';
	n.innerHTML = null;
	
	let img = new Image();
	img.src = browser.runtime.getURL('icons/logo_notext.svg');
	
	let cb = new Image();
	cb.src = browser.runtime.getURL('icons/crossmark.svg');
	cb.style = 'cursor:pointer;height:16px;position:absolute;right:10px;top: 50%;transform: translate(0, -50%);margin:0';
	cb.onclick = close;
	
	let content = document.createElement('div');
	content.className = 'content';
	content.innerText = msg;
	
	[img, content, cb].forEach(el => n.appendChild(el));

	n.style.opacity = 0;
	document.body.appendChild(n);
	n.getBoundingClientRect();
	n.style.opacity = 1;
	n.getBoundingClientRect();

	const close = () => {
		runAtTransitionEnd(n, ['opacity'], () => {
			document.body.removeChild(n);
		});
		
		n.style.opacity = 0;
	}

	if ( !message.sticky ) setTimeout(close, 3000);
	
	n.onclick = function() {
		document.body.removeChild(n);
	}

	return n;
}

function checkContextMenuEventOrderNotification() {
	let n = showNotification({msg:"", sticky:true});

	let yes = document.createElement('a');
	yes.innerText = i18n('yes');
	yes.href = "#";

	let no = document.createElement('a');
	no.innerText = i18n('no');
	no.href="#";

	let content = n.querySelector('.content');
	content.innerText = i18n('checkContextMenuOrderNotification');
	n.appendChild(yes);
	n.appendChild(document.createTextNode(" / "));
	n.appendChild(no);

	no.onclick = function() {
		userOptions.checkContextMenuEventOrder = false;
		browser.runtime.sendMessage({action: "saveUserOptions", userOptions: userOptions, source: "checkContextMenuEventOrderNo"});
	}

	yes.onclick = function() {
		userOptions.checkContextMenuEventOrder = false;
		userOptions.quickMenuMoveContextMenuMethod = "dblclick";
		browser.runtime.sendMessage({action: "saveUserOptions", userOptions: userOptions, source: "checkContextMenuEventOrderYes"});
	}

}

// set zoom attribute to be used for scaling objects
function setZoomProperty() {
	let el = getShadowRoot().host || document.documentElement;
	el.style.setProperty('--cs-zoom', window.devicePixelRatio);
}

document.addEventListener('zoom', setZoomProperty);

// apply global user styles for /^[\.|#]CS_/ matches in userStyles
browser.runtime.sendMessage({action: "addUserStyles", global: true });

// menuless hotkey
function checkForNodeHotkeys(e) {

	if ( 
		!userOptions.allowHotkeysWithoutMenu ||
		isTextBox(e.target) ||
		e.shiftKey || e.ctrlKey || e.altKey || e.metaKey
	) return false;

	let searchTerms = getSearchTermsForHotkeys(e);

	if ( !searchTerms ) return false;

	let node = findNode( userOptions.nodeTree, n => n.hotkey === e.keyCode );

	if ( !node ) return false;

	browser.runtime.sendMessage({
		action: "search", 
		info: {
			node: node,
			menuItemId: node.id,
			selectionText: searchTerms,
			openMethod: userOptions.quickMenuSearchHotkeys
		}
	});
}

function getSearchTermsForHotkeys(e) {
	let el = document.elementFromPoint(quickMenuObject.mouseCoords.x, quickMenuObject.mouseCoords.y);

	let img =  userOptions.allowHotkeysOnImages ? getImage(el) : null;
	let link = userOptions.allowHotkeysOnLinks ? getLink(el) : null;
	let page = userOptions.allowHotkeysOnPage ? window.location.href : null;

	if ( el instanceof HTMLAudioElement || el instanceof HTMLVideoElement ) 
		link = el.currentSrc || el.src;

	return getSelectedText(e.target) || img || link || page || "";
}

function createShadowRoot() {

	if ( typeof document.documentElement.shadowRoot === 'undefined' ) {
		document.body.getElementById = (id) => document.querySelector('#' + id);
		return;
	}

	if ( document.querySelector('contextsearch-widgets')) return;

	let div = document.createElement('contextsearch-widgets');
	div.id = "contextsearch-widgets";
	document.documentElement.appendChild(div);
	let shadow = div.attachShadow({mode: 'open'})
		.innerHTML = `
      <style>
        :host { all: initial; }
      </style>`;
}

function getShadowRoot() {

	let div = document.querySelector('contextsearch-widgets');

	if ( div && div.shadowRoot ) return div.shadowRoot;
	else return document.body || null;
}

// track mouse position
document.addEventListener("mousemove", e => {
	quickMenuObject.mouseCoords = {x: e.clientX, y: e.clientY};
	quickMenuObject.screenCoords = {x: e.screenX, y: e.screenY};

	screenCoords = {x: e.screenX, y: e.screenY};
}, {capture: true});

document.addEventListener('keydown', e => {
	if ( e.key === "Escape" ) {

		killswitch = true;

		// disable repeatsearch
		(() => {
			let tool = userOptions.quickMenuTools.find( _tool => _tool.name === "repeatsearch" );

			if ( tool && tool.on ) {
				tool.on === false;
				saveUserOptions();
			}
		})();
	}
});

(() => {

	document.addEventListener('keydown', e => {

		if ( !userOptions.developerMode ) return;
		
		if ( e.key === "s" && e.ctrlKey && e.altKey) {
			let f = document.createElement('iframe');
			f.setAttribute('allowtransparency', true);
			f.style="border:none;position:fixed;width:100vw;height:100vh;z-index:999;top:0;bottom:0;left:0;right:0;transform:scale(calc(1.5/var(--cs-zoom)))";
			f.src = browser.runtime.getURL('/speedDial.html?id=');

			getShadowRoot().appendChild(f);

			window.addEventListener('message', e => {
				if ( e.data.action && e.data.action === "close") {
					f.parentNode.removeChild(f);
				}
			});
		}
	});
});

document.addEventListener("fullscreenchange", e => {
	let div = document.querySelector('contextsearch-widgets');
	if ( div ) div.style.display = document.fullscreen ? 'none' : null;
	else {
		let sb = getIframe ? getIframe() : null;
		let ot = getOpeningTab ? getOpeningTab() : null;
		let nb = getNavBar ? getNavBar() : null;
		let fb = getFindBar ? getFindBar() : null;

		[sb, ot, nb, fb].forEach( el => { 
	  		if ( el ) el.classList.toggle('CS_hide', document.fullscreen);
	  	});

	}
});

createShadowRoot();
setZoomProperty();

window.hasRun = true;

browser.runtime.sendMessage({action: "injectComplete"});

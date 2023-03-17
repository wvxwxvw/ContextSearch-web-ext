var userOptions;
var focusSearchBar = true;

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
	
	if ( message.userOptions ) userOptions = message.userOptions;

	if (typeof message.action !== 'undefined') {
		switch (message.action) {
			case "updateQuickMenuObject":
				quickMenuObject = message.quickMenuObject;
				
				// quickMenuObject can update before userOptions. Grab the lastUsed
				userOptions.lastUsedId = quickMenuObject.lastUsed || userOptions.lastUsedId;
				
				// send event to OpenAsLink tile to enable/disable
				document.dispatchEvent(new CustomEvent('updatesearchterms'));
				break;
		}
	}
});

function getSelectedText(el) {
	return el.value.substring(el.selectionStart, el.selectionEnd);
}

function getUrlParam(p) {
	var url = new URL(window.location.href);
	return url.searchParams.get(p);
}

browser.runtime.sendMessage({action: "getUserOptions"}).then( async uo => {
	userOptions = uo;
	
	let singleColumn = window == top ? userOptions.searchBarDefaultView === 'text' : userOptions.sideBar.singleColumn;

	let folderId = getUrlParam("folderId");
	let folder = folderId ? findNode(uo.nodeTree, n => n.id === folderId) : null;

	await setTheme();
	await setUserStyles();
	await makeQuickMenu({type: window == top ? "searchbar" : "sidebar", singleColumn: singleColumn, contexts:[], node: folder})
		.then( qme => {
			document.body.appendChild(qme);
			
			if ( userOptions.quickMenuToolsPosition === 'bottom' && userOptions.quickMenuToolsAsToolbar )	
				document.body.appendChild(toolBar);
		});

	// override layout
	setLayoutOrder( qm.dataset.menu === "sidebar" ? userOptions.sideBar.domLayout : userOptions.searchBarDomLayout );

	makeSearchBar();

	document.dispatchEvent(new CustomEvent('quickMenuIframeLoaded'));

	let sideBarOpenedOnSearchResults = await browser.runtime.sendMessage({action: 'sideBarOpenedOnSearchResults'});
	if ( sideBarOpenedOnSearchResults ) focusSearchBar = false;

	makeAddEngineBar();

	setDraggable();
	
});

document.addEventListener('quickMenuIframeLoaded', () => {

	// combined with inline body style prevents glitching when opening menu
	document.body.style.display = 'block';
		
	// focus the searchbar on open
	if ( focusSearchBar ) sb.focus();

	// trigger resize for sidebar. Resize triggers on load in the browser_action
	resizeMenu({openFolder: true});
	
	// replace text with selection
	(async () => {
		let results = await browser.runtime.sendMessage({action: "getSelectedText"});
		let text = results ? results.shift() : null;
	
		if ( text ) sb.set(text);

		if ( focusSearchBar && userOptions.quickMenuSearchBarSelect ) sb.select();
	})();

	tileSlideInAnimation(.3, .15, .375);
});

function toolsHandler() {
	
	if ( !qm ) return;
	
	if ( ! userOptions.quickMenuToolsAsToolbar && qm.rootNode.parent ) return; // has parent = subfolder
	
	qm.toolsArray.forEach( tool => tool.classList.remove('singleColumn'));
	
	let position = userOptions.quickMenuToolsPosition;
	
	// set tools position
	if ( userOptions.quickMenuToolsAsToolbar && position !== 'hidden' )
		createToolsBar(qm);
	
	if ( !userOptions.quickMenuToolsAsToolbar ) {
		if ( position === "top")
			qm.toolsArray.forEach( (tool, index) => qm.insertBefore(tool, qm.children.item(index)));
		else if ( position === "bottom" )
			qm.toolsArray.forEach( (tool, index) => qm.appendChild( tool ));
	}

	qm.toolsArray.forEach( tool => {
		if ( qm.singleColumn && !userOptions.quickMenuToolsAsToolbar ) tool.classList.add('singleColumn');
	});
}

function toolBarResize(o) {

	o = o || {}

	if ( window != top ) return;

	let minWidth = 200;
	let maxHeight = 600;
	let maxWidth = 800;

	qm.style.opacity = 0;
	qm.style.height = null;

	let tileSize = qm.getTileSize();

	// less() is glitching the window width to max
	//document.body.style.width = o.less ? document.body.getBoundingClientRect().width + "px" : maxWidth + 'px';
	document.body.style.width = o.less ? document.body.getBoundingClientRect().width + "px" :  tileSize.width * qm.columns + "px";
	document.body.style.maxWidth = null;
	qm.style.width = null;

	qm.insertBreaks();
//	document.body.style.maxWidth = document.body.style.width || qm.getBoundingClientRect().width + "px";
	document.body.style.maxWidth = tileSize.width * qm.columns + "px";
	document.body.style.minWidth = '200px';

	let qmNaturalSize = qm.getBoundingClientRect();

	qm.removeBreaks();
	qm.style.opacity = null;

	qm.style.width = '100%';

	if ( qmNaturalSize.width < maxWidth ) {
		
		//	pad for scrollbars
	//	qm.style.paddingRight = qm.offsetWidth - qm.clientWidth + "px";

		let padding = tileSize.width - tileSize.rectWidth;

		let div_width = 'calc(' + 100 / qm.columns + "% - " + padding + "px)";

		qm.querySelectorAll('DIV.tile:not(.singleColumn)').forEach( div => {
			div.style.transition = 'none';
			div.style.width = div_width;
			div.offsetWidth;
			div.style.transition = null;
		});
	}

	if ( !o.more ) toolsBarMorify(userOptions.searchBarToolbarRows);

	if ( window.innerHeight < document.documentElement.scrollHeight ) {

		let sumHeight = getAllOtherHeights(true);

		qm.style.height = sumHeight + qm.scrollHeight > maxHeight ? maxHeight - sumHeight + "px": null;

		// qm.style.width = `calc(100% - ${qm.offsetWidth - qm.scrollWidth}px)`;
		qm.style.width = `calc(100%)`;
	} else {
		qm.style.height = qm.scrollHeight + "px";
	}

	document.dispatchEvent(new CustomEvent('resizeDone'));
}

var docked = false;

function minifySideBar() {
	document.body.classList.toggle('mini');
	setTimeout(sideBarResize, 500);
}
function unminifySideBar() {
	document.body.classList.remove('mini');
	sideBarResize();
}

async function sideBarResize(o) {
	
	o = o || {};

	if ( window == top ) return;

	// throwing sidebar errors
	// prevent errors before qm loaded
	if ( !qm || !qm.rootNode ) return;

	// remove min-width for single columns
	if (qm.singleColumn) qm.style.minWidth = null;

	document.body.style.width = null;
	document.body.style.height = null;

	// [tb,sbc,mb,ctb,toolBar].forEach( el => { 
	// 	if (el) el.style.display = 'none';
	// });

	// simple resize when mini
	if ( document.body.classList.contains('mini') ) {
		return window.parent.postMessage({
			action:"resizeSideBarIframe", 
			size: {width: sbc.getBoundingClientRect().width, height: sbc.getBoundingClientRect().height + mb.getBoundingClientRect().height}, 
			singleColumn: qm.singleColumn,
			tileSize: qm.getTileSize()
		}, "*");
	}

	qm.insertBreaks();
	
	let maxWindowHeight = screen.height;

	let qm_height = qm.style.height;

	let iframeHeight = o.iframeHeight || ( !docked ? userOptions.sideBar.height : maxWindowHeight );
	
	document.body.style.height = docked ? "100vh" : 'auto';//document.body.style.height;
	
	qm.style.width = null;
	qm.style.height = null;
	qm.style.overflowY = 'auto';

	// hide block groups
	qm.querySelectorAll('group.block').forEach(g => g.style.display = 'none');
	document.documentElement.style.setProperty('--iframe-body-width', qm.getBoundingClientRect().width + "px");	
	qm.querySelectorAll('group.block').forEach(g => g.style.display = null);

	let allOtherElsHeight = getAllOtherHeights(true);

	const setHeight = () => {
		
		if ( docked ) return `calc(100% - ${allOtherElsHeight}px)`;

		if ( o.suggestionsResize ) return qm_height;
				
		// if ( o.more ) return qm.getBoundingClientRect().height + "px";
		
		return Math.min(iframeHeight - allOtherElsHeight, qm.getBoundingClientRect().height) + "px";
	}

	qm.style.width = qm.getBoundingClientRect().width + "px";

	if ( !o.more ) {
		toolsBarMorify(userOptions.sideBarToolbarRows);
	}

	// reset height after tools menu
	qm.style.height = setHeight();

	// account for scrollbars
	let scrollbarWidth = qm.offsetWidth - qm.clientWidth; // account for fractions

	qm.style.width = qm.getBoundingClientRect().width + scrollbarWidth + 4 + "px";

	// apply min-width for subfolders
	if ( !qm.rootNode.parent && userOptions.sideBar.setMinWidth ) qm.setMinWidth();

	//qm.removeBreaks();

	window.parent.postMessage({
		action:"resizeSideBarIframe", 
		size: {width: qm.getBoundingClientRect().width, height: document.body.offsetHeight}, 
		singleColumn: qm.singleColumn,
		tileSize: qm.getTileSize()
	}, "*");
}

function resizeMenu(o) {
	
	if (!qm) return;

	// store scroll position
	let scrollTop = qm.scrollTop;
	let sgScrollTop = sg.scrollTop;

	document.addEventListener('resizeDone', e => {
		qm.scrollTop = scrollTop;
		sg.scrollTop = sgScrollTop;
	}, {once: true});

	toolBarResize(o);
	sideBarResize(o);

//	qm.expandMoreTiles();
	
	qm.scrollTop = scrollTop;
	sg.scrollTop = sgScrollTop;
}

function closeMenuRequest() {
	if ( window == top ) {
		if ( userOptions.searchBarCloseAfterSearch ) window.close();
	} else if ( userOptions.sideBar.closeAfterSearch ) {
		window.parent.postMessage({action: "closeSideBarRequest"}, "*");
	}
}

async function makeAddEngineBar() {

	// place at the end again after qm loads

	let oses = await browser.runtime.sendMessage({action: "getOpenSearchLinks"});

	if ( !oses ) return;

	for ( ose of oses ) {

		try {

			let div = document.createElement('div');
			let img = new Image();
			div.innerText = " ";
			div.style.display = 'none';
			div.insertBefore(img, div.firstChild);
			div.title = i18n("AddCustomSearch");
			aeb.appendChild(div);

			let xml_se = await browser.runtime.sendMessage({action: "openSearchUrlToSearchEngine", url: ose.href}).then( details => {
				return (!details) ? null : details.searchEngines[0];
			});

			if ( !xml_se || findNode( userOptions.nodeTree, _se => _se.type === 'searchEngine' && _se.title === xml_se.title) ) {
				return div.parentNode.removeChild(div);
			}

			img.src = xml_se.icon || browser.runtime.getURL('icons/transparent.gif');

			div.innerText = xml_se.title;

			div.insertBefore(img, div.firstChild);

			let osi = new Image();
			osi.src = 'icons/opensearch.svg';
			div.insertBefore(osi, div.firstChild);

			div.style.display = null;

			div.onclick = async() => {
				return browser.runtime.sendMessage({action: "openCustomSearch", se: xml_se});
			}

			// has openSearch icon
			(() => {
				let img = new Image();
				img.src = 'icons/opensearch.svg';
				img.className = 'opensearchIcon';
				let si = document.getElementById('searchIcon');
				si.parentNode.insertBefore(img, si.nextSibling);

			})();
		} catch (error) { console.log(error) }
	}

	resizeMenu();
}

window.addEventListener('message', e => {

	switch (e.data.action) {
		case "sideBarResize":
			if ( e.data.docked !== undefined ) docked = e.data.docked;
			resizeMenu({iframeHeight: e.data.iframeHeight});
			break;
		
		case "quickMenuIframeLoaded":
			document.dispatchEvent(new CustomEvent('quickMenuIframeLoaded'));
			break;
			
		case "sideBarRebuild":
			qm.columns = e.data.columns;

			qm.insertBreaks();

			qm.style.height = null;
			qm.style.width = null;

			// reset the minWidth for the tilemenu
			qm.setMinWidth();

			toolsHandler();
			
			let rect = document.body.getBoundingClientRect();
			let rect_qm = qm.getBoundingClientRect();

			// send size to parent window for sidebar widget
			window.parent.postMessage({
				action:"resizeSideBarIframe", 
				size: {width: rect_qm.width, height: rect.height}, 
				tileSize: qm.getTileSize(), 
				singleColumn: qm.singleColumn
			}, "*");
			
			break;

		case "minifySideBar":
			minifySideBar();
			break;

		case "editEnd":
			QMtools.find(t => t.name === "edit").action({forceOff: true});
			break;
	}
});

document.getElementById('closeButton').addEventListener('click', e => {

	if ( window != top )
		window.parent.postMessage({action: "closeSideBar"}, "*");
	else
		window.close();
});

addChildDockingListeners(mb, "sideBar", "minimizeButton");

if ( window == top ) {
	document.getElementById('minimizeButton').style.display = "none";
}

document.getElementById('minimizeButton').addEventListener('click', e => {
	window.parent.postMessage({action: "minimizeSideBarRequest"}, "*");
});

document.addEventListener('keydown', e => {
	if ( e.key === 'Escape' ) {
		if ( window != top)
			window.parent.postMessage({action: "minimizeSideBarRequest"}, "*");
	}
});

// prevent page clicks when menu is open
if ( window == top ) {
	window.addEventListener('load', e => sendMessage({action:"disablePageClicks"}));
	window.addEventListener('unload', e => sendMessage({action:"enablePageClicks"}));
}

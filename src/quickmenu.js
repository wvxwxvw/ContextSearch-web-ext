var userOptions = {};

var noMinimumWidth = false;

const getVisibleTiles = el => el.querySelectorAll('.tile:not([data-hidden="true"]):not([data-morehidden="true"])');

async function makeFrameContents(o) {

	document.body.style.transition = 'none';
	document.body.style.opacity = 0;
	document.body.offsetWidth;
	document.body.style.transition = null;

	if ( o.node ) noMinimumWidth = true;

	let qm = await makeQuickMenu(Object.assign({type: "quickmenu", singleColumn: userOptions.quickMenuDefaultView === 'text'}, o));

	let old_qme = document.getElementById('quickMenuElement');
	
	if (old_qme) old_qme.parentNode.removeChild(old_qme);

	document.body.appendChild(qm);
	
	if ( userOptions.quickMenuToolsPosition === 'bottom' && userOptions.quickMenuToolsAsToolbar )	
		document.body.appendChild(toolBar);
	
	if (userOptions.quickMenuSearchBar === 'bottom') 
		document.body.appendChild(sbc);
	
	makeSearchBar();

	if ( userOptions.quickMenuSearchBar === 'hidden')
		sbc.classList.add('hide');

	// hide for qm
	[tb, mb].forEach(el => el.classList.add('hide'));

	// override layout
	setLayoutOrder(o.layout || userOptions.quickMenuDomLayout);

	// get proper sizing for opening position
	setMenuSize();

	document.getElementById('closeButton').addEventListener('click', e => {
		browser.runtime.sendMessage({action: "closeQuickMenuRequest"});
	});

	document.dispatchEvent(new CustomEvent('quickMenuIframePreLoaded'));

	await browser.runtime.sendMessage({
		action: "quickMenuIframeLoaded", 
		size: {
			width: qm.getBoundingClientRect().width,
			height: document.body.getBoundingClientRect().height
		},
		resizeOnly: false,
		tileSize: qm.getTileSize(),
		tileCount: qm.querySelectorAll('.tile:not([data-hidden])').length,
		columns: qm.columns,
		singleColumn: qm.singleColumn
	});

	// setTimeout needed to trigger after updatesearchterms
	setTimeout(() => {				
		if (userOptions.quickMenuSearchBarSelect)
			sb.addEventListener('focus', () => sb.select(), {once:true});

		if (userOptions.quickMenuSearchBarFocus)
			sb.focus();
		
		if (userOptions.quickMenuSearchHotkeys && userOptions.quickMenuSearchHotkeys !== 'noAction' && userOptions.quickMenuFocusOnOpen ) {
			sb.blur();
			qm.focus();
		}
	}, 100);
	
	document.dispatchEvent(new CustomEvent('quickMenuIframeLoaded'));

	// cascading folders
	document.addEventListener('document_click', e => {
		
		if ( e.target.closest && e.target.closest('.tile') ) return;
		
		browser.runtime.sendMessage({ action: "closeAllFolders", sendMessageToTopFrame: true});
	});

	tileSlideInAnimation(.3, .15, .5);
	document.body.style.opacity = null;
}

async function makeFolderContents(node) {

	// disable some unused handlers 
	window.toolsHandler = () => null;
	window.createToolsArray = () => [];

	noMinimumWidth = true;

	setParents(node);

//	let nodeRef = findNode(root, n => n.id === node.id) || node;

	let _singleColumn = node.displayType === "text" || userOptions.quickMenuDefaultView === "text";

	await makeQuickMenu({type: "quickmenu", singleColumn: _singleColumn, node:node});

	// remove everything
	document.querySelectorAll('BODY > DIV').forEach(el => el.parentNode.removeChild(el));

	// setParents(node);

	// let nodeRef = findNode(root, n => n.id === node.id) || node;
	
	// qm = await quickMenuElementFromNodeTree(nodeRef, true);

	// fix layout
	qm.removeBreaks();
	qm.insertBreaks();

	document.body.appendChild(qm);

	document.dispatchEvent(new CustomEvent('updatesearchterms'));

	await browser.runtime.sendMessage({
		action: "quickMenuIframeFolderLoaded", 
		size: {
			width: qm.getBoundingClientRect().width,
			height: document.body.getBoundingClientRect().height,//qm.getBoundingClientRect().height
		},
		resizeOnly: false,
		tileSize: qm.getTileSize(),
		tileCount: qm.querySelectorAll('.tile:not([data-hidden])').length,
		columns: qm.columns,
		singleColumn: qm.singleColumn,
		sendMessageToTopFrame: true,
		folder:JSON.parse(JSON.stringify(node))
	});

	setDraggable();
}

var maxHeight = Number.MAX_SAFE_INTEGER;

function setMenuSize(o) {
	o = o || {};

	maxHeight = o.maxHeight || maxHeight;

	let tileSize = qm.getTileSize();

	document.body.style.setProperty("--user-transition", "none");
	let rows = qm.insertBreaks();

	let currentHeight = qm.style.height || qm.getBoundingClientRect().height + "px" || 0;

	qm.style.minWidth = null;
	qm.style.height = 'auto';
	qm.style.overflow = null;
	qm.style.width = null;
	document.body.style.width = window.outerWidth + "px";
	document.body.style.height = maxHeight + "px";

	// prevent the menu from shriking below minimum columns width
	if ( !qm.singleColumn /*&& qm.columns < userOptions.quickMenuColumnsMinimum*/ && !noMinimumWidth) {
		let minWidth = tileSize.rectWidth * (Math.min(userOptions.quickMenuColumnsMinimum, userOptions.quickMenuColumns)) - (tileSize.width - tileSize.rectWidth) / 2;
		
		if ( qm.getBoundingClientRect().width < minWidth && !isChildWindow() )
			qm.style.minWidth = minWidth + "px";
	}

	document.documentElement.style.setProperty('--iframe-body-width',  qm.getBoundingClientRect().width + "px");
	
	if ( !o.more && !o.move ) {
		toolsBarMorify();

		// qm.querySelectorAll('group').forEach( g => {
		// 	if ( g.style.display != 'block') return;

		// 	let c = g.querySelector('container');
		// 	if ( c ) makeContainerMore(c, 1);
		// })
	}

	//if ( !o.more ) makeContainerMore(toolBar, 1, false);

	let allOtherElsHeight = getAllOtherHeights(true);

	// if ( o.lockResize )
	// 	qm.style.height = currentHeight;
	// else if ( o.suggestionsResize ) 
	// 	qm.style.height = qm.getBoundingClientRect().height + "px";
	// else if ( o.openFolder || o.toggleSingleColumn ) 
	// 	qm.style.height = Math.min( qm.getBoundingClientRect().height, maxHeight - allOtherElsHeight ) + "px"; // site search flex
	// else if ( o.more ) 
	// 	qm.style.height = qm.getBoundingClientRect().height + "px";	
	// else if ( o.widgetResize ) {
	// 	qm.style.height = tileSize.height * o.rows + "px";
	// 	// qm.style.width = tileSize.width * o.columns + "px";
	// }
	// else
	// 	qm.style.height = Math.max( tileSize.height, Math.min(qm.getBoundingClientRect().height, (window.innerHeight || maxHeight) - allOtherElsHeight) ) + "px";

	if ( qm.getBoundingClientRect().height > maxHeight - allOtherElsHeight )
		qm.style.height = Math.ceil(maxHeight - allOtherElsHeight) + "px";

	let scrollbarWidth = qm.offsetWidth - qm.clientWidth; // account for fractions

	qm.style.width = Math.ceil(qm.getBoundingClientRect().width + scrollbarWidth) + "px";

	document.body.style.height = null;
	document.body.style.width = null;

	qm.removeBreaks();

	document.body.style.setProperty("--user-transition", null);

	return rows;
}

function resizeMenu(o) {

	o = o || {};

	let scrollTop = qm.scrollTop;
	let sgScrollTop = sg.scrollTop;
	
	let tileSize = qm.getTileSize();

	window.addEventListener('message', function resizeDoneListener(e) {
		if ( e.data.action && e.data.action === "resizeDone" ) {
			document.dispatchEvent(new CustomEvent('quickMenuIframeLoaded'));
			document.dispatchEvent(new CustomEvent('resizeDone'));
		}
	}, {once: true});

	if ( o.widgetResize) {
		qm.style.width = null;
		qm.style.height = "auto";
		document.documentElement.style.setProperty('--iframe-body-width', qm.getBoundingClientRect().width + "px");
		toolBar.querySelectorAll('[data-hidden]').forEach( unhideTile );
		makeContainerMore(toolBar, userOptions.quickmenuToolbarRows, o.columns);
		return;
	}

	let rows = setMenuSize(o);

	qm.scrollTop = scrollTop;
	sg.scrollTop = sgScrollTop;

	window.parent.postMessage({
		action: "quickMenuResize",
		size: {
			width: qm.getBoundingClientRect().width, 
			height: Math.ceil(document.body.getBoundingClientRect().height) // account for fractions
		},
		singleColumn: qm.singleColumn,
		tileSize: tileSize,
		tileCount: qm.querySelectorAll('.tile:not([data-hidden="true"])').length,
		columns: qm.columns,
		rows: rows,
		windowId: qm.rootNode.id
	}, "*");
}

function closeMenuRequest(e) {

	if ( userOptions.quickMenuCloseOnClick && !quickMenuObject.locked ) {
		browser.runtime.sendMessage({action: "closeQuickMenuRequest", eventType: (e.key === "Escape" ? "esc" : "click_quickmenutile") });
	}
}

function toolsHandler(o) {

	o = o || {};

	let hideEmptyGroups = moreTile => {
		qm.querySelectorAll('GROUP').forEach(g => {
			if ( !getVisibleTiles(g).length ) {
				hideTile(g, moreTile);
			}
		})
	}

	let moreTileID = userOptions.nodeTree.id;
	let moreTile = qm.querySelector(`[data-parentid="${moreTileID}"]`);
	
	if ( moreTile ) moreTile.parentNode.removeChild( moreTile );
	
	if ( ! userOptions.quickMenuToolsAsToolbar && qm.rootNode.parent ) return; // has parent = subfolder
	
	let position = userOptions.quickMenuToolsPosition;
	
	if ( userOptions.quickMenuToolsAsToolbar && position !== 'hidden' )
		createToolsBar(qm);
	
	if ( !userOptions.quickMenuToolsAsToolbar ) {
		qm.toolsArray.forEach( tool => tool.classList.toggle('singleColumn', qm.singleColumn) );
	}

	// unhide tiles hidden by more tile
	qm.querySelectorAll('[data-morehidden]').forEach( tile => {
		if ( tile.moreTile && tile.moreTile.dataset.parentid === moreTileID ) {
			unhideTile(tile);
		}
	});

	// place tools at the beginning before hiding tiles > limit
	if ( !userOptions.quickMenuToolsAsToolbar ) {
		qm.toolsArray.forEach((tool, index) => qm.insertBefore(tool, qm.children.item(index)));
	}

	// hide tools
	if ( !userOptions.quickMenuToolsAsToolbar && position === 'hidden' )
		qm.toolsArray.forEach( _div => qm.removeChild(_div) );

	qm.insertBreaks(o.columns);

	let rows = o.rows || ( qm.singleColumn ? userOptions.quickMenuRowsSingleColumn : userOptions.quickMenuRows );

	let lastBreak = qm.getElementsByTagName('br').item(rows - 1);

	if ( lastBreak ) {

		(() => {

			let visibleElements = [...qm.querySelectorAll('.tile:not([data-hidden="true"]):not([data-morehidden="true"]), BR')].filter( tile => tile.style.display !== 'none' );

			let breakIndex = visibleElements.indexOf(lastBreak);

			let lastVisible;
			for ( let i=breakIndex;i>-1;i--) {
				if ( visibleElements[i].classList.contains('tile')) {
					lastVisible = visibleElements[i];
					break;
				}
			}
			
			qm.removeBreaks();

			let visibleTiles = [...getVisibleTiles(qm)].filter( tile => tile.style.display !== 'none' );

			let index = visibleTiles.indexOf(lastVisible);
			let tileArray = visibleTiles.slice(index + 1, visibleTiles.length);

			tileArray = qm.makeMoreLessFromTiles(tileArray, 1, false, qm, qm.rootNode);

			if ( !tileArray ) return;
			
			moreTile = tileArray.pop();

			if ( !moreTile ) return;

			for ( let i=index + 1;i<visibleTiles.length;i++) {

				let el = visibleTiles[i];

				hideTile(el, moreTile);
				//el.style.backgroundColor = null;
			}

			moreTile.classList.add('quickMenuMore');
			moreTile.classList.remove('tile');
			moreTile.dataset.parentid = moreTileID;

			hideEmptyGroups(moreTile);

		})();
	}

	qm.removeBreaks();

	if ( !userOptions.quickMenuToolsAsToolbar) {
		if ( userOptions.quickMenuToolsPosition === 'bottom' ) 
			qm.toolsArray.forEach(tool => qm.appendChild(tool));
		else if ( userOptions.quickMenuToolsPosition === 'top' )
			qm.toolsArray.forEach((tool, index) => qm.insertBefore(tool, qm.children.item(index)));
	}

	// move moreTile to end
	if ( moreTile ) {
		qm.appendChild(moreTile);

		// moreTile sometimes hidden?
		unhideTile(moreTile);
	}
}

// prevent context menu when using right-hold
function preventContextMenu(e) { if ( e.which === 3 ) e.preventDefault(); }		
document.addEventListener('contextmenu', preventContextMenu);
document.addEventListener('mousedown', function rightMouseDownHandler(e) {
	if ( e.which !== 3 ) return;
	document.removeEventListener('contextmenu', preventContextMenu);
	document.removeEventListener('mousedown', rightMouseDownHandler);
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
	
	if ( message.userOptions ) userOptions = message.userOptions;

	if (typeof message.action !== 'undefined') {
		switch (message.action) {
			case "updateQuickMenuObject":

				quickMenuObject = message.quickMenuObject;

				lazyCompare = (a1, a2) => { return a1.length === a2.length && a1.reduce((a, b) => a && a2.includes(b), true) }

				if ( qm && qm.isConnected && !lazyCompare(quickMenuObject.contexts, qm.contexts) ) {
					(async() => {
						qm = await quickMenuElementFromNodeTree(window.root);
						resizeMenu({openFolder: true});
					})();
				}
				
				// quickMenuObject can update before userOptions. Grab the lastUsed
				userOptions.lastUsedId = quickMenuObject.lastUsed || userOptions.lastUsedId;

				// send event to OpenAsLink tile to enable/disable
				document.dispatchEvent(new CustomEvent('updatesearchterms'));

				break;
				
			case "focusSearchBar":
				if (userOptions.quickMenuSearchBarSelect) {
					sb.addEventListener('focus', () => { 
						setTimeout(() => sb.select(), 100);
					}, {once:true});
				}

				sb.focus();

				break;

			case "rebuildMenus":
				rebuildMenu();
				break;
		}
	}
});

function setLockToolStatus() {
	let tile = document.querySelector(`[data-type="tool"][data-name="lock"]`);
	if ( tile ) tile.dataset.locked = quickMenuObject.locked;
}

// listen for messages from parent window
window.addEventListener('message', async e => {

	switch (e.data.action) {
		case "rebuildQuickMenu": {
			userOptions = e.data.userOptions;	
			qm.columns = qm.singleColumn ? 1 : e.data.columns;

			let o = {widgetResize: true, rows: e.data.rows, columns:e.data.columns};

			toolsHandler(o);
			resizeMenu(o);
			break;
		}
			
		case "resizeMenu":
			resizeMenu(e.data.options);
			break;
			
		case "lock":
			document.body.classList.add('locked');
			resizeMenu({lockResize: true});
			quickMenuObject.locked = true;

			setLockToolStatus();
			break;
			
		case "unlock":
			document.body.classList.remove('locked');
			resizeMenu({lockResize: true});
			quickMenuObject.locked = false;

			setLockToolStatus();
			break;

		case "editEnd":
			QMtools.find(t => t.name === "edit").action({forceOff: true});
			break;

		case "openFolder":
			qm = await quickMenuElementFromNodeTree(e.data.folder || userOptions.nodeTree);
			resizeMenu({openFolder: true});
			break;

		case "openFolderNew":

			userOptions = await browser.runtime.sendMessage({action: "getUserOptions"});

			setTheme()
				.then(setUserStyles)
				.then(() => makeFolderContents(e.data.folder));
			break;

		case "openMenu":
			userOptions = await browser.runtime.sendMessage({action: "getUserOptions"});
		
			setTheme()
				.then(setUserStyles)
				.then(() => makeFrameContents(e.data));
			break;
	}
});

document.addEventListener('keydown', e => {
	if ( e.key === 'Escape' ) closeMenuRequest(e);
});

// prevent docking
document.body.addEventListener('dblclick', e => {
	e.preventDefault();
	e.stopImmediatePropagation();
});

// addChildDockingListeners(mb, "quickMenu");
addChildDockingListeners(mb, "quickMenu", "#searchBarContainer > *");

// drag overdiv listener for chrome
window.addEventListener("message", e => {
	if ( !e.data.drop ) return;
	let el = document.elementFromPoint(e.data.offsetX, e.data.offsetY);

	// dispatch both to fool timer
	el.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
	el.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
});


function resizeMutationObserver() {

	var frameHeight = 0;
	var frameWidth = 0;

	var qmHeight = 0;
	var qmWidth = 0;

	// Callback function to execute when mutations are observed
	const callback = (mutationList, observer) => {
	  for (const mutation of mutationList) {
	     if (mutation.type === 'attributes' && mutation.attributeName === 'style' ) {

	  //   	if ( ![document.body, qm].includes(mutation.target) ) return;
	 //     console.log(`The ${mutation.attributeName} attribute was modified.`);

	      if ( 
	      	frameHeight !== document.body.scrollHeight || 
	      	frameWidth !== qm.scrollWidth ||
	      	qmHeight !== qm.scrollHeight
	      ) {

	      	try {
	    		setMenuSize();
	    	} catch (error) {}

	    	qm.insertBreaks();
	    	qm.style.overflow = 'none';

	      	frameHeight = document.body.scrollHeight;
	      	frameWidth =  qm.scrollWidth;
	      	qmHeight = qm.scrollHeight;

	    	console.log(frameHeight, qmHeight);

	      	window.parent.postMessage({
				action: "quickMenuResize",
				size: {
					width: qm.getBoundingClientRect().width, 
					height: document.body.scrollHeight//Math.ceil(document.body.getBoundingClientRect().height) // account for fractions
				}/*,
				singleColumn: qm.singleColumn,
				tileSize: tileSize,
				tileCount: qm.querySelectorAll('.tile:not([data-hidden="true"])').length,
				columns: qm.columns,
				rows: rows,
				windowId: qm.rootNode.id */
			}, "*");
	      }
	    }
	  }
	};

	// Create an observer instance linked to the callback function
	const observer_body = new MutationObserver(callback);
	const observer_qm = new MutationObserver(callback);

	// Start observing the target node for configured mutations
	observer_body.observe(document.body, { attributes: true, childList: false, subtree: true });
	//observer_qm.observe(qm, { attributes: true, childList: false, subtree: true });

}

//resizeMutationObserver();

// initOptionsBar();

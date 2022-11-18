let current, previous, next, terms;

const nextResultsEngine = () => {
	if ( killswitch ) return;

	browser.runtime.sendMessage({
		action: "search", 
		info: {
			menuItemId: next.id,
			selectionText: terms,
			openMethod: "openCurrentTab"
		}
	});
}

const previousResultsEngine = () => {
	if ( killswitch ) return;
	
	browser.runtime.sendMessage({
		action: "search", 
		info: {
			menuItemId: previous.id,
			selectionText: terms,
			openMethod: "openCurrentTab"
		}
	});
}

(async () => {

	let tt = await browser.runtime.sendMessage({action: "getTabTerms"});

	if ( !tt ) return;

	let folder = findNode(userOptions.nodeTree, n => n.id === tt.folderId);
	let node = findNode(folder, n => n.id === tt.id);

	// if regex match
	if ( node.matchRegex ) {
		folder = matchingEnginesToFolder(tt.searchTerms);
		node = findNode(folder, n => n.id === tt.id);
	}

	let array = [...new Set(folder.children.filter(c => {
		
		if ( !["searchEngine", "oneClickSearchEngine"/*, "bookmarklet", "externalProgram"*/].includes(c.type) ) return false;
		
		// filter multisearch
		try {
			JSON.parse(c.template);
			return false;
		} catch (err) {}

		return true;
	}))];

	var len = array.length;
	var i = array.indexOf(node);

	current = array[i];
	previous = array[(i+len-1)%len];
	next = array[(i+1)%len];

	terms = tt.searchTerms;
})();

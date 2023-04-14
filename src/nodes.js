if ( typeof firefoxSearchEngines === 'undefined' ) {
	browser.runtime.sendMessage({action: "getFirefoxSearchEngines"}).then(result => {
		window.firefoxSearchEngines = result;
	});
}

function findNodes(tree, callback) {
		
	let results = [];
	
	function _traverse(node, parent) {
		
		if ( callback(node, parent) ) results.push(node);
		
		if (node && node.children) {
			for (let child of node.children) {
				_traverse(child, node);
			}
		}
	}
	
	_traverse(tree, null);
	 
	return results;
}

function findNode(tree, callback) {
	
	function _traverse(node, parent) {
		
		if ( callback(node, parent) ) return node;
		
		if (node && node.children) {
			for (let child of node.children) {
				let found = _traverse(child, node);
				if ( found ) return found;
			}
		}
		
		return null;
	}
	
	return _traverse(tree, null);
}

function findNodesDeep(tree, callback) {
		
	let results = [];
	
	function _traverse(node, parent) {
				
		if (node && node.children) {
			for ( let i=node.children.length-1;i>=0;i--)
				_traverse(node.children[i], node);
		}

		if ( callback(node, parent) ) results.push(node);
	}
	
	_traverse(tree, null);
	 
	return results;
}

function traverseNodesDeep(tree, callback) {
			
	function _traverse(node, parent) {
				
		if (node && node.children) {
			for ( let i=node.children.length-1;i>=0;i--)
				_traverse(node.children[i], node);
		}

		callback(node, parent);
	}
	
	_traverse(tree, null);
}

function setParents(tree) {
	
	findNodes( tree, (node, parent) => {
	
		node.toJSON = function() {
			let o = {};
			
			// skip parent property
			Object.keys(this).forEach( key => {
				if (key !== "parent") o[key] = this[key];
				else if ( this[key]) o.parentId = this[key].id;
			}, this);

			return o;
		}
		node.parent = parent;
	  
	});
}

function removeNodesById(tree, id) {
	
	findNodes( tree, (node, parent) => {
		if (node.id == id) removeNode(node, parent);
	});
}

function removeNode(node, parent) {
	parent.children.splice(parent.children.indexOf(node), 1);
}

function repairNodeTree(tree) {
	
	let repaired = false;
	
	let nodesToRemove = findNodes(tree, (node, parent) => {
		
		if ( !node ) {
			node.parent = parent;
			console.log('removing null node');
			return true;
		}

		if ( node.type === 'siteSearchFolder') {
			node.parent = parent;
			delete node.children;
			node.type = "searchEngine";
			console.log('repairing siteSearchFolder ' + node.title);
			return false;
		}
	});
	
	if ( nodesToRemove.length ) repaired = true;
	
	nodesToRemove.forEach( node => removeNode(node, node.parent) );
	
	if ( browser.search && browser.search.get ) {
		
		return browser.search.get().then( ocses => {
			
			let nodesToRemove = findNodes(tree, (node, parent) => {
				
				if ( node.type === 'oneClickSearchEngine' && !ocses.find( ocse => ocse.name === node.title ) ) {
					node.parent = parent;
					console.log('removing dead one-click search engine node ' + node.title);
					return true;
				}
			});
			
			if ( nodesToRemove.length ) repaired = true;
			
			nodesToRemove.forEach( node => removeNode(node, node.parent) );
			
			return Promise.resolve(repaired);
			
		});
	} else {
		return Promise.resolve(repaired);
	}
}

function getIconFromNode(node) {

	if ( node.type === "oneClickSearchEngine") {
		let ocse = window.firefoxSearchEngines.find(ocse => ocse.name === node.title);
		return ocse ? ocse.favIconUrl : browser.runtime.getURL('icons/alert.svg');
	}

	const iconUrl = () => {
	
		if ( node.type === "searchEngine" || node.type === "siteSearch" || node.type === "siteSearchFolder") {
			return node.iconCache || node.icon || browser.runtime.getURL('icons/search.svg');
		} else if ( node.type === "bookmarklet" ) {
			return node.iconCache || node.icon || browser.runtime.getURL('icons/code_color.svg');
		} else if ( node.type === "folder" ) {
			return node.iconCache || node.icon || browser.runtime.getURL('icons/folder-icon.svg');	
		} else if ( node.type === "externalProgram" ) {
			return node.iconCache || node.icon || browser.runtime.getURL('icons/terminal_color.svg');
		} else if ( node.type === "oneClickSearchEngine" ) {

			return node.iconCache || node.icon || browser.runtime.getURL('icons/search.svg');
		} else {
			return node.iconCache || node.icon || browser.runtime.getURL('icons/logo_notext.svg');
		}
	}

	return iconUrl().replace(/http:\/\//, "https://");
}

function nodeCut(node, parent) {
	node.parent = node.parent || parent;
	return node.parent.children.splice(node.parent.children.indexOf(node), 1).shift();
}

function nodeInsertBefore(node, sibling) {	
	sibling.parent.children.splice(sibling.parent.children.indexOf(sibling), 0, node);
	node.parent = sibling.parent;
}

function nodeInsertAfter(node, sibling) {
	node.parent = sibling.parent;
	node.parent.children.splice(node.parent.children.indexOf(sibling) + 1, 0, node);
}

function nodeAppendChild(node, parent) {
	node.parent = parent;
	node.parent.children.push(node);
}

function removeConsecutiveSeparators(tree) {
	// remove consecutive separators
	traverseNodesDeep(tree, (n,p) => {
		if ( !p ) return;

		let index = p.children.indexOf(n);
		if ( n.type === 'separator' && index && p.children[index - 1].type === 'separator' )
			removeNode(n, p);
	});

	return tree;
}

const isFolder = n => n.type === 'folder';
const isSearchEngine = n => n.type === 'searchEngine';
const isOneClickSearchEngine = n => n.type === 'oneClickSearchEngine';
const isMultiSearchEngine = n => {

	if ( !isSearchEngine(n) ) return false;
	
	try {
		let ts = JSON.parse(n.template);
		return true;
	} catch (error) {}

	return false;
}
	

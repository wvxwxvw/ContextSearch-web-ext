const contexts = ["audio", "frame", "image", "link", "page", "selection", "video"]; // [1,2,4,8,16,32,64];

function getContextCode(t) {

	// fix unknown types
	if ( t === "linkText")
		t = "selection";

	let i = contexts.indexOf(t);

	if ( i == -1 ) {
		console.warn("not a context", t);
		return 0;
	}
	return Math.pow(2,i);
}

function contextsArrayToCode(arr) {
	return arr.map(c => getContextCode(c)).reduce( (a,b) => a + b);
}

function hasContext(contextText, contextCode) {

	if ( Array.isArray(contextText) ) 
		return contextText.map(c => hasContext(c, contextCode)).reduce( (a,b) => a || b );

	let code = getContextCode(contextText);
	return ( (contextCode & code ) === code );			
}

function filterContexts(root, context) {

	let filteredNodeTree = JSON.parse(JSON.stringify(root));

	traverseNodesDeep(filteredNodeTree, ( node, parent ) => {

		if ( node.type === 'searchEngine' ) {
			if (!node.contexts || !hasContext(context, node.contexts) )
				return removeNode( node, parent );
		}

		if ( node.contexts && node.type !== 'tool' && !hasContext(context, node.contexts)) {
			return removeNode( node, parent );
		}

		if ( node.type === 'folder' && node.children.length === 0 )
			if ( parent ) return removeNode( node, parent );

		// remove folders with only separators
		if ( node.type === 'folder' && node.children.length === node.children.filter(n => n.type === "separator").length )
			if ( parent ) return removeNode( node, parent );

	});

	// remove consecutive separators
	traverseNodesDeep(filteredNodeTree, (n,p) => {
		if ( !p ) return;

		let index = p.children.indexOf(n);
		if ( n.type === 'separator' && index && p.children[index - 1].type === 'separator' )
			removeNode(n, p);
	});

	return filteredNodeTree;
}
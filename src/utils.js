const i18n = browser.i18n.getMessage;
const sendMessage = browser.runtime.sendMessage;

const debounce = (callback, time, id) => {
  window.clearTimeout(window[id]);
  window[id] = window.setTimeout(callback, time);
}

function runAtTransitionEnd(el, prop, callback, ms) {

	ms = ms || 25;

	if ( Array.isArray(prop)) {
		var remaining = prop.length;
		prop.forEach( _prop => {
			runAtTransitionEnd(el, _prop, () => {
				if ( --remaining === 0 ) callback();
			}, ms);
		});
		return;
	}

	let oldProp = null;
	let checkPropInterval = setInterval(() => {
		try {
			let newProp = window.getComputedStyle(el).getPropertyValue(prop);
			if ( newProp !== oldProp ) {
				oldProp = newProp;
				return;
			}

			clearInterval(checkPropInterval);
			callback();
		} catch (e) {
			clearInterval(checkPropInterval);
		}
		
	}, ms);
}

function recentlyUsedListToFolder() {

	let folder = {
		type: "folder",
		id: "___recent___",
		title: i18n('Recent'),
		children: [],
		parent: (window.qm) ? qm.rootNode : null,
		icon: browser.runtime.getURL('icons/history.svg')
	}

	userOptions.recentlyUsedList.forEach( (id,index) => {
		if ( index > userOptions.recentlyUsedListLength -1 ) return;
		let lse = findNode(userOptions.nodeTree, node => node.id === id);

		// filter missing nodes
		if ( lse ) folder.children.push(Object.assign({}, lse));
	});

	return folder;
}

function matchingEnginesToFolder(s) {

	let folder = {
		type: "folder",
		id: "___matching___",
		title: i18n('regexmatches'),
		children: [],
		parent: (window.qm) ? qm.rootNode : null,
		icon: browser.runtime.getURL('icons/regex.svg'),
		groupFolder: '',
		groupColor: '#88bbdd'
	}

	let matchingEngines = findNodes(userOptions.nodeTree, se => {

		if ( !se.matchRegex ) return false;

		return isMatchingRegex(se.matchRegex, s);

	});

	matchingEngines.forEach( node => {
		folder.children.push(Object.assign({}, node));
	});

	return folder;
}

function runMatchRegex(s, callback) {
	callback = callback || function() {};

	let lines = s.trim().split(/\n/);

	for ( let line of lines ) {

		line = line.trim();

		if ( !line ) continue;

		try { // match regex				
			let m = JSON.parse('[' + line.trim() + ']');
			let rgx = new RegExp(m[0], m[1] || 'g');

			callback( rgx );
			continue;
		} catch (error) {}

		try { // match regex
			let m = /^\/(.*)\/([a-z]+)$/.exec(line.trim());
			let rgx = new RegExp(m[1], m[2] || 'g');

			callback( rgx );
			continue;
		} catch (error) {}

		return false;
	}

	return true;
}

function runReplaceRegex(s, callback) {

	callback = callback || function() {};

	let lines = s.trim().split(/\n/);

	for ( let line of lines ) {

		line = line.trim();

		if ( !line ) continue;

		try { // replace regex					
			let m = JSON.parse('[' + line.trim() + ']');
			let rgx = new RegExp(m[0], m[2] || 'g');

			callback( rgx, m[1] );
			continue;
		} catch (error) {}

		try { // replace regex
			let m = /^\/(.*)(?<!\\)\/(.*)(?<!\\)\/([a-z]+)$/.exec(line.trim());
			let rgx = new RegExp(m[1], m[3] || 'g');

			callback( rgx, m[2].replaceAll("\\/", "/") );
			continue;
		} catch (error) {}

		return false;
	}

	return true;
}

const validateRegex = s => ( runMatchRegex(s) || runReplaceRegex(s) );

function isMatchingRegex(rgxStr, s) {
	let results = false;

	runMatchRegex(rgxStr, rgx => {
		if (rgx.test(s)) results = true;
	});

	return results;
}

function isTextBox(element) {

	return ( element && element.nodeType == 1 && 
		(
			element.nodeName == "TEXTAREA" ||
			(element.nodeName == "INPUT" && /^(?:text|email|number|search|tel|url|password)$/i.test(element.type)) ||
			element.isContentEditable
		)
	) ? true : false;
}

function createMaskIcon(src) {
	let tool = document.createElement('div');
	tool.className = 'tool';
	tool.style.setProperty('--mask-image', `url(${src})`);

	return tool;
}

const i18n_layout_titles = {
	"quickMenuElement": 	'quickmenu',
	"toolBar": 				'tools',
	"menuBar": 				'menubar',
	"titleBar": 			'title',
	"searchBarContainer": 	'search',
	"contextsBar": 			'contexts'
};

async function imageToURI(url) {

	let blob = await fetch(url).then(r => r.blob());
	return await new Promise(resolve => {
		let reader = new FileReader();
		reader.onload = () => resolve(reader.result);
		reader.readAsDataURL(blob);
	});
}

function searchJsonObjectToArray(engines) {
			
	let searchEngines = [];

	// iterate over search engines in search.json.mozlz4
	for (var engine of engines) {

		if ( !engine._urls ) {
			console.warn(`no template for "${engine._name}" ...skipping`);
			continue;
		}
		
		var params_str = "", method = "", params, template = "", searchForm = "", hidden = false;

		// hidden search engines
		if (engine._metaData && engine._metaData.hidden && engine._metaData.hidden == true) hidden = true;
		
		// iterate over urls array
		for (var u=0;u<engine._urls.length;u++) {
			var url = engine._urls[u];
			
			// skip urls with a declared type other than text/html
			if (url.type && url.type != "text/html") continue;
			
			// get request method
			method = url.method || "GET";
			
			// get the main search url
			template = url.template;

			params = url.params;
		}
		
		if (params.length > 0 && method.toUpperCase() === "GET")
			template += ( (template.match(/[=&\?]$/)) ? "" : "?" ) + nameValueArrayToParamString(url.params);

		// push object to array for storage.local
		searchEngines.push({
			"searchForm": engine.__searchForm || "", 
			"icon": engine._iconURL,
			"title": engine._name,
			"order": engine._metaData.order, 
			"iconCache": "", 
			"method": method || "GET", 
			"params": params, 
			"template": template, 
			"queryCharset": engine.queryCharset || "UTF-8", 
			"hidden": hidden,
			"id": gen()
		});
	}
	
	// sort search engine array by order key
	searchEngines = searchEngines.sort(function(a, b){
		if(a.order < b.order) return -1;
		if(a.order > b.order) return 1;
		return 0;
	});

	searchEngines.forEach( se => delete se.order );
	
	return searchEngines;
}


function imageToBase64(image, maxSize) {
	
	function isCanvasBlank(canvas) {
		var blank = document.createElement('canvas');
		blank.width = canvas.width;
		blank.height = canvas.height;

		return canvas.toDataURL() == blank.toDataURL();
	}
	
	let c = document.createElement('canvas');
	let ctx = c.getContext('2d');
	
	ctx.canvas.width = image.naturalWidth || maxSize;
	ctx.canvas.height = image.naturalHeight || maxSize;

	try {

		if ( maxSize && ( image.naturalWidth > maxSize || image.naturalHeight > maxSize ) ) {
			
			let whichIsLarger = (image.naturalWidth > image.naturalHeight) ? image.naturalWidth : image.naturalHeight;
			let scalePercent = maxSize / whichIsLarger;
			
			ctx.canvas.width = image.naturalWidth * scalePercent;
			ctx.canvas.height = image.naturalHeight * scalePercent;
			ctx.scale(scalePercent, scalePercent);
		}
		
		ctx.drawImage(image, 0, 0);
		
		if (isCanvasBlank(c)) {
			console.log('canvas is empty');
			console.log(image.naturalWidth + "x" + image.naturalHeight);
			return "";
		}
		
		return c.toDataURL();
		
	} catch (e) {
		
		console.log(e);
		
		// ctx.drawImage(image, 0, 0);
		
		// return c.toDataURL();
		
		return "";
	} 	
}

function createCustomIcon(options) {
	// https://www.scriptol.com/html5/canvas/rounded-rectangle.php
	function roundRect(x, y, w, h, radius) {
		var r = x + w;
		var b = y + h;
		ctx.beginPath();
		ctx.strokeStyle="green";
		ctx.lineWidth="4";
		ctx.moveTo(x+radius, y);
		ctx.lineTo(r-radius, y);
		ctx.quadraticCurveTo(r, y, r, y+radius);
		ctx.lineTo(r, y+h-radius);
		ctx.quadraticCurveTo(r, b, r-radius, b);
		ctx.lineTo(x+radius, b);
		ctx.quadraticCurveTo(x, b, x, b-radius);
		ctx.lineTo(x, y+radius);
		ctx.quadraticCurveTo(x, y, x+radius, y);
		ctx.closePath();
		ctx.fill();
	}

	var c = document.createElement('canvas');
	var ctx = c.getContext('2d');
	ctx.canvas.width = options.width || userOptions.cacheIconsMaxSize || 32;
	ctx.canvas.height = options.height || userOptions.cacheIconsMaxSize || 32;
	ctx.fillStyle = options.backgroundColor || '#6ec179';
	//ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
	roundRect(0, 0, ctx.canvas.width, ctx.canvas.height, ctx.canvas.width / 3);

	if ( options.image ) {
		
		let img = new Image();
		img.src = options.image;
		
		ctx.drawImage(img, 0, 0, ctx.canvas.width, ctx.canvas.height);
	}

	ctx.font = (options.fontSize || ctx.canvas.height *.8 + "px") + " " + (options.fontFamily || "Georgia");
	ctx.textAlign = 'center';
	ctx.textBaseline="middle"; 
	ctx.fillStyle = options.textColor || "#FFFFFF";
	ctx.fillText(options.text || "",ctx.canvas.width/2,ctx.canvas.height/2);
	
	return c.toDataURL();
}

function loadRemoteIcon(options) {
	
	return new Promise( (resolve,reject) => {
	
		var timeout_start = Date.now();
		var timeout = options.timeout || 15000;
		var searchEngines = options.searchEngines || [];
		
		let details = {
			searchEngines: [],
			hasTimedOut: false,
			hasFailedCount: 0
		}
		
		// when favicons fail, construct a simple image using canvas
	
		var icons = [];
		for (let se of searchEngines) {		
			var img = new Image();
			img.favicon_urls = [];		
			img.favicon_monogram = se.title.charAt(0).toUpperCase();
			var url = "";
			try {
				url = new URL(se.template || se.searchForm || window.location.href);
			} catch ( err ) {}
			// security policy may mean only the favicon may be converted by canvas
			img.favicon_urls = [
				url.origin + "/favicon.ico",
				"https://plus.google.com/_/favicon?domain=" + url.hostname,				
			];

			if (se.icon.startsWith("resource") || se.icon == "") 
				img.src = img.favicon_urls.shift();
			else 
				img.src = se.icon;

			img.onload = function() {
				this.base64String = imageToBase64(this, userOptions.cacheIconsMaxSize);
				
				// image was loaded but canvas was tainted
				if (!this.base64String) {
					img.src = browser.runtime.getURL("icons/search.svg");
					this.onerror();
				}
			};
			
			img.onerror = function() {			
				if (this.favicon_urls.length !== 0) {
					console.log("Failed getting favicon at " + this.src);
					this.src = this.favicon_urls.shift();
					console.log("Trying favicon at " + this.src);
				}
				else {
					this.base64String = createCustomIcon({text: this.favicon_monogram});
					this.failed = true;
				}
			};
			icons.push(img);
		}
		
		var remoteIconsInterval = setInterval(function() {
				
			function onComplete() {
				clearInterval(remoteIconsInterval);
				details.hasFailedCount = getFailedCount();
				details.searchEngines = searchEngines;
				resolve(details);
			}

			function getFailedCount() {
				let c = 0;
				for (let icon of icons) {
					if (typeof icon.failed !== 'undefined') c++;
				}
				return c;
			}
			
			var counter = 0;
			for (let i=0;i<icons.length;i++) {
				if (typeof icons[i].base64String !== 'undefined') {
					searchEngines[i].iconCache = icons[i].base64String;
					counter++;
				}
			}
			
			if (Date.now() - timeout_start > timeout ) {
				details.hasTimedOut = true;
				
				for (let i=0;i<icons.length;i++) {
					if (typeof icons[i].base64String === 'undefined')
						searchEngines[i].iconCache = createCustomIcon({text: icons[i].favicon_monogram});
				}
				onComplete();
			}
			
			if (counter === icons.length) {
				onComplete();
			}
			
		}, 250);
	});

}

function gen() {
	return (Date.now().toString(36) + Math.random().toString(36).substr(2, 5)).toUpperCase();
}

function isDarkMode() {
	return window.matchMedia && !!window.matchMedia('(prefers-color-scheme: dark)').matches;
}

const log = console.log;
var debug = console.log.bind(window.console);


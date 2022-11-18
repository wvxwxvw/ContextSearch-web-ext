let isFirefox = /Firefox/.test(navigator.userAgent);

var userOptions = {};

function formToSearchEngine() {
	
	let form = document.getElementById('customForm');
	return {
		"searchForm": form.searchform.value, 
		"description": form.description.value,
		"icon_url":form.iconURL.value,
		"title":form.shortname.value,
		"icon_base64String": imageToBase64(form.icon, userOptions.cacheIconsMaxSize), 
		"method": form._method.value, 
		"params": paramStringToNameValueArray(form.post_params.value), 
		"template": form.template.value, 
		"queryCharset": form._encoding.value, 
		"hidden": false,
		"id": gen()
		
	};
}

function hasDuplicateName(name) {
	return ( findNode( userOptions.nodeTree, n => n.title == name ) ) ? true : false;
}

function expandElement(el) {
	
	// get by node or id
	el = (el.nodeType) ? el : document.getElementById(el);
	
	if (!el) return;
	
	el.style.zIndex = -1;
	el.style.visibility = 'hidden';
	let transition = window.getComputedStyle(el).transition;
	el.style.transition = 'none';
	el.style.maxHeight = 'none';
	
	let height = window.getComputedStyle(el).height;
	
	el.style.maxHeight = '0px';
	window.getComputedStyle(el).maxHeight;
	el.style.visibility = null;
	el.style.zIndex = null;
	el.style.transition = null;
	el.style.maxHeight = height;
}

function showMenu(el) {
	
	el = (el.nodeType) ? el : document.getElementById(el);

	for (let child of el.parentNode.children)
		child.style.maxHeight = '0px';
	
	expandElement(el);
}

function buildOpenSearchAPIUrl() {
	
	let form = document.getElementById('customForm');
	
	if (!form) return false;
	
	// encode param values before encoding whole string
	let params = paramStringToNameValueArray(form.post_params.value);	
	for (let i=0;i<params.length;i++) {
		params[i].value = encodeURIComponent(params[i].value);
	}	
	let param_str = nameValueArrayToParamString(params);
	
	// build the URL for the API
	return "https://opensearch-api.appspot.com" 
		+ "?SHORTNAME=" + encodeURIComponent(form.shortname.value) 
		+ "&DESCRIPTION=" + encodeURIComponent(form.description.value) 
		+ "&TEMPLATE=" + encodeURIComponent(encodeURI(form.template.value)) 
		+ "&POST_PARAMS=" + encodeURIComponent(param_str) 
		+ "&METHOD=" + form._method.value 
		+ "&ENCODING=" + form._encoding.value 
		+ "&ICON=" + encodeURIComponent(encodeURI(form.iconURL.value)) 
		+ "&ICON_WIDTH=" + (form.icon.naturalWidth || 16) 
		+ "&ICON_HEIGHT=" + (form.icon.naturalHeight || 16) 
		+ "&SEARCHFORM=" + encodeURIComponent(encodeURI(form.searchform.value))
		+ "&VERSION=" + encodeURIComponent(browser.runtime.getManifest().version);
}

function addSearchEnginePopup(data) {

	let se = data.searchEngine || null;
	let openSearchUrl = data.openSearchUrl || null;
	let useOpenSearch = data.useOpenSearch || null;
	let _location = new URL(data.location) || null;
	
	let simple = document.getElementById('simple');
	
	// if page offers an opensearch engine, grab the xml and copy the name into the simple form
	let ose = null;
	
	// no need to request another copy of the opensearch.xml if already using an os engine
	if (useOpenSearch) {
		
		ose = se;
		
		if (se.title) 
			simple.querySelector('input').value = se.title;
		
	} else {
		if (openSearchUrl) {

			browser.runtime.sendMessage({action: "openSearchUrlToSearchEngine", url: openSearchUrl}).then( details => {

				if (!details) {
					console.log('Cannot build search engine from xml. Missing values');
					return false;
				}
			
				let se = details.searchEngines[0];
				ose = se;
				
				if (se.title) 
					simple.querySelector('input').value = se.title;
					
			}, () => {
				console.log('error');
				simple.querySelector('input').value = se.title;
			});

			
		} else 
			simple.querySelector('input').value = se.title;
	}

	//setup buttons
	document.getElementById('a_simple_moreOptions').onclick = function() {

		if (isFirefox /* firefox */ )
			showMenu('CS_customSearchDialogOptions');
		else
			showMenu('customForm');

	}
	
	document.getElementById('a_simple_fewerOptions').onclick = function() {
		showMenu('simple');
	}
	
	document.getElementById('b_simple_add').onclick = function() {

		let el = document.getElementById('simple');
		let input = el.querySelector('input')
		let shortname = input.value;
		
		// check if name exists and alert
		if (hasDuplicateName(shortname)) {
			el.querySelector('label').firstChild.textContent = i18n("NameExists");
			el.querySelector('label').style.color = 'red';
			input.style.borderColor = 'pink';
			return;
		}
		
		if (!shortname.trim()) {
			el.querySelector('label').firstChild.textContent = i18n("NameInvalid");
			el.querySelector('label').style.color = 'red';
			input.style.borderColor = 'pink';
			return;
		}
		
		document.getElementById('customForm').shortname.value = shortname;
		let folder = simple.querySelector('[name="folder"]');

		browser.runtime.sendMessage({action: "addContextSearchEngine", searchEngine: formToSearchEngine(), folderId: folder.value});

		if ( isFirefox /* firefox */) {
			(async() => {
				let exists = await browser.runtime.sendMessage({action: "getFirefoxSearchEngineByName", name: shortname});
				
				if ( exists ) {
					closeCustomSearchIframe();
					return;
				}
				
				// reassign the yes button to add official OpenSearch xml
				document.getElementById('b_simple_import_yes').onclick = function() {

					// build the GET url for opensearch-api.appspot.com
					let url = buildOpenSearchAPIUrl();

					// if using OpenSearch engine and name has not changed, use url to OpenSearch.xml
					// if (useOpenSearch && shortname === ose.title)
					// 	url = openSearchUrl;

					simpleImportHandler(url, true);
				}
				if ( userOptions.askToAddNewEngineToFirefox )
					showMenu('simple_import');
				else
					closeCustomSearchIframe();
			})();
		} else {
			closeCustomSearchIframe();
		}

	}


	let s_folders = document.querySelectorAll('[name="folder"]');

	let folders = findNodes(userOptions.nodeTree, n => n.type === "folder");

	s_folders.forEach( s_folder => {
		folders.forEach(f => {
			let o = document.createElement('option');
			o.value = f.id;
			o.innerText = f.title;

			s_folder.appendChild(o);
		});
	});
	
	function simpleImportHandler(url, _confirm) {
		
		if (!url) return;
		
		let el = document.getElementById('simple_import');
		
		browser.runtime.sendMessage({action: "addSearchEngine", url:url});

		el.style.pointerEvents = 'none';
		el.querySelector('[name="yes"]').querySelector('img').src = '/icons/spinner.svg';
		
		window.addEventListener('focus', () => {
			el.style.pointerEvents = null;
			el.querySelector('[name="yes"]').querySelector('img').src = '/icons/checkmark.svg';
			
			if (_confirm) {

				let simple_confirm = document.getElementById('simple_confirm');
				simple_confirm.querySelector('[name="yes"]').onclick = function() {
					closeCustomSearchIframe();
				}
				
				simple_confirm.querySelector('[name="no"]').onclick = function() {
					
					// remove the new engine
//					browser.runtime.sendMessage({action: "removeContextSearchEngine", id: userOptions.searchEngines[userOptions.searchEngines.length - 1].id});
					
					showMenu('simple_remove');
					setTimeout(() => showMenu('customForm'), 1000);
				}
				
				showMenu(simple_confirm);
				return;
			}
			
			closeCustomSearchIframe();
		}, {once: true});
	}

	document.getElementById('b_simple_import_yes').onclick = function(e) {	
		console.log('default onclick - assign at showMenu');
	}
	
	document.getElementById('b_simple_import_no').onclick = function() {
		closeCustomSearchIframe();
	}
	
	document.getElementById('b_simple_error_yes').onclick = function() {
		showMenu('CS_customSearchDialogOptions');
		
		// hide the simple button to prevent user from attempting to add invalid search engine
		document.getElementById('a_simple_fewerOptions').style.display = 'none';
	}
	
	document.getElementById('b_simple_error_no').onclick = function() {
		closeCustomSearchIframe();
	}

	document.getElementById('askToAddNewEngineToFirefox').addEventListener('change', e => {
		userOptions.askToAddNewEngineToFirefox = !e.target.checked;
		browser.runtime.sendMessage({action: "saveUserOptions", userOptions: userOptions});
	});
	
	let form = document.getElementById('customForm');
	
	// Set method (FORM.method is a default property, using _method)
	for (let i=0;i<form._method.options.length;i++) {
		if (se.method !== undefined && se.method.toUpperCase() === form._method.options[i].value) {
			form._method.selectedIndex = i;
			break;
		}
	}

	// set form fields
	form.description.innerText = se.description;
	form.shortname.value = se.title;
	form.searchform.value = se.searchForm;
	
	let template = se.template;
	
	if (form._method.value === "GET") {
		
		if (!template) form.template.innerText = i18n("TemplateMissingeMessage");
		
		form.template.innerText = se.template;

	} else {
		// POST form.template = form.action
		form.template.innerText = template;
		form.post_params.value = nameValueArrayToParamString(se.params);
		
	}

	// data-type images are invalid, replace with generic favicon.ico
	let favicon_url = (se.icon_url && !se.icon_url.startsWith("data")) ? se.icon_url : new URL(se.template).origin + "/favicon.ico";

	// Listen for updates to iconURL, replace img.src and disable sending OpenSearch.xml request until loaded
	form.iconURL.addEventListener('change', ev => {
		form.icon.src = form.iconURL.value;
		
		form.add.disabled = true;
		var loadingIconInterval = setInterval(() => {
			if (!form.icon.complete) return;
			
			clearInterval(loadingIconInterval);
			form.add.disabled = false;

		},100);
	});

	// get the favicon
	form.icon.src = favicon_url;
	form.iconURL.value = favicon_url;

	// Set encoding field based on document.characterSet
	for (let i=0;i<form._encoding.options.length;i++) {

		if (document.characterSet.toUpperCase() === form._encoding.options[i].value) {
			form._encoding.selectedIndex = i;
			break;
		}
	}

	// Get option buttons and add description widget
	let buttons = document.querySelectorAll(".CS_menuItem > div");
	for (let button of buttons) {
		
		if (!button.dataset.msg) continue;

		// display button description
		button.addEventListener('mouseenter', ev => {
			let desc = button.parentNode.querySelector('.CS_optionDescription');
			desc.style.transition='none';
			desc.style.opacity=window.getComputedStyle(desc).opacity;
			desc.style.opacity=0;
			desc.innerText = button.dataset.msg;
			desc.style.transition=null;
			desc.style.opacity=1;
		});
		
		// hide button description
		button.addEventListener('mouseleave', ev => {
			button.parentNode.querySelector('.CS_optionDescription').style.opacity=0;
		});
	}

	// Set up official add-on if exists	

	if (openSearchUrl && isFirefox /* firefox */) {
		let div = document.getElementById('CS_optionInstallOfficialEngine');
		
		// Add button
		div.onclick = function() {
			
			if (!ose) {
				alert(i18n("ErrorParsing").replace("%1", openSearchUrl));
				return;
			}
			
			if (hasDuplicateName(ose.title)) {
				alert(i18n("EngineExists").replace("%1", ose.title));
				return;
			}

			browser.runtime.sendMessage({action: "addContextSearchEngine", searchEngine: ose}).then( response => {
				console.log(response);
			});
			
			if ( isFirefox /* firefox */ ) {
				// reassign the yes button to add official OpenSearch xml
				document.getElementById('b_simple_import_yes').onclick = function() {
					simpleImportHandler(openSearchUrl);
				}
				
				showMenu('simple_import');
			} else {
				closeCustomSearchIframe();
			}
			
		}
		
		// Show button
		div.style.display=null;
	
	}
	
	if (isFirefox) {
		// Find Plugin listener
		document.getElementById('CS_customSearchDialog_d_mycroftSearchEngine').onclick = function() {
			listenForFocusAndPromptToImport();
			window.open("http://mycroftproject.com/search-engines.html?name=" + _location.hostname, "_blank");
		}
		document.getElementById('CS_customSearchDialog_d_mycroftSearchEngine').style.display = 'inline-block';
		
	}
	
	// Form test
	form.test.onclick = function() {
		testOpenSearch(form);
	}
	
	// Form cancel
	form.cancel.onclick = function() {
		
		if ( isFirefox /* firefox */ )
			showMenu('CS_customSearchDialogOptions');
		else
			showMenu('simple');
	}

	// Form submit
	form.add.onclick = async function(ev) {
		
		// Check bad form values
		if (form.shortname.value.trim() == "") {
			alert(i18n("NameInvalid"));
			return;
		}
		for (let se of findNodes(userOptions.nodeTree, n => n.title === form.shortname.value)) {
			alert(i18n("EngineExists").replace("%1",se.title) + " " + i18n("EnterUniqueName"));
			return;
		}
		if (form.description.value.trim() == "") {
			console.log('no description ... using title');
			form.description.value = "no description for " + form.shortname.value;
			//alert(i18n("DescriptionEmptyError"));
			//return;
		}
		if (form.description.value.length > 1024 ) {
			alert(i18n("DescriptionSizeError"));
			return;
		}
		if (form.post_params.value.indexOf('{searchTerms}') === -1 && form.template.value.indexOf('{searchTerms}') === -1) {
			if ( !confirm(i18n("TemplateIncludeError")))
				return;
		}
		try {
			let _url = new URL(form.template.value);
		} catch (error) {
			if ( !confirm(i18n("TemplateURLError") + ' (' + _location.origin + '...)') )
				return;
		}
		// if (form.template.value.match(/^http/i) === null) {
			// alert(i18n("TemplateURLError") + ' (' + _location.origin + '...)');
			// return;
		// }
		if (!/^http/i.test(form.searchform.value)) {
			if ( !confirm(i18n("FormPathURLError") + ' (' + _location.origin + ')') )
				return;
		}
		if (!/^http/i.test(form.iconURL.value) || form.iconURL.value == "") {
			if ( !confirm(i18n("IconURLError") + ' (' + _location.origin + '/favicon.ico)') )
				return;
		}
		if (typeof form.icon.naturalWidth != "undefined" && form.icon.naturalWidth == 0) {
			if ( !confirm(i18n("IconLoadError") + ' (' + form.iconURL.value + ')') )
				return;
		}

		let se = formToSearchEngine();

		browser.runtime.sendMessage({action: "addContextSearchEngine", searchEngine: se, folderId: form.folder.value}).then( response => {
	//		console.log(response);
		});
		
		if ( isFirefox /* firefox */ ) {
			// reassign the yes button to add form OpenSearch xml
			document.getElementById('b_simple_import_yes').onclick = function() {
				let url = buildOpenSearchAPIUrl();
				simpleImportHandler(url, true);
			}

			let exists = await browser.runtime.sendMessage({action: "getFirefoxSearchEngineByName", name: form.shortname.value});
			
			if ( exists )
				closeCustomSearchIframe();
			else	
				showMenu('simple_import');
			
		} else {
			closeCustomSearchIframe();
		}
	}
	
	// Custom button listener
	document.getElementById('CS_customSearchDialog_d_custom').onclick = function() {
		showMenu(form);
	}

	if (se.template)
		showMenu('simple');
	else
		showMenu('simple_error');
}

function testOpenSearch(form) {

	let params = paramStringToNameValueArray(form.post_params.value);

	let tempSearchEngine = {
		"searchForm": form.searchform.value, 
		// "icon_url": form.iconURL.value,
		// "title": form.shortname.value,
		// "order":"", 
		// "icon_base64String": "", 
		"method": form._method.value, 
		"params": params, 
		"template": form.template.value, 
		"queryCharset": form._encoding.value
	};

	let searchTerms = window.prompt(i18n("EnterSearchTerms"),"ContextSearch web-ext");
	
	browser.runtime.sendMessage({"action": "testSearchEngine", "tempSearchEngine": tempSearchEngine, "searchTerms": searchTerms});
	
}

// Close button listener
function closeCustomSearchIframe() {
	for (let el of document.getElementsByClassName('CS_menuItem')) {
		el.style.maxHeight = '0px';
	}
	setTimeout(() => browser.runtime.sendMessage({action: "closeCustomSearch"}), 250);
}

async function listenForFocusAndPromptToImport() {

	let hasBrowserSearch = await browser.runtime.sendMessage({action: "hasBrowserSearch"});
	
	if (!hasBrowserSearch) {
		console.error("This feature requires Firefox version 63+");
		// close iframe after x milliseconds
		setTimeout(closeCustomSearchIframe, 2000);
		
		return;
	}

	window.addEventListener('focus', async() => {

		// look for new one-click engines
		let newEngineCount = await browser.runtime.sendMessage({action: "checkForOneClickEngines"});
			
		console.log('found ' + newEngineCount + ' new engines');
		
		// do nothing if no engines added
		if ( !newEngineCount ) return;
		
		// show auto notification
		showMenu('CS_notifyAutomaticUpdated');

		let text = document.querySelector('[data-i18n="NewEngineImported"]');
		
		text.innerText = i18n("NewEngineImported", newEngineCount);
			
		// close iframe after x milliseconds
		setTimeout(closeCustomSearchIframe, 2000);

	}, {once: true});

}

// close iframe when clicking anywhere in the window
document.addEventListener('click', e => {
	if ( document.body.contains(e.target) ) return false;	
	closeCustomSearchIframe();
});

// i18n string replacement and styles
document.addEventListener('DOMContentLoaded', () => {

	// Build tooltips
	let info_msg = document.createElement('div');
	info_msg.id = "CS_info_msg";
	document.body.appendChild(info_msg);
	
	for (let info of document.getElementsByClassName('CS_info')) {
		info.addEventListener('mouseenter', e => {
			info_msg.innerText = info.dataset.msg;
			info_msg.style.top = info.getBoundingClientRect().top + window.scrollY + 20 + 'px';
			info_msg.style.left = info.getBoundingClientRect().left + window.scrollX + 20 + 'px';
			info_msg.style.display = 'block';
			info.getBoundingClientRect();
			info_msg.style.opacity = 1;
		});
		
		info.addEventListener('mouseleave', e => {
			info_msg.style.opacity = 0;
			setTimeout(() => info_msg.style.display = 'none', 250);
		});
	}

	function traverse(node) {
		
		if (node.nodeType === 3 && node.nodeValue.trim())
			return node;

		for (let child of node.childNodes) {
			let c = traverse(child);
			if (c) return c;
		}
		
		return false;
	}
	
	let i18ns = document.querySelectorAll('[data-i18n]');
	
	for (let el of i18ns) {

		let textNode = traverse(el);
		
		if (i18n(el.dataset.i18n))
			textNode.nodeValue = i18n(el.dataset.i18n);
	}
	
	let i18n_tooltips = document.querySelectorAll('[data-i18n_tooltip]');
	
	for (let el of i18n_tooltips) {
		el.dataset.msg = i18n(el.dataset.i18n_tooltip + 'Tooltip');
	}
		
	var link = document.createElement( "link" );
	link.href = browser.runtime.getURL('/_locales/' + i18n("LOCALE_FOLDER") + '/style.css');
	link.type = "text/css";
	link.rel = "stylesheet";
	document.getElementsByTagName( "head" )[0].appendChild( link );
	
});

browser.runtime.sendMessage({action: "getUserOptions"}).then( uo => {
	userOptions = uo;
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {

	if (message.userOptions !== undefined) 	
		userOptions = message.userOptions || {};
});

// listen for the custom engine to prompt to add
window.addEventListener("message", async e => {

	// in case message is early
	if ( !userOptions.nodeTree )
		userOptions = await browser.runtime.sendMessage({action: "getUserOptions"});

	if (e.data.action && e.data.action === "promptToSearch") {
		let ok = document.getElementById('b_simple_search_ok');

		ok.onclick = function() {
			browser.runtime.sendMessage({action: "closeCustomSearch"});
		}
		showMenu('simple_search');
	 } else
		addSearchEnginePopup(e.data);
}, {once: true});

// let the parent window know the iframe is loaded
document.addEventListener('DOMContentLoaded', () => {
	window.parent.postMessage({status: "complete"}, "*");
});

// set zoom attribute to be used for scaling objects
function setZoomProperty() {
	document.documentElement.style.setProperty('--cs-zoom', window.devicePixelRatio);
}

setZoomProperty();
document.addEventListener('zoom', setZoomProperty);

// not jQuery 
var $ = s => document.getElementById(s) || document.querySelector(s);

// array for storage.local
var userOptions = {};

var userOptionsHasUpdated = false;

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if ( message.userOptions && message.source && message.source.url != browser.runtime.getURL(window.location.href)) {
		userOptions = message.userOptions;
	}
});

// Browse button for manual import
$("#selectMozlz4FileButton").addEventListener('change', ev => {
	
	let searchEngines = [];
	let file = ev.target.files[0];
	
	if ( $('#cb_overwriteOnImport').checked && confirm(i18n("ConfirmDeleteCustomSearchEngines")) ) {
		userOptions.nodeTree.children = [];
	}
	
	readMozlz4File(file, text => { // on success

		// parse the mozlz4 JSON into an object
		var engines = JSON.parse(text).engines;	
		searchEngines = searchJsonObjectToArray(engines);

		$('#status_div').style.display='inline-block';
		statusMessage({
			img: browser.runtime.getURL("icons/spinner.svg"),
			msg: i18n("LoadingRemoteContent"),
			color: "transparent",
			invert: false
		});

		let newEngines = [];
		
		for (let se of searchEngines) {

			se.type = "searchEngine";
			se.contexts = 32; // selection
			
			if (!findNode(userOptions.nodeTree,  n => n.type === 'searchEngine' && n.title === se.title)) {
				console.log(se.title + " not included in nodeTree");
				
				// add to searchEngines
				newEngines.push(se);
				
				// replace one-click nodes with same name
				let ocn = findNodes(userOptions.nodeTree, (_node, parent) => {
					if ( _node.type === 'oneClickSearchEngine' && _node.title === se.title ) {
						parent.children.splice(parent.children.indexOf(_node), 1, se);
						return true;
					}
					return false;
				});
				
				// if at least one OCSE was found
				if ( ocn.length ) {
					console.log(se.title + " one-click engine found. Replacing node");
				} else {
					// add to nodeTree
					userOptions.nodeTree.children.push(se);
				}
				
			}
		}
		
		// get remote icons for new engines
		loadRemoteIcon({
			searchEngines: newEngines,
		}).then( (details) => {

			saveOptions();
			
			if (details.hasFailedCount) {
				statusMessage({
					img: "icons/alert.svg",
					msg: i18n("LoadingRemoteContentFail").replace("%1", details.hasFailedCount),
					color: "transparent",
					invert: false
				});
			} else if (details.hasTimedOut) {
				statusMessage({
					img: "icons/alert.svg",
					msg: i18n("LoadingRemoteContentTimeout"),
					color: "transparent",
					invert: false
				});
			} else {
				statusMessage({
					img: "icons/checkmark.svg",
					msg: i18n("ImportedEngines").replace("%1", searchEngines.length).replace("%2", details.searchEngines.length),
					color: "#41ad49",
					invert: true
				});
			}

			buildSearchEngineContainer();
		});

	}, function() { // on fail

		// print status message to Options page
		statusMessage({
			img: "icons/crossmark.svg",
			msg: i18n("FailedToLoad"),
			color: "red",
			invert: true
		});
	});

});

function statusMessage(status) {				
	$('#status_img').src = status.img || "";
	$('#status').innerText = status.msg || "";
	
	let img = $('#status_img');
	
	img.parentNode.style.backgroundColor = status.color;
	img.style.filter = status.invert ? 'invert(1)' : 'none';
	img.style.height = "20px";

}

async function restoreOptions(restoreUserOptions) {

	if ( restoreUserOptions ) return onGot(restoreUserOptions);

	function onGot(uo) {

		userOptions = uo;

		function traverse(o, parentKey) {
			for ( let key in o) {

				// skip nodeTree object
				if ( o[key] === userOptions.nodeTree ) continue;

				let longKey = ( parentKey ) ? parentKey + "." + key : key;

				let defaultValue = longKey.split('.').reduce((a, b) => a[b], defaultUserOptions);

				let type = typeof defaultValue;

				// log old/bad keys
				if ( type === 'undefined' )
					debug('unrecognized key', longKey);

				// compare key types to defaults and reset if bad match
				if ( typeof defaultValue !== 'undefined' && typeof o[key] !== typeof defaultValue ) {	
					console.warn('type does not match default, resetting\n', `${longKey} = ${o[key]} -> ${longKey} = ${defaultValue}`);
					o[key] = defaultValue;
				}

				if ( type === 'object' && !Array.isArray(o[key]) )
					traverse(o[key], longKey);

				let el = document.getElementById(longKey);

				if ( !el ) continue;

				if ( type === 'boolean') {
					if ( el.nodeName === "SELECT" )
						el.value = o[key];
					else
						el.checked = o[key];
				}

				if ( type === 'string' || type === 'number' )
					el.value = o[key];	
			}
		}

		// restore settings with matching ids
		traverse(uo, null);
		
		$('#quickMenuKey').innerText = keyCodeToString(uo.quickMenuKey) || i18n('ClickToSet');
		$('#contextMenuKey').innerText = keyCodeToString(uo.contextMenuKey) || i18n('ClickToSet');

		for (let p of document.getElementsByClassName('position')) {
			p.classList.remove('active')
			if (p.dataset.position === uo.quickMenuPosition)
				p.classList.add('active');
		}

		$('#s_sideBarDefaultView').value = uo.sideBar.singleColumn ? "text" : "grid";
		
		$('#userStyles').disabled = !uo.userStylesEnabled;
	
		$('#c_highLightColor0').value = uo.highLight.styles[0].color;
		$('#c_highLightBackground0').value = uo.highLight.styles[0].background;
		$('#c_highLightColor1').value = uo.highLight.styles[1].color;
		$('#c_highLightBackground1').value = uo.highLight.styles[1].background;
		$('#c_highLightColor2').value = uo.highLight.styles[2].color;
		$('#c_highLightBackground2').value = uo.highLight.styles[2].background;
		$('#c_highLightColor3').value = uo.highLight.styles[3].color;
		$('#c_highLightBackground3').value = uo.highLight.styles[3].background;
		$('#c_highLightColorActive').value = uo.highLight.activeStyle.color;
		$('#c_highLightBackgroundActive').value = uo.highLight.activeStyle.background;
		$('#s_highLightOpacity').value = uo.highLight.opacity;

		$('#style_dark').disabled = !uo.nightMode;

		$('#cb_quickMenuToolsLockPersist').checked = (() => {
			let tool = uo.quickMenuTools.find( t => t.name === "lock"); 
			return (tool) ? tool.persist || false : false;
		})();

		$('#cb_quickMenuToolsRepeatSearchPersist').checked = (() => {
			let tool = uo.quickMenuTools.find( t => t.name === "repeatsearch"); 
			return (tool) ? tool.persist || false : false;
		})();

		$('#blockList').value = uo.blockList.filter(el => el.trim()).join('\n');
		
		(() => {
			[
				{	id: "quickMenuIconForm", uri: uo.quickMenuIcon.url }, // quickMenu icon
				{	id: "toolBarIconForm", uri: uo.searchBarIcon } // toolBar icon
			].forEach( o => {

				let f = $(o.id);

				let radios = f.querySelectorAll(`input[type="radio"]`);
				let radio = [...radios].find( r => r.value === o.uri );
				if ( radio ) radio.checked = true;
				else setIconOption(f, o.uri);
			})
		})();

		function toggleDomElement(dom_str, el_str, on) {
			let els = dom_str.split(",");
			let i_on = els.indexOf(el_str);
			let i_off = els.indexOf("!" + el_str);

			let index = i_on !== -1 ? i_on : i_off;

			if ( index === -1 ) 
				els.push( on ? el_str : "!" + el_str);
			else
				els[index] = on ? el_str : "!" + el_str;

			return els.join(",");
		}

		// set up layout toggles
		(() => {
			let els = uo.quickMenuDomLayout.split(",");
			$("#quickMenuContextualLayoutToolbar").checked = els.includes("contextsBar") || !els.includes("!contextsBar");
			$("#quickMenuContextualLayoutToolbar").addEventListener('change', e => {
				userOptions.quickMenuDomLayout = toggleDomElement(userOptions.quickMenuDomLayout, "contextsBar", e.target.checked);
			})
		})();

		// allow context menu on right-click
		(() => {
			function onChange(e) {
				document.querySelector('[data-i18n="HoldForContextMenu"]').style.display = ( $('#quickMenuMouseButton').value === "3" && $('#quickMenuOnMouseMethod').value === "click" ) ? null : 'none';
				$('quickMenuMoveContextMenuMethod').parentNode.style.display = $('quickMenuMouseButton').value === "3" ? null : 'none';
			}
			
			[$('#quickMenuMouseButton'), $('#quickMenuOnMouseMethod')].forEach( s => {
				s.addEventListener('change', onChange);	
				onChange();
			});
		})();

		document.dispatchEvent(new CustomEvent('userOptionsLoaded'));
	}
  
	async function onError(error) {
		console.log(`Error: ${error}`);

		if ( confirm(i18n("confirmRestoreOldConfig")) ) {
			document.querySelector('[data-tabid="backupTab"]').click();
		}
	}

	if ( await browser.runtime.sendMessage({action: "checkForOneClickEngines"}) ) {
		firefoxSearchEngines = await browser.runtime.sendMessage({action: "getFirefoxSearchEngines"});
	}
	return browser.runtime.sendMessage({action: "getUserOptions"}).then(onGot, onError);
}

function saveOptions(e) {
	debounce(_saveOptions, 250, "saveOptionsDebouncer");
}

function _saveOptions(e) {
	
	function onSet() {
		browser.browserAction.setIcon({path: userOptions.searchBarIcon || 'icons/logo_notext.svg'});
		showSaveMessage(i18n("saved"), null, document.getElementById('saveNoticeDiv'));
		$('configSize').innerText = Math.ceil(JSON.stringify(userOptions).length / 1024) + " KBs";
		document.dispatchEvent(new CustomEvent('userOptionsSaved'));
		return Promise.resolve(true);
	}
	
	function onError(error) {
		console.log(`Error: ${error}`);
	}

	function traverse(o, parentKey) {
		for ( let key in o) {

			let longKey = ( parentKey ) ? parentKey + "." + key : key;

			let type = typeof o[key];

			if ( type === 'object' && !Array.isArray(o[key]) )
				traverse(o[key], longKey);

			let el = document.getElementById(longKey);

			if ( !el ) continue;

			if ( type === 'boolean') {
				if ( el.nodeName === "SELECT")
					o[key] = el.value.toLowerCase() === 'true';
				else
					o[key] = el.checked;
			}

			if ( type === 'string' )
				o[key] = el.value;	

			if ( type === 'number' ) {
				let i = parseInt(el.value);
				let f = parseFloat(el.value);

				o[key] = i == f ? i : f;
			}
		}
	}

	// restore settings with matching ids
	traverse(userOptions, null);

	let uo = {

		searchBarHistory: userOptions.searchBarHistory,
		searchBarIcon: $('#toolBarIconForm input[type="radio"]:checked').value,
		quickMenuIcon: {
			url: $('#quickMenuIconForm input[type="radio"]:checked').value
		},
		
		sideBar: {
			singleColumn:$('#s_sideBarDefaultView').value === "text",
			hotkey: []
		},
		
		highLight: {
			opacity: parseFloat($('#s_highLightOpacity').value),
			
			styles: [
				{	
					color: $('#c_highLightColor0').value,
					background: $('#c_highLightBackground0').value
				},
				{	
					color: $('#c_highLightColor1').value,
					background: $('#c_highLightBackground1').value
				},
				{	
					color: $('#c_highLightColor2').value,
					background: $('#c_highLightBackground2').value
				},
				{	
					color: $('#c_highLightColor3').value,
					background: $('#c_highLightBackground3').value
				}
			],
			activeStyle: {
				color: $('#c_highLightColorActive').value,
				background: $('#c_highLightBackgroundActive').value
			}

		},

		userStylesGlobal: (() => {
			
			let styleText = "";

			let styleEl = document.createElement('style');

			document.head.appendChild(styleEl);

			styleEl.innerText = $('#userStyles').value;
			styleEl.sheet.disabled = true;

			let sheet = styleEl.sheet;
			
			if ( !sheet ) return;

			for ( let i in sheet.cssRules ) {
				let rule = sheet.cssRules[i];
				
				if ( /^[\.|#]CS_/.test(rule.selectorText) )
					styleText+=rule.cssText + "\n";
			}
		
			styleEl.parentNode.removeChild(styleEl);
			
			return styleText;
		})()

	};

	merge(uo, userOptions);

	// set prefs that don't merge properly
	userOptions.blockList = $('#blockList').value.split(/\r?\n/);
	userOptions.customSearchActions = (() => {
		let cas = [];

		$("additionalSearchActionsTable").querySelectorAll("TR:not(.template):not(.header)").forEach( tr => {
			cas.push(additionalSearchActionFromRow(tr));
		});

		return cas;
	})();

	// prevent DeadObjects
	var setting = browser.runtime.sendMessage({action: "saveUserOptions", userOptions: JSON.parse(JSON.stringify(userOptions))});
	return setting.then(onSet, onError);
}

function merge(source, target) {
  for (const [key, val] of Object.entries(source)) {
    if (val !== null && typeof val === `object`) {
      if (target[key] === undefined) {
        target[key] = new val.__proto__.constructor();
      }
      merge(val, target[key]);
    } else {
      target[key] = val;
    }
  }
  return target;
}

document.addEventListener("DOMContentLoaded", async e => {

	// build the DOM
	makeTabs();
	buildPositionWidget();
	setVersion();
	buildAdvancedOptions();
	buildImportExportButtons();
	buildLocaleStrings();
	//buildHelpTab();
	buildClearSearchHistory();
	buildSaveButtons();
	buildThemes();
	buildSearchActions();
	buildCheckboxes();
	buildToolMasks();
	//buildLayoutEditors();
	hideBrowserSpecificElements();

	// (() => {

	// 	document.querySelectorAll('.tabcontent').forEach( tab => {

	// 		if ( !tab.id) {
	// 			console.log(tab);
	// 			return;
	// 		}
	// 		let headers = tab.querySelectorAll('section > .header1');
	// 		let header_labels = [...headers].map(h => i18n(h.dataset.i18n));

	// 		let button = document.querySelector(`button[data-tabid="${tab.id}"]`);

	// 		headers.forEach(h => {
	// 			let div = document.createElement('button');
	// 			div.className = "tablinks";
	// 			div.classList.add('sublink')
	// 			div.dataset.i18n = h.dataset.i18n;
	// 			div.innerText = h.dataset.i18n;

	// 			if ( button )
	// 				button.parentNode.insertBefore(div, button.nextSibling);
	// 		})
			
	// 	});
	// })();

	// restore settings and set INPUT values
	await restoreOptions();

	// build DOM objects requiring prefs restored
	buildShortcutTable();
	buildSearchEngineContainer();
	buildToolsBarIcons();
	sortAdvancedOptions();
	buildAdditionalSearchActionsTable();
	setAutoDarkMode();

	addDOMListeners();

	hashChange();
	buildUploadOnHash();

	// showBackupDates
	(async() => {
		let b_version = document.querySelector('#backupTab [name="versionBackup"]');
		let b_session = document.querySelector('#backupTab [name="sessionBackup"]');

		let uos = await browser.runtime.sendMessage({action: "getSessionBackup"});
		if ( !uos ) 
			b_session.disabled = true;
		else
			$	('date_sessionBackup').innerText = new Date(uos.lastUpdated);

		let uob = await browser.storage.local.get("userOptionsBackup").then(result => result.userOptionsBackup);
		if ( !uob )
			b_version.disabled = true;
		else
			$('date_versionBackup').innerText = new Date(uob.lastUpdated);

		b_session.onclick = () => {
			if ( confirm(i18n("ConfirmReplaceConfig")) ) saveAndReload(uos);
		}

		b_version.onclick = () => {
			if ( confirm(i18n("ConfirmReplaceConfig")) ) saveAndReload(uob);
		}
	})();

	document.body.style.opacity = 1;
});

function addDOMListeners() {

	// $('#autoPasteFromClipboard').addEventListener('change', async (e) => {
		
	// 	if ( e.target.checked === true ) {
	// 		e.target.checked = await browser.permissions.request({permissions: ["clipboardRead"]});
	// 		saveOptions();
	// 	}
	// });

	$('#autoCopy').addEventListener('change', async (e) => {
		if ( e.target.checked === true ) {
			e.target.checked = await browser.permissions.request({permissions: ["clipboardWrite"]});
			saveOptions();
		}
	});

	["quickMenuScale", "sideBar.scale", "findBar.scale", "quickMenuIconScale"].forEach( id => {
		$(id).addEventListener('input', ev => {
			$(`i_${id}`).value = (parseFloat(ev.target.value) * 100).toFixed(0) + "%";
		});

		$(id).dispatchEvent(new Event('input'));
	});

	$('#userStylesEnabled').addEventListener('change', e => {
		$('#userStyles').disabled = ! e.target.checked;
	});

	$('#quickMenuKey').addEventListener('click', keyButtonListener);
	$('#contextMenuKey').addEventListener('click', keyButtonListener);

	$('#syncWithFirefoxSearch').addEventListener('change', e => {
		$('#searchEnginesParentContainer').style.display = e.target.checked ? "none" : null;
		$('#selectMozlz4FileButton').closest('section').style.display = e.target.checked ? "none" : null;
	});

	$('#b_requestClipboardWritePermissions').addEventListener('click', async () => {
		await browser.permissions.request({permissions: ['clipboardWrite']});
		window.close();
	})

	$('#b_requestClipboardReadPermissions').addEventListener('click', async () => {
		await browser.permissions.request({permissions: ['clipboardRead']});
		window.close();
	})

	$('#b_requestDownloadsPermissions').addEventListener('click', async () => {
		await browser.permissions.request({permissions: ['downloads']});
		window.close();
	})

	$('#b_requestNativeMessagingPermissions').addEventListener('click', async () => {
		await browser.permissions.request({permissions: ['nativeMessaging']});
		window.close();
	})

	document.querySelectorAll('.updateNativeApp').forEach(el => el.addEventListener('click', checkAndUpdateNativeApp));

	// hide other request buttons
	$('[data-tabid="requestPermissionsTab"]').addEventListener('click', async () => {
		const urlParams = new URLSearchParams(window.location.search);
		if ( urlParams.get("permission")) {
			document.querySelectorAll('[data-permission]').forEach( div => {
				if ( div.dataset.permission !== urlParams.get("permission"))
					div.style.display = 'none';
			})
		}
	})

	//$('syncToCloud').addEventListener('click', syncTest);
}

document.addEventListener('userOptionsLoaded', e => {
	$('#searchEnginesParentContainer').style.display = $('#syncWithFirefoxSearch').checked ? "none" : null;
	$('#selectMozlz4FileButton').closest('section').style.display = $('#syncWithFirefoxSearch').checked ? "none" : null;
});

function keyButtonListener(e) {
	e.target.innerText = '';
	var img = document.createElement('img');
	img.src = 'icons/spinner.svg';
	e.target.appendChild(img);
	e.target.addEventListener('keydown', function(evv) {
	
		if ( evv.key === "Escape" ) {
			e.target.innerText = i18n('ClickToSet');
			e.target.value = 0;
		} else {
			e.target.innerText = keyCodeToString(evv.which);
			e.target.value = evv.which;
		}
		
		saveOptions(e);
		
		}, {once: true} // parameter to run once, then delete
	); 
}

function fixNumberInput(el, _default, _min, _max) {

	if (isNaN(el.value) || el.value === "") el.value = _default;
	if (!el.value.isInteger) el.value = Math.floor(el.value);
	if (el.value > _max) el.value = _max;
	if (el.value < _min) el.value = _min;
}

function getKeyString(keys) {
	if ( Array.isArray(keys) ) {
		keys.forEach((key, index) => {
			keys[index] = keyCodeToString(key);
		});
		
		console.log(keys);
	} else {
	}
}

function keyCodeToString(code) {
	if ( code === 0 ) return null;
	
	return keyTable[code] /*|| String.fromCharCode(code)*/ || code.toString();
}

function keyArrayToButtons(arr, options) {

	options = options || {}
	
	let div = document.createElement('div');
	
	function makeButton(str) {
		let span = document.createElement(options.nodeType || 'span');
		span.innerText = str;
		span.className = options.className || null;
		span.style = options.style || null;
		return span;
	}
	
	if ( Array.isArray(arr) ) {
	
		if (arr.length === 0) {
			div.innerText = 'text' in options ? options.text : i18n('ClickToSet') || "Click to set";
		}
		
		for (let i=0;i<arr.length;i++) {

			let hk = arr[i]
			let key = keyCodeToString(hk);
			if (key.length === 1) key = key.toUpperCase();
			
			div.appendChild(makeButton(key));
		}
	} else if ( typeof arr === 'object' ) {
		if ( arr.alt ) div.appendChild(makeButton("Alt"));
		if ( arr.ctrl ) div.appendChild(makeButton("Ctrl"));
		if ( arr.meta ) div.appendChild(makeButton("Meta"));
		if ( arr.shift ) div.appendChild(makeButton("Shift"));
		
		div.appendChild(makeButton(arr.key));
	} else {
		console.error('keyCodeToString error')
		return;
	}
	
	let buttons = div.querySelectorAll(options.nodeType || 'span');
	for ( let i=1;i<buttons.length;i++ ) {
		let spacer = document.createElement('span');
		spacer.innerHTML = '&nbsp;+&nbsp;';
		div.insertBefore(spacer, buttons[i]);
	}
	
	return div;
}

window.addEventListener('hashchange', hashChange);
	
// switch to tab based on params
function hashChange(e) {	

	let hash = location.hash.split("#");
	
	let buttons = document.querySelectorAll('.tablinks');
	
	// no hash, click first button
	if ( !hash || !hash[1] ) {
		buttons[0].click();
		return;
	}
	
	for ( button of buttons ) {
		if ( !button.dataset.tabid ) {
			console.log(button);
			continue;
		}
		if ( button.dataset.tabid.toLowerCase() === (hash[1] + "tab").toLowerCase() ) {
			button.click();
			break;
		}
	}
}

function makeTabs() {
	
	let tabs = document.getElementsByClassName("tablinks");
	for (let tab of tabs) {
		tab.addEventListener('click', e => {

			document.querySelectorAll('.tabcontent').forEach( el => {
				el.style.display = "none";
			});
				
			// Get all elements with class="tablinks" and remove the class "active"
			for (let tablink of document.getElementsByClassName("tablinks"))
				tablink.classList.remove('active');

			// Show the current tab, and add an "active" class to the button that opened the tab
			document.getElementById(e.target.dataset.tabid).style.display = "block";
			e.currentTarget.classList.add('active');
			
			location.hash = e.target.dataset.tabid.toLowerCase().replace(/tab$/,"");
		});
	}
}

function buildToolsBarIcons() {

	function getToolIconIndex(element) {
		return [].indexOf.call(document.querySelectorAll('.toolIcon'), element);
	}
	function dragstart_handler(ev) {
		ev.currentTarget.style.border = "dashed transparent";
		ev.dataTransfer.setData("text", getToolIconIndex(ev.target));
		ev.effectAllowed = "copyMove";
	}
	function dragover_handler(ev) {
		for (let icon of document.getElementsByClassName('toolIcon'))
			icon.style.backgroundColor='';
		
		ev.target.style.backgroundColor='#ddd';
		ev.preventDefault();
	}
	function drop_handler(ev) {
		ev.preventDefault();
		
		ev.target.style.border = '';
		ev.target.style.backgroundColor = '';
		let old_index = ev.dataTransfer.getData("text");
		let new_index = getToolIconIndex(ev.target);

		ev.target.parentNode.insertBefore(document.getElementsByClassName('toolIcon')[old_index], (new_index > old_index) ? ev.target.nextSibling : ev.target);
	}
	function dragend_handler(ev) {
		ev.target.style.border = '';
		saveQuickMenuTools();
	}
	function saveQuickMenuTools() {
		let tool_buttons = document.querySelectorAll('#toolIcons .toolIcon');

		userOptions.quickMenuTools = [];

		tool_buttons.forEach(b => {
			let tool = { name: b.name, disabled: b.disabled};

			if ( b.name === "lock" ) tool.persist = $('#cb_quickMenuToolsLockPersist').checked;
			if ( b.name === "repeatsearch" ) tool.persist = $('#cb_quickMenuToolsRepeatSearchPersist').checked;

			userOptions.quickMenuTools.push(JSON.parse(JSON.stringify(tool)));
		});

		saveOptions();
	}
	
	var toolIcons = [];
	
	QMtools.forEach( tool => {
		toolIcons.push({name: tool.name, src: tool.icon, title: tool.title, index: Number.MAX_VALUE, disabled: true});
	});

	toolIcons.forEach( toolIcon => {
		toolIcon.index = userOptions.quickMenuTools.findIndex( tool => tool.name === toolIcon.name );

		if (toolIcon.index === -1) {
			userOptions.quickMenuTools.push({name: toolIcon.name, disabled: true});
			toolIcon.index = userOptions.quickMenuTools.length -1;
		}
		toolIcon.disabled = userOptions.quickMenuTools[toolIcon.index].disabled;
	});

	toolIcons = toolIcons.sort(function(a, b) {
		return (a.index < b.index) ? -1 : 1;
	});

	for (let icon of toolIcons) {

		let img = createMaskIcon(icon.src);
		img.disabled = icon.disabled;
		img.style.opacity = (img.disabled) ? .4 : 1;
		img.classList.add('toolIcon');
		img.setAttribute('draggable', true);
		img.setAttribute('data-title',icon.title);
		img.name = icon.name;

		img.addEventListener('dragstart',dragstart_handler);
		img.addEventListener('dragend',dragend_handler);
		img.addEventListener('drop',drop_handler);
		img.addEventListener('dragover',dragover_handler);

		img.addEventListener('click',e => {
			img.disabled = img.disabled || false;
			img.style.opacity = img.disabled ? 1 : .4;
			img.disabled = !img.disabled;
			saveQuickMenuTools();	
		});
		
		let t_toolIcons = $('#t_toolIcons');
		img.addEventListener('mouseover', e => {
			t_toolIcons.innerText = e.target.dataset.title;
		});
		
		img.addEventListener('mouseout', e => {
			t_toolIcons.innerText = i18n(t_toolIcons.dataset.i18n);
		});

		$('#toolIcons').appendChild(img);
	}
}

function buildPositionWidget() {
	for (let el of document.getElementsByClassName('position')) {
		el.addEventListener('click', e => {
			for (let _el of document.getElementsByClassName('position'))
				_el.className = _el.className.replace(' active', '');
			el.className+=' active';
			$('#quickMenuPosition').value = el.dataset.position;
			saveOptions();
		});
		
		let t_position = $('#t_position');
		el.addEventListener('mouseover', e => {
			let parts = e.target.dataset.position.split(" ");
			t_position.innerText = i18n("PositionRelativeToCursor").replace("%1", i18n(parts[0])).replace("%2",i18n(parts[1]));
		});
		
		el.addEventListener('mouseout', e => {
			t_position.innerText = i18n(t_position.dataset.i18n);
		});
		
	}
	
}

function setVersion() {
	$('#version').innerText = "" + browser.runtime.getManifest().version;
}

// browser-specific modifications
function hideBrowserSpecificElements() {
	if (!browser.runtime.getBrowserInfo) {
		for (let el of document.querySelectorAll('[data-browser="firefox"]'))
			el.style.display = 'none';
	} else {
		browser.runtime.getBrowserInfo().then( info => {
			let version = info.version;
			document.querySelectorAll('[data-browser="firefox"][data-minversion]').forEach( el => {
				if ( parseFloat(el.dataset.minversion) > parseFloat(info.version) )
					el.style.display = 'none';
			});	
		});
	}
}

function showInfoMsg(el, msg) {
	let div = $('#info_msg');
		
	let parsed = new DOMParser().parseFromString(msg, `text/html`);
	let tag = parsed.getElementsByTagName('body')[0];
				
	div.innerHTML = null;
	let point = document.createElement('div');
	point.className = 'point';
	div.appendChild(point);
	div.appendChild(tag.firstChild);

	let rect = el.getBoundingClientRect()

	div.style.top = rect.top + window.scrollY + 26 + 'px';
	div.style.left = rect.left + rect.width / 2 + window.scrollX - 16 + 'px';
	
	if (rect.left > ( window.innerWidth - 220) )
		div.style.left = parseFloat(div.style.left) - 230 + "px";
	
	div.style.display = 'block';

}

// set up info bubbles
// function buildInfoBubbles() {
	
// 	let i18n_tooltips = document.querySelectorAll('[data-i18n_tooltip]');
	
// 	for (let el of i18n_tooltips) {
// 		el.dataset.msg = i18n(el.dataset.i18n_tooltip + 'Tooltip') || el.dataset.msg || el.dataset.i18n_tooltip;
		
// 		el.addEventListener('mouseenter', e => {
// 			showInfoMsg(el, el.dataset.msg);
// 		});
		
// 		el.addEventListener('mouseleave', e => {
// 			$('#info_msg').style.display = 'none';
// 		});
// 	}
// }

// import/export buttons
function buildImportExportButtons() {
	
	function download(filename, json) {

		var blob = new Blob([json], {type: "application/json"});
		var url  = URL.createObjectURL(blob);

		var a = document.createElement('a');
		a.href        = url;
		a.download    = filename;

		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}
	
	let b_export = $('#b_exportSettings');
	b_export.onclick = function() {

		let date = new Date().toISOString().replace(/:|\..*/g,"").replace("T", "_");

		let filename = prompt("filename", `ContextSearchOptions_${date}.json`);

		if ( !filename ) return;
		
		if ( userOptions.exportWithoutBase64Icons ) {
			let uoCopy = Object.assign({}, userOptions);
			findNodes(uoCopy.nodeTree, node => {
				if ( node.type === "searchEngine" )
					node.iconCache = "";

				if ( node.type === "oneClickSearchEngine" )
					node.icon = "";
			});
			download(filename, JSON.stringify(uoCopy));
		} else {
			download(filename, JSON.stringify(userOptions));
		}
	}
	
	let b_import = $('#b_importSettings');
	b_import.onclick = function() {
		$('#importSettings').click();
	}
	
	$('#importSettings').addEventListener('change', e => {
		var reader = new FileReader();

		// Closure to capture the file information.
		reader.onload = async () => {

			// check for exported nodes
			importNodes: try {
				let json = JSON.parse(reader.result);
				if ( !json.exportedNodes ) break importNodes;

				let uo = JSON.parse(JSON.stringify(userOptions));

				let folder = {
					type:"folder",
					children: json.exportedNodes,
					id:gen(),
					title: "Imported"
				}

				// flatten
				folder.children = findNodesDeep(folder, n => n.type !== 'folder' );

				// repair old style
				findNodes(folder, n => {
					if ( n.searchEngine ) {
						Object.assign(n, n.searchEngine);
						delete n.searchEngine;
					}

				})

				// get nodes with duplicate ids in userOptions.nodeTree
				let dupes = findNodesDeep(folder, n => findNode(uo.nodeTree, _n => _n.id === n.id));

				for ( let dupe of dupes ) {
					let modal = $('#importModalDuplicates');
					let result = await new Promise( res => {
						modal.classList.remove('hide');
						modal.querySelector('[name="message"]').innerText = dupe.title || dupe.type;

						modal.querySelectorAll('BUTTON[name]').forEach( el => {
							el.addEventListener('click', e => res(el.name));
						})
					});

					if ( result === "skip" )
						removeNodesById(folder, dupe.id);

					if ( result === "cancel" ) {
						modal.classList.add('hide');
						return;
					}

					if ( result === "replace" ) {
						let oldNode = findNode(uo.nodeTree, n => n.id === dupe.id );
						oldNode = JSON.parse(JSON.stringify(dupe));

						removeNodesById(folder, dupe.id);
					}

					if ( result === "merge" ) {
						// replace id 
						dupe.id = gen();
					}
						
					modal.classList.add('hide');

				}

				if ( folder.children.length ) uo.nodeTree.children.push(folder);

				await browser.runtime.sendMessage({action: "saveUserOptions", userOptions: uo});
				location.reload();

				return;

			} catch (error) { console.error(error)}

			try {
				let newUserOptions = JSON.parse(reader.result);
				
				// run a few test to check if it's valid
				if ( 
					typeof newUserOptions !== 'object'
					|| newUserOptions.quickMenu === undefined
					
				) {
					alert(i18n("ImportSettingsNotFoundAlert"));
					return;
				}

				if ( false && userOptions.advancedImport ) {

					$('#main').classList.add('blur');

					let choice1 = await new Promise( res => {
						$('#importModal').classList.remove('hide');

						$('#importModal .replace').addEventListener('click', e => res("replace"));
						$('#importModal .merge').addEventListener('click', e => res("merge"));
						$('#importModal .cancel').addEventListener('click', e => res("cancel"));
					});
					$('#importModal').classList.add('hide');

					if ( choice1 === "cancel" ) return;
					if ( choice1 === "merge" ) {
						await new Promise( res => {
							$('#importModalCustom').classList.remove('hide');
							$('#importModalCustom .ok').addEventListener('click', e => res("replace"));
							$('#importModalCustom .cancel').addEventListener('click', e => res("cancel"));

							let left_browser = $('#importModalCustom [name="nodes_left"]');
							let right_browser = $('#importModalCustom [name="nodes_right"]');

							left_browser.innerHTML = null;
							right_browser.innerHTML = null;

							let copy = JSON.parse(JSON.stringify(newUserOptions));

							traverseNodesDeep(copy.nodeTree, (n,p) => {

								// remove OCSE from non-FF browsers
								if ( n.type === "oneClickSearchEngine" && ( !browser.search || !browser.search.get ) )
									removeNode(n,p);
								// remove duplicate nodes
								else if ( findNode(userOptions.nodeTree, _n => _n.id === n.id && JSON.stringify(_n) === JSON.stringify(n)) )
									removeNode(n,p);
								// remove missing engines
								// else if ( n.type === "searchEngine" && !copy.searchEngines.find(se => se.id === n.id ) )
								// 	removeNode(n,p);
								// remove empty folders
								else if ( n.type === "folder" && !n.children.length && p)
									removeNode(n,p);

							});

							left_browser.appendChild(makeFolderBrowser(copy.nodeTree));
							right_browser.appendChild(makeFolderBrowser({type: "folder", title:"/", id: gen(), children: []}));

							left_browser.querySelectorAll('li').forEach( li => {
								li.classList.add('new');
								li.addEventListener('click', e => {
									if ( e.target !== li ) return;

									let parent = li.closest('.folderBrowser');
									let notParent = [left_browser, right_browser].find( b => !b.contains(parent));

									if ( left_browser.contains(parent) ) {
										let div = document.createElement('div');
										div.dataset.id = li.node.id;
										li.parentNode.insertBefore(div, li);
										notParent.querySelector('li[title="/"] > UL').appendChild(li);
									} else {
										let placeholder = left_browser.querySelector(`div[data-id="${li.node.id}"]`);

										if ( placeholder)  {
											placeholder.parentNode.insertBefore(li, placeholder);
											placeholder.parentNode.removeChild(placeholder);
										}
									}
								})
							});
						}).then( async result => {

							if ( result === "cancel" ) {
								newUserOptions = null;
								return;
							}

							let _settings = $('#importModalCustom [name="settings"]').checked;
							let _history = $('#importModalCustom [name="history"]').checked;

							if ( !_history )
								newUserOptions.searchBarHistory = JSON.parse(JSON.stringify(userOptions.searchBarHistory));

							if ( !_settings ) {
								for ( key in userOptions ) {
									if ( !["nodeTree", "searchEngines", "searchBarHistory"].includes(key) )
										newUserOptions[key] = JSON.parse(JSON.stringify(userOptions[key]));
								}
							}

							let tree = listToNodeTree($('#importModalCustom [name="nodes_right"] .folderBrowser li[title="/"] > UL'));
							let ids = findNodes(tree, n => n.type === "searchEngine").map(n => n.id);

							let duplicates = [];
							ids.forEach( id => {
								let node = findNode(userOptions.nodeTree, n => n.id === id );
								if ( node ) duplicates.push(n);
							});

							// loop over duplicates to replace, skip, cancel
							for ( let dupe of duplicates ) {
								await new Promise( res => {
									$('#importModalDuplicates').classList.remove('hide');
									$('#importModalDuplicates [name="message"]').innerText = dupe.title;
									$('#importModalDuplicates [name="replace"]').addEventListener('click', e => res("replace"));
									$('#importModalDuplicates [name="skip"]').addEventListener('click', e => res("skip"));
									$('#importModalDuplicates [name="cancel"]').addEventListener('click', e => res("cancel"));
								}).then(result => {
									if ( result === "skip" )
										removeNodesById(tree, dupe.id);

									$('#importModalDuplicates').classList.add('hide');
								});
							}

							if ( duplicates.length ) console.error(duplicates);

							// append searchEngines
							// let ses = userOptions.searchEngines.filter(se => ids.includes(se.id));
							// newUserOptions.searchEngines = userOptions.searchEngines.concat(ses);
							
							// append tree to newUserOptions
							tree.title = "Imported";
							newUserOptions.nodeTree = JSON.parse(JSON.stringify(userOptions.nodeTree));

							if ( tree.children.length )
								newUserOptions.nodeTree.children.push(JSON.parse(JSON.stringify(tree)));

						});

						$('#importModalCustom').classList.add('hide');
					}

					$('#main').classList.remove('blur');

					return;
				}

				// check for cancel
				if ( !newUserOptions ) return;
	
				// update imported options
				let _uo = await browser.runtime.sendMessage({action: "updateUserOptionsObject", userOptions: newUserOptions})
				
				try {
					_uo = await browser.runtime.sendMessage({action: "updateUserOptionsVersion", userOptions: _uo})		
				} catch ( error ) {
					console.log(error);
					if ( !confirm("Failed to update config. This may cause some features to not work. Install anyway?"))
						return;
				}

				let modal = $('loadingRemoteContentModal');
				openModal(modal);

				let sesToBase64 = findNodes(_uo.nodeTree, n => n.type === "searchEngine").filter(se => !se.iconCache);
				let details = await loadRemoteIcon({searchEngines: sesToBase64, timeout:10000});

				closeModal(modal);

				// remove bad OCSE
				let badNodes = [];
				if ( browser.search && browser.search.get ) {
					let ocses = await browser.search.get();
					findNodes(_uo.nodeTree, node => {
						if ( node.type === "oneClickSearchEngine" ) {
							let ocse = ocses.find(_ocse => _ocse.name === node.title);	
							if ( !ocse ) badNodes.push(node);
						}
					});
				} else {
					badNodes = findNodes(_uo.nodeTree, node => node.type === "oneClickSearchEngine");
				}

				badNodes.forEach( n => removeNodesById(_uo.nodeTree, n.id));

				// load OCSE favicons
				// if ( browser.search && browser.search.get ) {
				// 	let ocses = await browser.search.get();
				// 	findNodes(_uo.nodeTree, node => {
				// 		if ( node.type === "oneClickSearchEngine" ) {
				// 			let ocse = ocses.find(_ocse => _ocse.name === node.title);	
				// 			if ( ocse ) node.icon = ocse.favIconUrl;
				// 		}
				// 	});
				// } else {
				// 	findNodes(_uo.nodeTree, node => {
				// 		if ( node.type === "oneClickSearchEngine" ) node.hidden = true;
				// 	});
				// }

				await browser.runtime.sendMessage({action: "saveUserOptions", userOptions: _uo});
				location.reload();
				

			} catch(err) {
				console.log(err);
				alert(i18n("InvalidJSONAlert"));
			}
		}

      // Read in the image file as a data URL.
      reader.readAsText(e.target.files[0]);
	});
}

// click element listed in the hash for upload buttons
function buildUploadOnHash() {
	let params = new URLSearchParams(window.location.search);
	
	if (params.has('click')) {
		document.getElementById(params.get('click')).click();
		history.pushState("", document.title, window.location.pathname);
	}
}

function listToNodeTree(ul) {
	let tree = {
		type:"folder",
		id: gen()
	};
	function traverse(el, folder) {

		if ( el.nodeName === 'LI') {
			folder.push(JSON.parse(JSON.stringify(el.node)));
		}

		if ( el.nodeName === 'UL' ) {
			folder.children = [];
			el.childNodes.forEach(c => traverse(c, folder.children));
		}
	}
		
	traverse(ul, tree);

	return tree;
}

function buildLocaleStrings() {
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
		
		if (i18n(el.dataset.i18n)) {
			textNode.nodeValue = i18n(el.dataset.i18n);

				el.addEventListener('click', e => {
					if ( userOptions.developerMode ) {
						el.style.backgroundColor = "rgba(0,0,255,.1)";
						setTimeout(() => el.style.backgroundColor = null, 150);
						console.log(el.dataset.i18n);
						navigator.clipboard.writeText(el.dataset.i18n);
					}
				})
			
			if (el.title === "i18n_text")
				el.title = i18n(el.dataset.i18n);
		}
	}

	// replace new-style titles
	document.querySelectorAll('[title^="$"]').forEach( el => {
		el.title = i18n(el.title.replace(/^\$/, "") );
	//	el.style.cursor = "help";
	});
}

function buildHelpTab() {

	// add locale-specific styling
	var link = document.createElement( "link" );
	link.href = browser.runtime.getURL('/_locales/' + i18n("LOCALE_FOLDER") + '/style.css');
	link.type = "text/css";
	link.rel = "stylesheet";
	document.getElementsByTagName( "head" )[0].appendChild( link );
	
	// set up localized help pages
	let help = $('#helpTab');
	
	let loaded = false;
	let iframe = document.createElement('iframe');
	
	iframe.style = 'display:none';
	iframe.onerror = function() {
		console.log('error');
	}
	
	iframe.onload = function() {
		console.log('loaded @ ' + iframe.src);
		var iframeDocument = iframe.contentDocument;
		
		if (!iframeDocument) return;
		
		var iframeBody = iframeDocument.body;
		
		const parser = new DOMParser();
		const parsed = parser.parseFromString(iframeBody.innerHTML, `text/html`);
		
		for (let child of parsed.getElementsByTagName('body')[0].childNodes) {
			help.appendChild(child);
		}

		help.removeChild(iframe);
		
		help.querySelectorAll("[data-gif]").forEach( el => {
			el.addEventListener('click', _e => {
				let div = document.createElement('div');
				div.style = 'position:fixed;top:0;bottom:0;left:0;right:0;background-color:rgba(0,0,0,.8);z-index:2;text-align:center';
				
				div.onclick = function() {
					div.parentNode.removeChild(div);
				}
				
				let img = document.createElement('img');
				img.src = el.dataset.gif;
				img.style.maxHeight = '75vh';
				img.style.marginTop = '12.5vh';
				img.style.maxWidth = '75vw';
					
				img.onload = function() {
					div.appendChild(img);
					el.style.backgroundImage = 'url("' + img.src + '")';
					el.style.backgroundSize = '100% 100%';
				}
				
				help.appendChild(div);
			});
		});
	}
	
	setTimeout(() => {
		if (!loaded) iframe.src = '/_locales/' + browser.runtime.getManifest().default_locale + '/help.html';
	}, 250);
	
	iframe.src = '/_locales/' + i18n("LOCALE_FOLDER") + '/help.html';
	
	help.appendChild(iframe);

}
	
function buildClearSearchHistory() {
	let div = $('#d_clearSearchHistory');
	div.animating = false;
	div.onclick = function() {
		if (div.animating) return false;
		div.animating = true;
		
		userOptions.searchBarHistory = [];
		saveOptions();
		
		let yes = document.createElement('div');
		yes.className = 'yes';
		yes.style.verticalAlign = 'top';
		yes.style.height = yes.style.width = '1em';
		div.appendChild(yes);
		
		yes.addEventListener('transitionend', e => {
			div.removeChild(yes);
			div.animating = false;
		});
		
		yes.getBoundingClientRect();
		yes.style.opacity = 0;
	}
}

function showSaveMessage(str, color, el) {

	// clear and set save message
	el.innerHTML = null;	
	let msgSpan = document.createElement('span');

	msgSpan.style = "display:inline-block;font-size:10pt;font-family:'Courier New', monospace;font-weight:600;opacity:1;transition:opacity .75s .5s;padding:1px 12px;border-radius:8px;box-shadow:4px 4px 8px #0003;border:2px solid var(--border1)";
	msgSpan.style.backgroundColor = "var(--bg-color2)";
	msgSpan.innerText = str;

	let div = document.createElement('div')
	div.className = 'yes';
	div.style.verticalAlign = 'middle';
	div.style.marginRight = '16px';
	div.style.marginLeft = '0';
	div.style.height = div.style.width = "1em";
	msgSpan.insertBefore(div, msgSpan.firstChild);

	el.appendChild(msgSpan);
	
	msgSpan.addEventListener('transitionend', e => {
		msgSpan.parentNode.removeChild(msgSpan);
	});

	msgSpan.getBoundingClientRect(); // reflow
	msgSpan.style.opacity = 0;
}

function buildSaveButtons() {
	document.querySelectorAll('BUTTON.saveOptions').forEach( button => {
		button.onclick = saveOptions;
	});
}

function buildSearchActions() {

	function addOption(el, keys) {

		let actions = {
			"openFolder": {i18n:"SearchActionsOpenFolder"},
			"openCurrentTab": {i18n: "SearchActionsCurrentTab"},
			"openNewTab": {i18n: "SearchActionsNewTab"},
			"openBackgroundTab": {i18n: "SearchActionsBackgroundTab"},
			"openBackgroundTabKeepOpen": {i18n: "SearchActionsBackgroundTabKeepOpen"},
			"openNewWindow": {i18n: "SearchActionsNewWindow"},
			"openNewIncognitoWindow": {i18n: "SearchActionsIncognitoWindow"},
			"openSideBarAction": {i18n: "SearchActionsSidebarAction", browser: "firefox", minversion: "62"},
			"keepMenuOpen": {i18n: "KeepMenuOpen"},
			"noAction": {i18n: "SearchActionsNoAction"}
		};

		for ( let key in actions ) {

			if ( !keys.includes(key) ) continue;

			let o = document.createElement('option');
			o.value = key;
			o.innerText = i18n(actions[key].i18n);

			for ( let data in actions[key]) 
				o.dataset[data] = actions[key][data];

			el.appendChild(o);
		}
	}

	document.querySelectorAll('[data-searchaction]').forEach( el => {
		addOption(el, el.dataset.searchaction.split(","));
		el.querySelector('option').selected = true;
	});
}

function buildCheckbox(id) {
	let label = document.createElement('label');
	let input = document.createElement('input');
	let span = document.createElement('span');

	label.className = 'container';
	input.type = 'checkbox';
	input.id = id;
	span.className = "checkmark checkmark2";

	label.appendChild(input);
	label.appendChild(span);

	return label;
}
function buildCheckboxes() {
	document.querySelectorAll('checkbox').forEach(el => {
		let cb = buildCheckbox(el.dataset.id);
		el.parentNode.insertBefore(cb,el);
		el.parentNode.removeChild(el);
	});
}

function buildToolMasks() {
	document.querySelectorAll('tool').forEach( el => {
		let t = document.createElement('div');
		t.className = 'tool';
		t.setAttribute("style", el.getAttribute("style"));
		t.style.setProperty('--mask-image', `url(icons/${el.dataset.icon})`);

		el.parentNode.insertBefore(t,el);
		el.parentNode.removeChild(el);
	})
}

function buildLayoutEditors() {
	let le = $("quickMenuLayoutEditor");
	"menuBar,searchBarContainer,quickMenuElement,titleBar,toolBar".split(",").forEach(id => {
		let div = document.createElement('div');
		div.dataset.id = id;
		div.innerText = i18n(i18n_layout_titles[id] || "");

		le.appendChild(div);
	})
}

// generate new search.json.mozlz4 
$("#replaceMozlz4FileButton").addEventListener('change', ev => {
	
	let searchEngines = [];
	let file = ev.target.files[0];
	
	// create backup with timestamp
	exportFile(file, "search.json.mozlz4_" + Date.now() );
	
	readMozlz4File(file, text => { // on success

		// parse the mozlz4 JSON into an object
		var json = JSON.parse(text);	

		let nodes = findNodes(userOptions.nodeTree, n => ["searchEngine", "oneClickSearchEngine"].includes(n.type) );
		
		// console.log(json.engines);
		
		let ses = [];

		nodes.forEach( n => {
			if ( n.type === "searchEngine" ) {
				ses.push(CS2FF(n));
			}
			
			if ( n.type === "oneClickSearchEngine" ) {
				let ocse = json.engines.find( _ocse => _ocse._name === n.title );
				if ( ocse ) ses.push(ocse);
			}
		});

		ses.forEach( (se,i) => se._metaData.order = i)
	//	for ( let i in ses) ses[i]._metaData.order = i;
		
		// console.log(ses);

		json.engines = ses;

		exportSearchJsonMozLz4(JSON.stringify(json));
		
	});
	
	function CS2FF(se) {

		let ff = {
			_name: se.title,
			_loadPath: "[other]addEngineWithDetails",
			description: se.title,
			__searchForm: se.searchForm,
			_iconURL: se.iconCache,
			_metaData: {
				alias: null,
				order: null
			},
			_urls: [
				{
					method: se.method,
					params: se.params,
					rels: [],
					template: se.template
				}
			],
			_isAppProvided: false,
			_orderHint: null,
			_telemetryId: null,
			_updateInterval: null,
			_updateURL: null,
			_iconUpdateURL: null,
			_filePath: null,
			_extensionID: null,
			_locale: null,
			_definedAliases: [],
			queryCharset: se.queryCharset.toLowerCase()
		}
		
		return ff;
	}
});

$('#nightmode').addEventListener('click', () => {
	userOptions.nightMode = !userOptions.nightMode;

	$('#style_dark').disabled = !userOptions.nightMode;
	saveOptions();
});

function setAutoDarkMode() {
	if ( userOptions.autoTheme ) {
		$('#style_dark').disabled = !isDarkMode();
		$('#nightmode').style.display = 'none';
	}
}

function buildThemes() {
	$('#quickMenuTheme').innerHTML = null;
	themes.forEach( t => {
		let option = document.createElement('option');
		option.value = t.name;
		option.innerText = i18n(t.name.replace(" ","_")) || t.name;
		$('#quickMenuTheme').appendChild(option);
	});
}

$('#b_cacheIcons').addEventListener('click', cacheAllIcons);

$('#b_uncacheIcons').addEventListener('click', e => {
	if ( confirm(i18n("confirmUncache")))	{
		uncacheIcons();
		saveOptions();
	}
});

function cacheAllIcons() {
	let result = cacheIcons();
	let modal = $('#cacheModal');
	openModal(modal);
	let msg = modal.querySelector('[name="message"]');

	modal.querySelector('[name="ok"]').onclick = () => {
		closeModal(modal);
	}

	let interval = setInterval(() => {
		msg.innerText = `caching ${result.count - 1} / ${result.total}`;
	}, 100);

	result.oncomplete = function() {
		clearInterval(interval);

		// if ( result.bad.length )
		// 	msg.innerText = i18n("warningCache");
		// else
		// 	msg.innerText = "done";

		modal.querySelector('[name="ok"]').onclick();

		saveOptions();
	}

	result.cache();
}

function buildShortcutTable() {
	let table = $('#shortcutTable');

	setButtons = (el, key) => {
		el.innerText = null;
		el.appendChild(keyArrayToButtons(key));
	}

	defaultToUser = key => {
		return {
			alt: key.alt,
			shift: key.shift,
			ctrl: key.ctrl,
			meta: key.meta,
			key: key.key,
			id: key.id,
			enabled: key.enabled || false
		}
	}

	defaultShortcuts.sort((a,b) => a.name > b.name).forEach( s => {

		const us = userOptions.userShortcuts.find(_s => _s.id == s.id);
		const ds = defaultToUser(s);

		let tr = document.createElement('tr');
		tr.shortcut = s;
		tr.appendChild(document.createElement('td'));
		tr.appendChild(document.createElement('td'))
			.appendChild(document.createTextNode(i18n(s.name) || s.name || s.action));

		let span = tr.appendChild(document.createElement('td').appendChild(document.createElement('span')));
		span.title = i18n("ClickToSet");
		span.dataset.id = s.id;
		span.style = "cursor:pointer;user-select:none;";
		span.innerText = 'set';

		table.appendChild(tr);

		let input = document.createElement('input');
		input.type = "checkbox";
		input.checked = us ? us.enabled : false;

		input.onchange = () => {
			let key = userOptions.userShortcuts.find(_s => _s.id == s.id) || defaultToUser(s);
			key.enabled = input.checked;
			setUserShortcut(key);
		}

		tr.querySelector('td').appendChild(input);
		
		const b = tr.querySelector('span')
		setButtons(b, us || ds);

		b.onclick = async () => {

			let key = await shortcutListener(b);

			if ( !key )
				setUserShortcut(ds);
			else {
				key.id = ds.id;
				setUserShortcut(key);
			}

			setButtons(b, key || ds);
		}
	});

	function setUserShortcut(key) {
		if ( ! 'id' in key ) throw new Error('NO_ID');

		key = defaultToUser(key);

		let us = userOptions.userShortcuts.find( s => s.id == key.id);

		if ( us ) {
			key.enabled = us.enabled;
			userOptions.userShortcuts.splice(userOptions.userShortcuts.indexOf(us), 1, key);
		} else userOptions.userShortcuts.push(key);

		saveOptions();
	}
}

function shortcutListener(hk, options) {

	options = options || {};

	return new Promise(resolve => {
			
		preventDefaults = e => {
			e.preventDefault();
			e.stopPropagation();
		}

		document.addEventListener('keydown', preventDefaults);
		document.addEventListener('keypress', preventDefaults);
		
		hk.innerHTML = '<img src="/icons/spinner.svg" style="height:1em;margin-right:10px;vertical-align:middle" /> ';
		hk.appendChild(document.createTextNode(i18n('PressKey')));
				
		document.addEventListener('keyup', e => {
			
			e.preventDefault();
			e.stopPropagation();
			
			if ( e.key === "Escape" ) {
				hk.innerHTML = null;
				hk.appendChild(keyArrayToButtons(options.defaultKeys || []));
				resolve(null);
				return;
			}
			
			let key = {
				alt: e.altKey,
				ctrl: e.ctrlKey,
				meta: e.metaKey,
				shift: e.shiftKey,
				key: e.key
			}
			
			hk.innerHTML = null;
			hk.appendChild(keyArrayToButtons(key));
								
			document.removeEventListener('keydown', preventDefaults);
			document.removeEventListener('keypress', preventDefaults);

			resolve(key);
			
		}, {once: true});
	});	
}

function imageUploadHandler(el, callback) {

	el.addEventListener('change', e => {

		let file = e.target.files[0];
		
		var reader = new FileReader();
		
		reader.addEventListener("load", function () {
			
			let img = new Image();
			
			img.onload = function() {
				callback(img);
			}
			img.src = reader.result;
			
		}, false);
		
		reader.readAsDataURL(file);
		
	});
}

[$('toolBarIconForm'), $('quickMenuIconForm')].forEach( el => {
	imageUploadHandler(el, img => {
		let uri = imageToBase64(img, 32);
		setIconOption(el,  uri);
		saveOptions();
	});
});

function setIconOption(el, uri) {
	el.querySelector('.iconCustom').style.backgroundImage = `url(${uri})`;

	let lastOpt = el.querySelector('input[type="radio"][id$="3"]');
	lastOpt.checked = true;
	lastOpt.value = uri;
}

function buildAdvancedOptions() {

	function makeInput( key ) {

		let value = key.split('.').reduce((a, b) => a[b], defaultUserOptions);

		let type = typeof value;

		let el = document.createElement('input');

		el.id = key;

		if ( type === 'boolean')
			el.type = 'checkbox';

		if ( type === 'string' )
			el.type = 'input';
		
		if ( type === 'number' )
			el.type = 'number';

		return el;
	}

	advancedOptions.forEach( o => {
		let tr = document.createElement('tr');
		let td1 = document.createElement('td');
		let td2 = document.createElement('td');

		tr.appendChild(td1);
		tr.appendChild(td2);

		td1.innerText = o.id;
		td1.title = i18n(o.id.replace(".", "_") + "Tooltip") || o.i18n;
		td1.style.cursor = 'help';

		td2.appendChild(makeInput(o.id));


		$('advancedSettingsTable').appendChild(tr);
	})
}

function sortAdvancedOptions() {
	let table = $('#advancedSettingsTable');

	let trs = table.querySelectorAll('tr');

	trs = [...trs].sort((a,b) => {
		return a.querySelector('td').innerText > b.querySelector('td').innerText ? 1 : -1;
	});
	table.innerHTML = null;
	trs.forEach( tr => table.appendChild(tr));

	// // move 
	// let save = table.querySelector('.moveToEnd');
	// table.appendChild(save);
}

function syntaxHighlight(json) {
    if (typeof json != 'string') {
         json = JSON.stringify(json, undefined, 2);
    }
    json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
        var cls = 'number';
        if (/^"/.test(match)) {
            if (/:$/.test(match)) {
                cls = 'key';
            } else {
                cls = 'string';
            }
        } else if (/true|false/.test(match)) {
            cls = 'boolean';
        } else if (/null/.test(match)) {
            cls = 'null';
        }
        return '<span class="' + cls + '">' + match + '</span>';
    });
}

function additionalSearchActionFromRow(tr) {
	return {
		event:tr.querySelector('[name="event"]').value,
		button:parseInt(tr.querySelector('[name="button"]').value),
		altKey:tr.querySelector('[name="altKey"]').checked,
		ctrlKey:tr.querySelector('[name="ctrlKey"]').checked,
		metaKey:tr.querySelector('[name="metaKey"]').checked,
		shiftKey:tr.querySelector('[name="shiftKey"]').checked,
		action:tr.querySelector('[name="action"]').value,
		folder:false
	}
}

function buildAdditionalSearchActionsTable() {
	let table = $("additionalSearchActionsTable");

	const getRows = () => [...table.querySelectorAll("TR:not(.template):not(.header)")];

	const hasConflict = row => {

		const _compare = (sa1, sa2) => {
			return ( 
				sa1.event === sa2.event &&
				sa1.button === sa2.button &&
				sa1.altKey === sa2.altKey &&
				sa1.ctrlKey === sa2.ctrlKey &&
				sa1.metaKey === sa2.metaKey &&
				sa1.shiftKey === sa2.shiftKey
				) 
		}

		let sa = additionalSearchActionFromRow(row);

		for ( let key in defaultSearchActions ) {
			if ( _compare(sa, defaultSearchActions[key]) ) return true;
		}

		for ( tr of getRows() ) {
			let csa = additionalSearchActionFromRow(tr);

			if ( _compare(sa, csa) && row !== tr ) return true;
		}

		return false;
	}

	const setConflictState = row => {
		row.classList.toggle("conflict", hasConflict(row));
	}

	const makeNewRow = sa => {
		let row = table.querySelector(".template").cloneNode(true);
		row.className = null;

		table.appendChild(row);

		row.querySelector('[name="event"]').value = sa.event;
		row.querySelector('[name="button"]').value = sa.button;
		row.querySelector('[name="action"]').value = sa.action;
		row.querySelector('[name="altKey"]').checked = sa.altKey;
		row.querySelector('[name="ctrlKey"]').checked = sa.ctrlKey;
		row.querySelector('[name="metaKey"]').checked = sa.metaKey;
		row.querySelector('[name="shiftKey"]').checked = sa.shiftKey;
		
		row.querySelector('[name="delete"]').onclick = function() {
			row.parentNode.removeChild(row);
			saveOptions();
		}

		row.addEventListener('click', e => getRows().forEach( tr => setConflictState(tr)));
		setConflictState(row)
	}

	getRows().forEach( tr => tr.parentNode.removeChild(tr));
	userOptions.customSearchActions.forEach( sa => makeNewRow(sa));

	$('newSearchAction').onclick = function(e) {
		
		let sa = {
			"event":"mouseup",
			"button":0,
			"altKey":false,
			"ctrlKey":false,
			"metaKey":false,
			"shiftKey":false,
			"action": "openNewTab",
			"folder":false
		}

		makeNewRow(sa);
		saveOptions();
	}
}

// saveOptions on every change
document.addEventListener('change', e => {
	
	// skip modal forms
	if ( e.target.closest('.editForm')) return;

	// skip nosave tagged elements
	if ( e.target.classList.contains("nosave") ) return;

	saveOptions();
});

$('b_manualEdit').addEventListener('click', e => {

	$('b_manualEdit').style.display = 'none';

	//if ( !confirm(i18n("manualeditwarning"))) return;

	$('advancedSettingsTable').style.display = 'none';
	[$('t_manualEdit'), $('b_manualSave'), $('b_manualClose')].forEach( el => el.style.display=null );

	let o = JSON.parse(JSON.stringify(userOptions));
	delete o.searchEngines;
	delete o.searchBarHistory;
	delete o.nodeTree;

	const ordered = Object.keys(o).sort().reduce(
		(obj, key) => { 
		obj[key] = o[key]; 
		return obj;
	}, 
	{}
	);

	$('t_manualEdit').innerHTML = syntaxHighlight(JSON.stringify(ordered, null, 4))

})

$('b_manualClose').addEventListener('click', e => {
	$('advancedSettingsTable').style.display = null;
	[$('t_manualEdit'), $('b_manualSave'), $('b_manualClose')].forEach( el => el.style.display='none' );
	$('b_manualSave').classList.remove('changed');

	$('b_manualEdit').style.display = null;
});

$('t_manualEdit').addEventListener('input', e => {
	$('b_manualSave').classList.add('changed');
});

$('b_manualSave').addEventListener('click', e => {
	try {
		let uo = JSON.parse($('t_manualEdit').innerText);
		merge(uo, userOptions);

		restoreOptions(userOptions);
		saveOptions();

		$('b_manualSave').classList.remove('changed');

	} catch (err) { alert(err) }
	
});

$("#b_resetUserOptions").addEventListener('click', e => {
	if ( confirm(i18n("resetUserOptionsConfirm")) ) {
		newUserOptions = JSON.parse(JSON.stringify(defaultUserOptions));
		newUserOptions.nodeTree = JSON.parse(JSON.stringify(userOptions.nodeTree));

		browser.runtime.sendMessage({action: "saveUserOptions", userOptions: newUserOptions})
			.then(() => location.reload());
	}
});

function createEditMenu() {

	let overdiv = document.createElement('div');
	overdiv.className = 'overDiv';
	overdiv.style.opacity = 0;
	document.body.appendChild(overdiv);

	// chrome fix for menu closing on text select events
	overdiv.onmousedown = e => {
		if ( overdiv !== e.target) return;
		overdiv.mousedown = true;
	}

	overdiv.onclick = e => {
		if ( !overdiv.mousedown ) return;
		if ( overdiv !== e.target) return;
	}

	let formContainer = document.createElement('div');
	formContainer.id = "floatingEditFormContainer";
	formContainer.className = "modal";
	formContainer.style = "width:90%;height:90%;";

	let fb = document.createElement('ul');
	fb.id = 'qm_browser';
	fb.className = 'folderBrowser';

	formContainer.appendChild(fb);
	overdiv.appendChild(formContainer);

	let g = new Grid({browserId: fb.id});

	g.makeFolderBrowser();

	let iframe = document.createElement('iframe');
	formContainer.appendChild(iframe);

	function setSize() {
		let win = iframe.contentWindow
		let doc = win.document;
		let qm = win.qm;

		qm.insertBreaks();
		qm.style.width = null;
		qm.style.height = null;

		iframe.style.width = qm.getBoundingClientRect().width + "px";
		iframe.style.height = doc.body.clientHeight + "px";
	}

	window.addEventListener('message', e => {
		if ( e.data.action && e.data.action === "quickMenuResize") {
			setSize();
		}
	})

	iframe.onload = function() {
		iframe.contentWindow.document.addEventListener('quickMenuIframePreLoaded', setSize);
	}

	iframe.src = browser.runtime.getURL('quickmenu.html');

	overdiv.appendChild(formContainer);

	$('#main').classList.add('blur');

	overdiv.getBoundingClientRect();
	overdiv.style.opacity = null;
}

async function checkAndUpdateNativeApp() {
	if ( !browser.runtime.sendNativeMessage ) return alert(i18n('NativeAppMissing'));

	browser.runtime.sendNativeMessage("contextsearch_webext", {checkForUpdate:true}).then( newVersion => {
		if ( newVersion ) {
			if (confirm(i18n("UpdateToVersion", newVersion)))
				browser.runtime.sendNativeMessage("contextsearch_webext", {update:true});
		} else {
			alert(i18n("LatestVersionAlreadyInstalled"));
		}
	});
}

async function checkForNativeAppUpdate() {
	if ( !browser.runtime.sendNativeMessage ) return false;

	return browser.runtime.sendNativeMessage("contextsearch_webext", {checkForUpdate:true});
}

function openModal(el) {
	$('#main').classList.add('blur');
	el.classList.remove('hide');
}

function closeModal(el) {
	$('#main').classList.remove('blur');
	el.classList.add('hide');
}

function makeFolderBrowser(tree) {

	let ul = document.createElement('ul');
	ul.classList.add('folderBrowser')

	traverse(tree, ul);

	function traverse(node, parentEl) {

		if ( !node.id ) return;
		
		let _li = document.createElement('li');
		_li.nodeid = node.id;
		_li.title = node.title;
		_li.node = node;

		let img = new Image();
		img.src = getIconFromNode(node);
		img.style.marginRight = '8px';
		_li.appendChild(img);
		let header = document.createElement('div');
		header.style = "display:inline-block";
		header.innerText = node.title;
		_li.appendChild(header);

		if (_li.node.type === "oneClickSearchEngine") {
			_li.appendChild(document.createElement('firefox-icon'));
		}

		parentEl.appendChild(_li);

		if ( node.hidden ) _li.style.opacity = .5;

		if ( node.children ) {
			let _ul = document.createElement('ul');
			_li.appendChild(_ul);

			_ul.node = node;

			let collapse = document.createElement('span');
			collapse.innerText = '+';
			_li.insertBefore(collapse,_li.firstChild);
			_ul.style.display = 'none';

			collapse.onclick = function() {	
				_ul.style.display = _ul.style.display ? null : 'none';
				collapse.innerText = _ul.style.display ? "+" : "-";
			}

			header.onclick = collapse.onclick;

			node.children.forEach( child => traverse(child, _ul) );
		}
	}

	ul.querySelectorAll('li').forEach( li => {

		li.setAttribute("draggable", "true");

		li.ondragstart = function(e) {
			e.stopPropagation();

			e.dataTransfer.setData("text/plain", li.nodeid);
			e.effectAllowed = "copyMove";
			// e.preventDefault();
			window.dragSource = li;
		}

		li.ondragend = function(e) {e.preventDefault();}
	});

	if ( ul.querySelector('ul'))
		ul.querySelector('ul').style.display = null;

	return ul;
}

function syncTest() {
	let uo = JSON.parse(JSON.stringify(userOptions));

	let badNodes = findNodes(uo.nodeTree, n => {
		if ( n.type !== 'oneClickSearchEngine' && n.icon && n.icon.startsWith('data:') ) return true;
		if ( n.icon && n.icon.startsWith('data:') ) return true;
	});

	console.log('bad nodes', badNodes);

	// badNodes.forEach(n => {
	// 	if ( n.icon ) n.icon = "";
	// });
	
	console.log('null oneClickSearchEngine icons')
	findNodes(uo.nodeTree, n => n.type === 'oneClickSearchEngine').forEach( n => n.icon = "");
	console.log('null iconCache');
	findNodes(uo.nodeTree, n => n.type === 'searchEngine').forEach( n => n.iconCache = "");
	console.log('null history');
	uo.searchBarHistory = [];

	let totalSize = JSON.stringify(uo).length

	console.log("options in bytes:", totalSize);

	let largeKeys = [];

	for ( key in uo ) {
		let len = JSON.stringify(uo[key]).length;
		if ( len > 8192) largeKeys.push({key: key, length: len});
	}

	let nodes = findNodes(uo.nodeTree, n => n.type !== 'folder');
	nodes.sort((a,b) => JSON.stringify(a).length > JSON.stringify(b).length );

//	nodes.forEach(n => console.log(n.title, JSON.stringify(n).length));

//	findNodes(uo.nodeTree, n => n.type === 'folder' && n.icon ).forEach( n => console.log(n.title, n.icon.length))

	let count = findNodes(uo.nodeTree, n => true).length;
	let size = JSON.stringify(uo.nodeTree).length

	console.log("count", count, "total size", size, "average", size / count);

	console.log("options in bytes:", JSON.stringify(uo).length);

	largeKeys.forEach( k => console.log(k.key, "exceeds maximum size", k.length));

}

function saveAndReload(o) {

	if ( !o ) return;

	browser.runtime.sendMessage({action: "saveUserOptions", userOptions: o})
		.then(() => location.reload());
}

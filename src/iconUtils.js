function uncacheIcons() {

	for ( let se of findNodes(userOptions.nodeTree, n => n.type === "searchEngine") ) {

		let hasDataURI = se.iconCache.startsWith('data:');
		let isDataURI = se.icon.startsWith("data:");
		let hasURL = se.icon.startsWith("http");

		if ( !se.iconCache) continue;

		if ( hasURL && hasDataURI) {
			console.log(se.title + " cache will be cleared");
			se.iconCache = "";
			continue;
		}

		if ( hasDataURI && isDataURI && hasDataURI == isDataURI ) {
			console.log(se.title + " duplicate data URIs. Removing cache");
			se.iconCache = "";
			continue;
		}

		if ( isDataURI )
			console.warn(se.title + " has no URL");
	}
}

function cacheIcons() {
	var result = {
		count:0,
		last_message:"",
		bad: [],
		total: findNodes(userOptions.nodeTree, n => n.hasOwnProperty("icon")).length,
		oncomplete: function() {},
		cache: cache
	};

	function onError(se, reason) {
		result.bad.push({ engine: se, error: reason });
		result.count++;
	}

	function cache() {

		for (let se of findNodes(userOptions.nodeTree, n => n.hasOwnProperty("icon"))) {
			let hasDataURI = se.iconCache.startsWith('data:');
			let isDataURI = se.icon.startsWith("data:");
			let hasURL = se.icon.startsWith("http");

			if ( isDataURI ) { // only keep one data: copy
				onError(se, "DATA_URI");
				se.iconCache = "";
				continue;
			}

			if ( !se.icon ) {
				onError(se, "NO_URL");
				continue;
			}
			let img = new Image();

			let timeout = setTimeout(() => {
				img.src = null;
				onError(se, "TIMEOUT");
			},10000);

			img.onload = async function() {

				if ( isDataURI && ( img.naturalHeight <= userOptions.cacheIconsMaxSize && img.naturalWidth <= userOptions.cacheIconsMaxSize)) {
					clearTimeout(timeout);
					result.last_message = se.title;
					result.count++;
					onloadend();
					return;
				}
				let data = await imageToBase64(img, userOptions.cacheIconsMaxSize); 

				if ( data != "" ) {
					se.iconCache = data;
					result.last_message = se.title;
					result.count++;
				}
				else onError(se, "BAD_ENCODE");

				clearTimeout(timeout);
				onloadend();
			}

			img.onerror = function() {
				onError(se, "LOAD_ERROR");
				clearTimeout(timeout);
				onloadend();
			}

			let onloadend = function() {
				if ( result.count >= result.total )
					result.oncomplete();
			}

			img.src = se.icon_url;
		}
	}

	return result;
}

async function findFavicons(url) {
	let tab;
	let hrefs = [];
	try {

		let promise1 = new Promise(resolve => {
			setTimeout(() => resolve(browser.tabs.remove(tab.id)),5000);
		});
		let promise2 = browser.tabs.create({url:url, active:false});

		tab = await Promise.race([promise1, promise2]);

		if ( !tab ) return [];

		// chrome requires a delay
		await new Promise(r => setTimeout(r, 500));

		let promise3 = browser.tabs.executeScript(tab.id, {
			code: `
			    var hrefs = [];
				document.querySelectorAll('link[rel="icon"],link[rel="shortcut icon"],link[rel^="apple-touch-icon"]').forEach( l => hrefs.push(l.href));
				document.querySelectorAll('meta[property="og:image"]').forEach( m => hrefs.push(m.content));
				hrefs;
			`
		});

		let promise4 = new Promise(resolve => setTimeout(resolve,5000));

		hrefs = await Promise.race([promise3, promise4]);

		hrefs = hrefs.shift();

		try {
			let _url = new URL(url);
			hrefs.unshift(_url.origin + "/favicon.ico");
		} catch(error) {
		}

	} catch (error) {
		console.log(error);
	} finally {
		if ( tab ) browser.tabs.remove(tab.id);
	}
	
	return hrefs || [];
}

// options.html
function addFavIconFinderListener(finder) {
	finder.onclick = async function(e) {

		let overdiv = document.createElement('div');
		overdiv.className = 'overDiv';
		document.body.appendChild(overdiv);

		let spinner = new Image();
		spinner.src = 'icons/spinner.svg';
		spinner.style = 'height:64px;width:64px;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:10000';
		overdiv.appendChild(spinner);

		let form = finder.closest("form");
		form.parentNode.classList.add('blur');

		let url;
		let urls = [];
		try {
			url = new URL(form.searchform.value || form.template.value);
			urls = await findFavicons(url.origin);

			// include the current icon URI in the picker
			if ( form.iconURL.value && !urls.includes(form.iconURL.value))
				urls.push(form.iconURL.value);

		} catch( error ) {
			console.log("error fetching favicons");
		}

		if ( form.node && form.node.type === 'oneClickSearchEngine' ) {
			let defaultIcon = await browser.runtime.sendMessage({action: "getFirefoxSearchEngineByName", name: form.node.title}).then( en => en.favIconUrl);
			if ( defaultIcon ) urls.push( defaultIcon );
		}

		function getCustomIconUrls() {

			let fonts = "Arial,Verdana,Helvetica,Tahoma,Trebuchet MS,Times New Roman,Georgia,Garamond,Courier New,Brush Script MT".split(",");

			let _urls = [];
			let palette = palettes.map(p => p.color).join("-");
			let colors = palette.split('-');

			let randomColors = [];
			for ( let i=0;i<10;i++) {
				randomColors.push(colors.splice([Math.floor(Math.random()*colors.length)],1));
			}

			randomColors.forEach( c => {
				_urls.push(createCustomIcon({
					text: form.node.title.charAt(0).toUpperCase(), 
					backgroundColor: '#' + c,
					fontFamily: fonts[Math.floor(Math.random()*fonts.length)]
				}));
			});

			return _urls;
		}

		spinner.parentNode.removeChild(spinner);

		let div = document.createElement('div');
		div.id = "faviconPickerContainer";
		overdiv.style.opacity = 0;
		overdiv.appendChild(div);

		overdiv.offsetWidth;
		overdiv.style.opacity = 1;

		function makeFaviconPickerBoxes(urls) {

			// clear old icons
			div.querySelectorAll('.faviconPickerBox').forEach( f => f.parentNode.removeChild(f));

			urls = [...new Set(urls)];
			urls.forEach( _url => {

				let box = document.createElement('div');
				box.className = "faviconPickerBox";

				if ( urls.length > 15 ) box.classList.add("small");

				let img = new Image();

				img.onload = function() {
					let label = box.querySelector('div') || document.createElement('div');
					label.innerText = this.naturalWidth + " x " + this.naturalHeight;
					box.appendChild(label);

					if ( _url === form.iconURL.value ) {
						let currentLabel = document.createElement('div');
						box.classList.add('current');
					}
				}

				img.onerror = function() {
					box.parentNode.removeChild(box);
					if ( !div.querySelector('.faviconPickerBox') )
						makeFaviconPickerBoxes(getCustomIconUrls());
				}

				img.src = _url;

				box.appendChild(img);
				div.appendChild(box);

				box.onclick = function() {
				
					// don't use loading progress images
					if ( img.src === browser.runtime.getURL('icons/spinner.svg')) return;

					form.iconURL.value = img.src;
					// update the favicon when the user picks an icon
					form.iconURL.dispatchEvent(new Event('change'));
					form.save.click();
				}
			});
		}

		const close = e => {
			overdiv.style.opacity = 0;
			form.parentNode.classList.remove('blur');
			runAtTransitionEnd(overdiv, "opacity", () => {
				overdiv.innerHTML = null;
				overdiv.parentNode.removeChild(overdiv);
			});
		}

		overdiv.onclick = close;

		if ( !urls.length ) urls = getCustomIconUrls();

		function showMoreButton() {
			let more = document.createElement('div');
			more.innerText = i18n('searchIconFinder');
			more.style = "position:absolute;bottom:0;right:10px;cursor:pointer;user-select:none"
			div.appendChild(more);

			more.addEventListener('click', async e => {
				more.style.display = 'none';
				e.stopPropagation();
				makeFaviconPickerBoxes([browser.runtime.getURL('icons/spinner.svg')]);

				let searchTerms = ( form.shortName ) ? form.shortName.value.trim() : form.node.title;

				let iconUrls = [];

				while ( !iconUrls.length ) {
					searchTerms = window.prompt(i18n("RefineSearch"), searchTerms);

					if ( !searchTerms ) { // prompt is cancelled, use generated
						makeFaviconPickerBoxes(getCustomIconUrls());
						break;
					}

					iconUrls = await browser.runtime.sendMessage({action:"getIconsFromIconFinder", searchTerms:searchTerms});
				}	

				makeFaviconPickerBoxes(iconUrls);			
			});
		}

		makeFaviconPickerBoxes(urls);
		showMoreButton();
	}
}

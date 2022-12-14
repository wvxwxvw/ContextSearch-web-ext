const defaultUserOptions = {
	searchEngines: [],
	nodeTree: {},
	lastUsedId: "",
	lastUsedMethod: "",
	hiddenEngines: "",
	defaultGroupColor: "#CED7FF",
	defaultGroupColorText: "#444444",
	quickMenu: true,
	quickMenuColumns: 6,
	quickMenuRows: 1,
	quickMenuRowsSingleColumn: 6,
	quickMenuKey: 0,
	quickMenuOnKey: false,
	quickMenuOnMouse: true,
	quickMenuOnMouseCtrl: false,
	quickMenuOnMouseAlt: false,
	quickMenuOnMouseShift: false,
	quickMenuSearchOnMouseUp: false,
	quickMenuOnMouseMethod: "hold",
	quickMenuOnMouseOpenWithoutSelection: true,
	quickMenuOnDrag: false,
	quickMenuDragAlt: false,
	quickMenuDragShift: false,
	quickMenuDragCtrl: false,
	quickMenuMouseButton: 3,
	quickMenuAuto: false,
	quickMenuAutoAlt: false,
	quickMenuAutoShift: false,
	quickMenuAutoCtrl: false,
	quickMenuAutoTimeout: 1000,
	quickMenuAutoOnInputs: false,
	quickMenuOnLinks: true,
	quickMenuOnImages: true,
	quickMenuOnVideos: true,
	quickMenuOnAudios: true,
	quickMenuOnSimpleClick: {
		enabled: false,
		button: 1,
		alt: false,
		ctrl: true,
		shift: false,
		useInnerText: false
	},
	quickMenuScale: 1.0,
	quickMenuIconScale: 1.0,
	quickMenuPosition: "top center",
	quickMenuOffset: {x:0, y:-20},
	quickMenuCloseOnScroll: false,
	quickMenuCloseOnClick: true,
	quickMenuCloseOnEdit: false,
	quickMenuCloseOnTabChange: false,
	//quickMenuCloseOnKeydown: false,
	quickMenuSearchBar: "hidden",
	quickMenuSearchBarFocus: false,
	quickMenuSearchBarSelect: true,
	quickMenuAllowContextMenuNew: false,
	quickMenuFocusOnOpen: true,
	contextMenu: true,
	contextMenuKey: 90,
	contextMenuShowAddCustomSearch: true,
	contextMenuBookmarks: false,
	contextMenuOnLinks: true,
	contextMenuOnImages: true,
	contextMenuOnVideos: true,
	contextMenuOnAudios: true,
	quickMenuBookmarks: false,
	quickMenuTools: [
		{name: 'lastused', 		disabled: false},
		{name: 'toggleview', 	disabled: false},
		{name: 'disable', 		disabled: true},
		{name: 'close', 		disabled: true},
		{name: 'copy', 			disabled: false},
		{name: 'link', 			disabled: false},
		{name: 'lock',			disabled: true},
		{name: 'repeatsearch',	disabled: true},
		{name: 'findinpage',	disabled: true},
		{name: 'openoptions',	disabled: true},
		{name: 'toggle_theme',	disabled: true},
		{name: 'toggle_hotkeys',disabled: true},
		{name: 'edit',			disabled: false},
		{name: 'block',			disabled: true},
		{name: 'showhide',		disabled: true},
		{name: 'recentlyused',	disabled: true}
	],
	quickMenuToolsPosition: "top",
	quickMenuToolsAsToolbar: true,
	contextMenuClick: "openNewTab",
	contextMenuMiddleClick: "openBackgroundTab",
	contextMenuRightClick: "openCurrentTab",
	contextMenuShift: "openNewWindow",
	contextMenuCtrl: "openBackgroundTab",
	contextMenuSearchLinksAs: "text",
	contextMenuUseInnerText: false,
	contextMenuShowSettingsFolder: false,
	contextMenuTitle:"",
	contextMenuShowFolderSearch: false,
	quickMenuLeftClick: "openNewTab",
	quickMenuRightClick: "openCurrentTab",
	quickMenuMiddleClick: "openBackgroundTab",
	quickMenuShift: "openNewWindow",
	quickMenuCtrl: "openBackgroundTab",
	quickMenuAlt: "keepMenuOpen",
	quickMenuFolderLeftClick: "openFolder",
	quickMenuFolderRightClick: "noAction",
	quickMenuFolderMiddleClick: "openBackgroundTab",
	quickMenuFolderShift: "openNewWindow",
	quickMenuFolderCtrl: "noAction",
	quickMenuFolderAlt: "noAction",
	quickMenuSearchHotkeys: "noAction",
	quickMenuSearchHotkeysFolders: "noAction",
	quickMenuAutoMaxChars: 0,
	quickMenuOpeningOpacity: 1.0,
	quickMenuTheme: "modern",
	quickMenuAlwaysShowMenuBar: false,
	quickMenuColumnsMinimum: 6,
	searchBarSuggestions: true,
	searchBarEnableHistory: true,
	searchBarHistory: [],
	searchBarDisplayLastSearch: true,
	searchBarColumns: 6,
	searchBarCloseAfterSearch: true,
	searchBarIcon: "icons/logo.svg",
	searchBarDomLayout: "",
	sideBar: {
		enabled: true,
		columns: 6,
		height: 400,
		singleColumn: false,
		startOpen: false,
		widget: {
			enabled: false,
			position: "right",
			offset: 100
		},
		position: "right",
		windowType: "undocked",
		offsets: {
			top:0,
			left:Number.MAX_SAFE_INTEGER,
			right:0,
			bottom:Number.MAX_SAFE_INTEGER
		},
		closeAfterSearch: false,
		rememberState: false,
		openOnResults: false,
		openOnResultsMinimized: false,
		scale:1.0,
		domLayout:"",
		setMinWidth:true
	},
	highLight: {
		enabled: true,
		followExternalLinks: false,
		followDomain: true,
		showFindBar: false,
		flashSelected: true,
		markOptions: {
			separateWordSearch: true,
			accuracy: "exactly",
			ignorePunctuation: true,
			caseSensitive: false,
			limit: 0
		},
		highlightStyle: 'underline',
		styles: [
			{color: '#ffffff',background:'#ff00ff'},
			{color: '#000000',background:'#FFA500'},
			{color: '#ffffff',background:'#428bca'},
			{color: '#000000',background:'#FFFF00'}		
		],
		opacity:1.0,
		activeStyle: {color:'#ffffff', background:'#65FF00'},
		navBar: {
			enabled: false
		},
		findBar: {
			startOpen: false,
			showNavBar: false,
			position: 'top',
			windowType: 'docked',
			openInAllTabs: false,
			searchInAllTabs: false,
			offsets: {
				top:0,
				left:0,
				right:Number.MAX_SAFE_INTEGER,
				bottom:Number.MAX_SAFE_INTEGER
			},
			keyboardTimeout: 500,
			markOptions: {
				separateWordSearch: true,
				accuracy: "partially",
				ignorePunctuation: true,
				caseSensitive: false,
				limit: 0
			},
			scale: 1.0
		}
	},
	userStyles: 
`/* add custom styles to menus here */
/* .tile { width:64px; } */
`,
	userStylesGlobal: "",
	userStylesEnabled: false,
	enableAnimations: true,
	enableAnimationsTileSlider: false,
	
	searchBarHistoryLength: 1024,
	searchBarSuggestionsCount: 20,
	groupLabelMoreTile: false,
	autoCopy: false,
	autoCopyOnInputs:false,
	rememberLastOpenedFolder: false,
	autoPasteFromClipboard: false,
	allowHotkeysWithoutMenu: false,
	allowHotkeysOnLinks: false,
	allowHotkeysOnImages: false,
	quickMenuHoldTimeout: 250,
	quickMenuRightClickTimeout: 500,
	quickMenuCancelDeadzone:4,
	exportWithoutBase64Icons: false,
	addSearchProviderHideNotification: false,
	syncWithFirefoxSearch: false,
	contextMenuShowRecentlyUsed: false,
	contextMenuShowRecentlyUsedAsFolder:true,
	contextMenuShowRecentlyUsedIcon: true,
	recentlyUsedList: [],
	recentlyUsedListLength: 10,	
	disableNewTabSorting: false,
	contextMenuHotkeys: false,
	pageTiles: {
		rows: 3,
		columns: 4,
		enabled: false,
		grid: [],
		openMethod: "openBackgroundTab",
		paletteString: "eff0f1",
		closeOnShake: false,
		deadzone: 4
	},
	openFoldersOnHoverTimeout: 0,
	nightMode: false,
	omniboxDefaultToLastUsedEngine: false,
	omniboxLastUsedIds: [],
	omniboxSearch: "openBackgroundTab",
	omniboxPseudoDisabled: false,
	cacheIconsMaxSize: 32,
	cacheIcons: true,
	userShortcuts: [],
	shakeSensitivity: 4,
	blockList: ["moz-extension://*", "chrome://*"],
	version: "1",
	lastUpdated: 0,
	quickMenuShowRecentlyUsed: false,
	quickMenuShowHotkeysInTitle: false,
	forceOpenResultsTabsAdjacent: false,
	contextMenuRegexMatchedEngines: false,
	quickMenuRegexMatchedEngines: false,
	quickMenuToolbarRows: 1,
	searchBarToolbarRows: 1,
	sideBarToolbarRows: 1,
	groupFolderRowBreaks: false,
	quickMenuHideSeparatorsInGrid: false,
	alwaysAllowTileRearranging: false,
	contextMenuUseContextualLayout: false,
	contextMenuContextualLayoutFlattenLimit: 10,
	quickMenuDomLayout: "",
	customSearchActions: [],
	modify_mycroftproject: true,
	quickMenuUseContextualLayout: false,
	quickMenuContextualLayoutFlattenLimit: 10,
	searchEnginesManagerShowContexts: true,
	quickMenuIcon: {
		enabled: false,
		x:0,
		y:0,
		url:"icons/logo_notext.svg",
		scale:1.0
	},
	checkContextMenuEventOrder: true,
	preventDuplicateSearchTabs: false,
	quickMenuPreventPageClicks: false,
	quickMenuDeselectTextOnSearch: false,
	quickMenuMoveContextMenuMethod:"",
	incognitoTabsForgetHistory: true,
	waitOnInjectionTimeout: 15000,
	multilinesAsSeparateSearches: false,
	multilinesAsSeparateSearchesLimit: 10,
	quickMenuCancelOnMousewheel: true,
	showDescriptionsInTooltips: false,
	allowDeleteEnginesFromTileMenu: false,
	saveMenuDisplayMode: true,
	askToAddNewEngineToFirefox: true,
	ignoreSearchRedirects: true,
	quickMenuUseCascadingFolders: false,
	quickMenuCascadingFoldersHoverTimeout: 50,
	quickMenuDefaultView: "grid",
	searchBarDefaultView: "grid",
	quickMenuUseOldStyle: false, // remove
	searchBarUseOldStyle: false, // remove
	nativeAppDownloadFolder: "",
	showStatusBar: false,
	quickMenuDisabledInNewTabs: false,
	developerMode: false,
	advancedImport: false
};
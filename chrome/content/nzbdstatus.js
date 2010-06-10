//      This program is free software; you can redistribute it and/or modify
//      it under the terms of the GNU General Public License as published by
//      the Free Software Foundation; either version 3 of the License, or
//      (at your option) any later version.
//
//      This program is distributed in the hope that it will be useful,
//      but WITHOUT ANY WARRANTY; without even the implied warranty of
//      MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//      GNU General Public License for more details.
//
//      You should have received a copy of the GNU General Public License
//      along with this program; if not, write to the Free Software
//      Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston,
//      MA 02110-1301, USA.

// (c) 2010 Ben Dusinberre

// The nzbdStatusObject definition itself
function nzbdStatusObject()
{
}
// Now extend it
nzbdStatusObject.prototype = {

	// Variables
	refreshId: null, // setInterval container
	countdownId: null, // setInterval container
	refreshRate: null, // Controlled by a preference
	statusbar: null, // Shortcut
	statusicon: null, // Shortcut
	statuslabel: null, // Shortcut
	favServer: null, // Our favorite server
	servers: Array(), // Cache for the server details
	processingQueue: Array(), // Where what needs to be done is put
	processingQueueActive: false,  // So we don't try to do things twice
	handleDownloads: true,
	numServerEnabled: 0,


	// Private variables (don't touch these except thru a getter/putter)
	_preferences: Components.classes['@mozilla.org/preferences;1']
	 .getService(Components.interfaces.nsIPrefService)
	 .getBranch('extensions.nzbdstatus.'),
	_observerService: Components.classes['@mozilla.org/observer-service;1']
	 .getService(Components.interfaces.nsIObserverService),
	_processingHttp: new XMLHttpRequest(), // One httpRequest object for the processing queue
	_queueHttp: new XMLHttpRequest(), // One httpRequest object for the queue tracking
	_historyHttp: new XMLHttpRequest(), // One httpRequest object for the history monitoring

	// Getters

	// Our link to the preference service
	get preferences()
	{
		return this._preferences;
	},

	// Our link to the observer service
	get observerService()
	{
		return this._observerService;
	},

	// Ajax for little things that shouldn't conflict
	get xmlHttp()
	{
		return new XMLHttpRequest();
	},

	// Ajax for the queue only to keep conflicts to a minimum
	get queueHttp()
	{
		return this._queueHttp;
	},

	// Ajax for the history only to prevent conflicts
	get historyHttp()
	{
		return this._historyHttp;
	},

	// Ajax for the processing queue
	get processingHttp()
	{
		return this._processingHttp;
	},


	// Utility functions

	// Returns the value at the given preference from the branch in the preference property
	// @param: (string) Preference name
	// @return: (boolean, string or int) Preference value or NULL if not found
	getPreference: function(prefName)
	{
		var prefValue, prefType = this.preferences.getPrefType(prefName);
		switch (prefType)
		{
			case this.preferences.PREF_BOOL:
				prefValue = this.preferences.getBoolPref(prefName);
				break;
			case this.preferences.PREF_INT:
				prefValue = this.preferences.getIntPref(prefName);
				break;
			case this.preferences.PREF_STRING:
				prefValue = this.preferences.getCharPref(prefName);
				break;
			case this.preferences.PREF_INVALID:
			default:
				prefValue = null;
		}
		return prefValue;
	},

	// Set the given preference to the given value in the branch in the preference property
	// @param: (string) Preference name, (boolean, string or int) Preference value
	// @return: (boolean) Success in updating preference
	setPreference: function(prefName, prefValue)
	{
		var success = true, prefType = this.preferences.getPrefType(prefName);
		switch (prefType)
		{
			case this.preferences.PREF_BOOL:
				prefValue = this.preferences.setBoolPref(prefName, prefValue);
				break;
			case this.preferences.PREF_INT:
				prefValue = this.preferences.setIntPref(prefName, prefValue);
				break;
			case this.preferences.PREF_STRING:
				prefValue = this.preferences.setCharPref(prefName, prefValue);
				break;
			case this.preferences.PREF_INVALID:
			default:
				success = false;
		}
		return success;
	},

	// Applies the given XPath and returns the first single node
	selectSingleNode: function(doc, context, xpath)
	{
		var nodeList = doc.evaluate(xpath, context, null, 9 /* XPathResult.FIRST_ORDERED_NODE_TYPE */, null);
		return nodeList.singleNodeValue;
	},

	// Applies the given XPath and returns all the nodes in it
	selectNodes: function(doc, context, xpath)
	{
		var nodes = doc.evaluate(xpath, context, null, 7 /* XPathResult.ORDERED_NODE_SNAPSHOT_TYPE */, null);
		var result = new Array(nodes.snapshotLength);
		for (var i=0; i<result.length; i++)
		{
			result[i] = nodes.snapshotItem(i);
		}
		return result;
	},

	// Crawl the feed handling preferences and stick ours at the end
	addFeedHandler: function()
	{
		var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService);
		var branch = prefs.getBranch("browser.contentHandlers.types.");
		var children = branch.getChildList("", {});
		var total = children.length / 3;
		var found = false;
		for (i = 0; i < total; i++)
		{
			if (branch.getCharPref(i+'.uri') == 'chrome://nzbdstatus/content/newfeed.xul?uri=%s')
			{
				found = true;
			}
		}
		if (!found)
		{
			branch.setCharPref(total+'.title', 'nzbdStatus');
			branch.setCharPref(total+'.type', 'application/vnd.mozilla.maybe.feed');
			branch.setCharPref(total+'.uri', 'chrome://nzbdstatus/content/newfeed.xul?uri=%s');
		}
		this.setPreference('addFeedHandler', false);
	},

	convertSecondsToTime: function(seconds)
	{
		var d = new Date();
		d.setTime(seconds * 1000);
		var h = d.getUTCHours() + ((d.getUTCDate()-1) * 24);
		var m = d.getUTCMinutes();
		var s = d.getUTCSeconds();
		if (m < 10)
		{
			m = '0' + m;
		}
		if (s < 10)
		{
			s = '0' + s;
		}
		return h + ':' + m + ':' + s;
	},

	convertTimeToSeconds: function(timeString)
	{
		var timeArray = timeString.match(/(\d+)/g);
		var d = new Date();
		d.setTime(0);
		d.setUTCHours(timeArray[0]);
		d.setUTCMinutes(timeArray[1]);
		d.setUTCSeconds(timeArray[2]);
		return Math.floor(d.getTime() / 1000);
	},



	// Methods



	sendAlert: function(icon, title, message)
	{
		if ("@mozilla.org/alerts-service;1" in Components.classes)
		{
			var alertsService = Components.classes["@mozilla.org/alerts-service;1"]
			 .getService(Components.interfaces.nsIAlertsService);
			alertsService.showAlertNotification(icon, title, message, false, '', null, 'nzbdStatus');
		}
		else if ("@growl.info/notifications;1" in Components.classes)
		{
			var growl = Components.classes["@growl.info/notifications;1"]
			 .getService(Components.interfaces.grINotifications);
			growl.sendNotification('', icon, title, message, 'nzbdStatus');
		}
	},

	sendDownloadAlert: function(title, message)
	{
		if (title != '' && title != null && message != '' && message != null)
		{
			this.sendAlert('chrome://mozapps/skin/downloads/downloadIcon.png', title, message);
		}
	},

	sendErrorAlert: function(title, message)
	{
		if (title != '' && title != null && message != '' && message != null)
		{
			this.sendAlert('chrome://global/skin/icons/Error.png', title, message);
		}
	},
/*
	sendPause: function()
	{
		var sabUrl = nzbdStatus.getPreference('servers.'+this.favServer+'.url') + nzbdStatus.getPreference('pauseUrl');
		var xmlHttp = this.xmlHttp;
		xmlHttp.open('GET', sabUrl, true);
		xmlHttp.send(null);
	},

	sendResume: function()
	{
		try {

		var sabUrl = nzbdStatus.getPreference('servers.'+this.favServer+'.url') + nzbdStatus.getPreference('unpauseUrl');
		var xmlHttp = this.xmlHttp;
		xmlHttp.open('GET', sabUrl, true);
		xmlHttp.send(null);
		this.refreshStatus();

		} catch(e) { dump('sendResume error:'+e); }
	},
*//*
	loginToSAB: function()
	{

		// To prevent getting stuck in an endless loop
		if (this._askForPass)
		{
			return;
		}
		else
		{
			this._askForPass = true;
		}

		var username = this.getPreference('sabusername');
		var password = this.getPreference('sabpassword');
		var postVars = 'ma_username='+username+'&ma_password='+password;
		var sabUrl = this.getPreference('servers.'+this.favServer+'.url');
		var xmlHttp = this.queueHttp;
		xmlHttp.open('POST', sabUrl, true);
		xmlHttp.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
		xmlHttp.setRequestHeader('Content-Length', postVars.length);
		xmlHttp.onload = nzbdStatus.processLogin;
		xmlHttp.send(postVars);

	},
*//*
	processLogin: function()
	{
		var output = nzbdStatus.queueHttp.responseText;
		var tryingToLogin = (output.search(/<title>Login<\/title>/i) > -1);
		if (tryingToLogin)
		{
			// We didn't login so we'll try to read the username/password from Firefox
			var fullUrl = nzbdStatus.getPreference('servers.'+this.favServer+'.url');
			var rootUrl = 'http://' + fullUrl.split('/')[2];
			var notFound = true;
			if ("@mozilla.org/passwordmanager;1" in Components.classes)
			{
				// Password Manager exists so this is not Firefox 3
				var passwordManager = Components.classes["@mozilla.org/passwordmanager;1"]
				 .getService(Components.interfaces.nsIPasswordManager);
				var enm = passwordManager.enumerator;
				while (enm.hasMoreElements())
				{
					try
					{
						var pass = enm.getNext().QueryInterface(Components.interfaces.nsIPassword);
						if (pass.host == rootUrl)
						{
							nzbdStatus.setPreference('sabusername', pass.user);
							nzbdStatus.setPreference('sabpassword', pass.password);
							notFound = false;
							break;
						}
					}
					catch (ex)
					{
						// Will we ever reach here?
					}
				}
			}
			else if ("@mozilla.org/login-manager;1" in Components.classes)
			{
				// Login Manager exists so this is Firefox 3
				var passwordManager = Components.classes["@mozilla.org/login-manager;1"]
				 .getService(Components.interfaces.nsILoginManager);
				var logins = myLoginManager.findLogins({}, rootUrl, rootUrl, null);
				if (logins.length > 0)
				{
					nzbdStatus.setPreference('sabusername', logins[0].username);
					nzbdStatus.setPreference('sabpassword', logins[0].password);
					notFound = false;
				}
			}
			if (notFound)
			{
				// Didn't find it so we'll ask them
				window.openDialog('chrome://nzbdstatus/content/configuration.xul','nzbdnzb-prefs',
				 'chrome,dependent,titlebar,toolbar,centerscreen,resizable','nzbdnzb-sab');
			}
		}
		nzbdStatus.refreshStatus();
	},
*/
/*
	goIdle: function(serverId)
	{
		if (serverId == undefined)
		{
			serverId = this.favServer;
		}
		var widget = document.getElementById('nzbdstatus-panel-'+serverId)
		widget.getElementsByClassName('nzbdstatus-context-pause')[0].removeAttribute('checked');
		widget.getElementsByTagName('image')[0].setAttribute('src', this.getPreference('iconIdle'));
		widget.getElementsByClassName('nzbdstatus-tooltip-text')[0].setAttribute('value', '&nzbdstatus.tooltip_idle.value;');
		widget.getElementsByClassName('nzbdstatus-tooltip-text')[0].className = widget.getElementsByClassName('nzbdstatus-tooltip-text')[0].className.replace(/nzbdstatus-hidden/g, '');
		widget.getElementsByClassName('nzbdstatus-tooltip-data')[0].className += ' nzbdstatus-hidden';
		widget.getElementsByTagName('label')[0].setAttribute('value', '');

		if (this.getPreference('alwaysShowIcon'))
		{
			this.statusbar.style.visibility = 'visible';
			this.statuslabel.style.visibility = 'collapse';
		}
		else
		{
			this.statusbar.style.visibility = 'collapse';
		}
		if (this.countdownId != null)
		{
			this.countdownId = clearInterval(this.countdownId);
		}
	},

	goPaused: function(serverId)
	{
		if (serverId == undefined)
		{
			serverId = this.favServer;
		}
		var widget = document.getElementById('nzbdstatus-panel-'+serverId)
		widget.getElementsByClassName('nzbdstatus-context-pause')[0].setAttribute('checked', true);
		widget.getElementsByTagName('image')[0].setAttribute('src', this.getPreference('iconPaused'));
		widget.getElementsByClassName('nzbdstatus-tooltip-text')[0].setAttribute('value', '&nzbdstatus.tooltip_pause.value;');
		widget.getElementsByClassName('nzbdstatus-tooltip-text')[0].className = widget.getElementsByClassName('nzbdstatus-tooltip-text')[0].className.replace(/nzbdstatus-hidden/g, '');
		widget.getElementsByClassName('nzbdstatus-tooltip-data')[0].className += ' nzbdstatus-hidden';
		widget.className = widget.className.replace(/nzbdstatus-hidden/g, '');

		if (this.countdownId != null)
		{
			this.countdownId = clearInterval(this.countdownId);
		}
	},
*/
	goActive: function(serverId)
	{
		if (serverId == undefined)
		{
			serverId = this.favServer;
		}
		var widget = document.getElementById('nzbdstatus-panel-'+serverId);
		widget.getElementsByClassName('nzbdstatus-context-pause')[0].removeAttribute('checked');
		widget.getElementsByClassName('nzbdstatus-tooltip-text')[0].className += ' nzbdstatus-hidden';
		widget.getElementsByClassName('nzbdstatus-tooltip-data')[0].className = widget.getElementsByClassName('nzbdstatus-tooltip-data')[0].className.replace(/nzbdstatus-hidden/g, '');
		widget.getElementsByTagName('image')[0].setAttribute('src', this.getPreference('iconDownload'));
		widget.className = widget.className.replace(/nzbdstatus-hidden/g, '');


		if (this.getPreference('onlyShowIcon'))
		{
			document.getElementById('nzbdstatus-panel-'+serverId).getElementsByClassName('nzbdstatus-label')[0].style.visibility = 'collapse';
		}
		else
		{
			document.getElementById('nzbdstatus-panel-'+serverId).getElementsByClassName('nzbdstatus-label')[0].style.visibility = 'visible';
		}
		if (this.countdownId == null)
		{
			this.countdownId = window.setInterval(this.countdown, 1000);
		}
		//this.refreshStatus();
	},

	goActiveSoon: function()
	{
		// Have a five second delay between sending data to the daemon and asking for a refresh
		window.setTimeout(this.goActive, 5000);
	},


	historyReceived: function()
	{

return;
		var nzbHistory = nzbdStatus.historyHttp.responseText;
		if (nzbHistory == '')
		{
			return;
		}

		if (nzbHistory.search(/<title>Login<\/title>/i) > -1)
		{
			nzbdStatus.loginToSAB();
			return;
		}

		nzbHistory = nzbdStatus.historyHttp.responseXML;

		var lastBuildDate = Date.parse(nzbHistory.getElementsByTagName('lastBuildDate').item(0).firstChild.data);
		var timeNow = Date.parse(Date());
		var refreshRate = nzbdStatus.getPreference('refreshRate');
		// It hasn't updated since the last check
		if (((timeNow - lastBuildDate) / 60000) > refreshRate)
		{
			return;
		}

		var fileList = nzbHistory.getElementsByTagName('item');
		var fileCount = fileList.length;
		var pubDate, nzbDescription;
		for (i = 0; i < fileCount; i++)
		{
			pubDate = Date.parse(fileList[i].getElementsByTagName('pubDate').item(0).firstChild.data);
			// We've already checked it
			if (((timeNow - pubDate) / 60000) > refreshRate)
			{
				break;
			}
			nzbDescription = fileList[i].getElementsByTagName('description').item(0).firstChild.data;
			if ((nzbDescription.search(/Post-processing active/i) == -1) && (nzbDescription.search(/Finished at/i) > -1))
			{
				// It's finished, send an alert
				alertMessage = 'Post processing on ' + fileList[i].getElementsByTagName('title').item(i).firstChild.data + ' has finished';
				//nzbdStatus.sendAlert('chrome://nzbdstatus/skin/sabnzbd.png', 'Download Completed', alertMessage);
			}
		}

	},
/*
	queueReceived: function()
	{

		var output = nzbdStatus.queueHttp.responseText;
		if (output == '')
		{
			nzbdStatus.displayIdle();
			return;
		}

		if (output.search(/<title>Login<\/title>/i) > -1)
		{
			nzbdStatus.displayIdle();
			nzbdStatus.loginToSAB();
			return;
		}

		var status, speed, totalTimeRemain, totalMb, totalMbRemain, totalPer, curDL, curTime, curMbRemain;
		var finSpace, queue;
		if (!nzbdStatus.getPreference('legacyMode'))
		{
			try {
			queue = eval('('+output+')');
			} catch(e) { return; }
			speed = queue.kbpersec;
			totalMbRemain = queue.mbleft;
			totalMb = queue.mb;
			if (queue.noofslots > 0)
			{
				curDL = queue.jobs[0].filename.replace(/\.nzb/ig, '');
				curMbRemain = queue.jobs[0].mbleft;
			}
			finSpace = queue.diskspace1;
			if (queue.paused)
			{
				status = 'pause';
			}
		}
		else
		{
			switch (nzbdStatus.getPreference('template'))
			{
				case 'Plush':
					try {
					queue = eval('('+output.match(/nzbdStatus\s+((?:.|\s)*)\s+-->/)[1]+')');
					} catch(e) { return; }
					speed = queue.kbpersec;
					totalMbRemain = queue.mbleft;
					totalMb = queue.mb;
					if (queue.noofslots > 0)
					{
						curDL = queue.jobs[0].filename.replace(/\.nzb/ig, '');
						curMbRemain = queue.jobs[0].mbleft;
					}
					finSpace = queue.diskspace1;
					if (queue.paused == 'True')
					{
						status = 'pause';
					}
					break;
				case 'Nova 0.4':
					try {
					queue = eval('('+output+')');
					} catch(e) { return; }
					speed = queue.kbpersec;
					totalMbRemain = queue.mbleft;
					totalMb = queue.mb;
					if (queue.noofslots > 0)
					{
						curDL = queue.jobs[0].filename.replace(/\.nzb/ig, '');
						curMbRemain = queue.jobs[0].mbleft;
					}
					finSpace = queue.diskspace1;
					if (queue.paused == 'True')
					{
						status = 'pause';
					}
					break;
				case 'Nova 0.3':
					try {
					queue = eval('('+output.match(/SABNZBDJSON\s+((?:.|\s)*)\s+-->/)[1]+')');
					} catch(e) { return; }
					speed = queue.speed;
					totalMbRemain = queue.left;
					totalMb = queue.total;
					if (queue.jobs.length > 0)
					{
						curDL = queue.jobs[0].name.replace(/\.nzb/ig, '');
						curMbRemain = queue.jobs[0].left;
					}
					finSpace = queue.freecomp;
					if (queue.paused == 'True')
					{
						status = 'pause';
					}
					break;
				default:
			}
		}

		if (status == 'pause')
		{
			nzbdStatus.displayPaused();
			return;
		}
		if ((Math.floor(totalMbRemain) == 0) || speed == 0)
		{
			nzbdStatus.displayIdle();
			return;
		}

		totalPer = Math.floor((1 - (totalMbRemain / totalMb)) * 100)+'%';
		totalTimeRemain = (totalMbRemain * 1024) / speed;
		totalTimeRemain = nzbdStatus.convertSecondsToTime(totalTimeRemain);
		curTime = (curMbRemain * 1024) / speed;
		curTime = nzbdStatus.convertSecondsToTime(curTime);

		nzbdStatus.statuslabel.value = totalTimeRemain;
		document.getElementById('nzbdstatus-tooltip-0').getElementsByClassName('nzbdstatus-kbpersec')[0].value = Math.floor(speed) + ' KB/s';
		document.getElementById('nzbdstatus-tooltip-0').getElementsByClassName('nzbdstatus-mbleft')[0].setAttribute('value', totalPer);
		document.getElementById('nzbdstatus-tooltip-0').getElementsByClassName('nzbdstatus-diskspace1')[0].value = (Math.floor(finSpace * 100) / 100) + ' GB';
		document.getElementById('nzbdstatus-tooltip-0').getElementsByClassName('nzbdstatus-jobs0')[0].value = curDL;
		document.getElementById('nzbdstatus-tooltip-0').getElementsByClassName('nzbdstatus-jobs0-time')[0].value = curTime;

		nzbdStatus.goActive();

	},
*//*
	refreshStatus: function(server)
	{

		if (server == undefined)
		{
			server = this.favServer;
		}

		var queueUrl = nzbdStatus.getPreference('servers.'+server+'.url') + nzbdStatus.getPreference('queueUrl');
		nzbdStatus.queueHttp.open('GET', queueUrl, true);
		nzbdStatus.queueHttp.onload = nzbdStatus.queueReceived;
		nzbdStatus.queueHttp.send(null);

		var historyUrl = nzbdStatus.getPreference('servers.'+server+'.url') + nzbdStatus.getPreference('historyUrl');
		nzbdStatus.historyHttp.open('GET', historyUrl, true);
		nzbdStatus.historyHttp.overrideMimeType('text/xml');
		nzbdStatus.historyHttp.onload = nzbdStatus.historyReceived;
		nzbdStatus.historyHttp.send(null);

	},
*/
	sendAllToSAB: function(event)
	{
		var doc = event.originalTarget.ownerDocument;
		var siteSrc = nzbdStatus.getSiteSrc(doc);
		var results;
		switch (siteSrc)
		{
			case 'newzbin':
				results = nzbdStatus.selectNodes(doc, doc, '//tbody[contains(@class,"select")]/tr/td/img[@class="sabsend"]');
				break;
			case 'nzbsorg':
				results = nzbdStatus.selectNodes(doc, doc, '//tr[contains(@class,"selected")]/td/b/img[@class="sabsend"]');
				break;
			case 'tvnzb':
				results = nzbdStatus.selectNodes(doc, doc, '//input[@name="marked_nzb[]"]');
				break;
			case 'nzbindex':
				results = nzbdStatus.selectNodes(doc, doc, '//input[@name="r[]"]');
				break;
			default:
				return;
		}

		if (results != null && results.length > 0)
		{
			var rowcount = results.length;
			for (i = 0; i < rowcount; i++)
			{
				if ((siteSrc == 'newzbin') || (siteSrc == 'nzbsorg'))
				{
					results[i].click(event);
				}
				if (((siteSrc == 'tvnzb') || (siteSrc == 'nzbindex')) && results[i].checked)
				{
					results[i].parentNode.parentNode.getElementsByClassName('sabsend')[0].click(event);
				}
			}
		}
	},

	onNzbmatrixPageLoad: function(doc)
	{
		var results = nzbdStatus.selectNodes(doc, doc, '//a[contains(@href,"/nzb-download.php?id=")]');
		if (results.length == 0)
		{
			return;
		}
		var oldIcon, postId, newIcon, rowcount = results.length;
		for (i = 0; i < rowcount; i++)
		{
			oldIcon = results[i];
			postId = oldIcon.href.match(/nzb-download\.php\?id=(\d+)/i);
			if (postId == null)
			{
				continue;
			}
			if (oldIcon.href.match(/&nozip=1/i) != null)
			{
				continue;
			}
			postId = postId[1];
			newIcon = nzbdStatus.makeSendIcon(doc, postId);
			oldIcon.parentNode.insertBefore(newIcon, oldIcon);
		}
	},

	onTvnzbLoad: function(doc)
	{
		var results = nzbdStatus.selectNodes(doc, doc, '//a[contains(@href,"tvnzb.com/nzb/")]');
		if (results.length == 0)
		{
			return;
		}
		var sendAllButton = nzbdStatus.selectSingleNode(doc, doc, '//input[@type="submit"][@value="Download Selected NZBs"]');
		if (sendAllButton)
		{
			var allButton = nzbdStatus.makeSendAllButton(doc);
			allButton.className = sendAllButton.className;
			sendAllButton.parentNode.insertBefore(allButton, sendAllButton);
		}
		var oldIcon, postId, newIcon, rowcount = results.length;
		for (i = 0; i < rowcount; i++)
		{
			oldIcon = results[i];
			postId = oldIcon.href.match(/tvnzb\.com\/nzb\/(\d+)/i);
			if (postId == null)
			{
				continue;
			}
			postId = postId[1];
			newIcon = nzbdStatus.makeSendIcon(doc, postId);
			newIcon.style.marginRight = '.5em';
			oldIcon.parentNode.insertBefore(newIcon, oldIcon);
		}
	},

	onNzbsOrgLoad: function(doc)
	{
		var results = nzbdStatus.selectNodes(doc, doc, '//a[contains(@href,"index.php?action=view&nzbid=")]');
		if (results.length == 0)
		{
			return;
		}
		var sendAllButton = doc.getElementById('addtomynzbs');
		if (sendAllButton)
		{
			var allButton = nzbdStatus.makeSendAllButton(doc);
			allButton.className = sendAllButton.className;
			sendAllButton.parentNode.insertBefore(allButton, sendAllButton);
		}
		var oldIcon, postId, newIcon, rowcount = results.length;
		for (i = 0; i < rowcount; i++)
		{
			oldIcon = results[i];
			postId = oldIcon.href.match(/index\.php\?action=view&nzbid=(\d+)$/i);
			if (postId == null)
			{
				continue;
			}
			postId = postId[1];
			newIcon = nzbdStatus.makeSendIcon(doc, postId);
			newIcon.style.marginRight = '.5em';
			oldIcon.parentNode.insertBefore(newIcon, oldIcon);
		}
	},



	// This gets fired every time one of our observers gets tripped
	observe: function(subject, topic, data)
	{
		switch (topic)
		{
			case 'nsPref:changed':
				nzbdStatus.observePreferences(subject, topic, data);
				break;
			case 'dl-done':
				if (nzbdStatus.getPreference('enableFilesToServer'))
				{
					nzbdStatus.queueFile(subject, topic, data);
				}
				break;
			case 'nzbdStatus':
				if (data == 'startHandleDownload')
				{
					// We've been told to handle file downloads now
					nzbdStatus.handleDownloads = true;
					nzbdStatus.observerService.addObserver(nzbdStatus, 'dl-done', false);
				}
				break;
		}
	},

	// Preferences observer
	observePreferences: function(subject, topic, data)
	{
		try {

		switch (data.split('.')[0])
		{
			case 'refreshRate':
				this.refreshId = clearInterval(this.refreshId);
				this.refreshRate = this.getPreference('refreshRate');
				if (this.refreshRate < 1)
				{
					this.refreshRate = 1;
				}
				this.refreshAll();
				this.refreshId = window.setInterval(this.refreshAll, this.refreshRate*60*1000);
				break;
			case 'disabled':
				if (this.getPreference('disabled'))
				{
					this.refreshId = clearInterval(this.refreshId);
					this.countdownId = clearInterval(this.countdownId);
					this.statusbar.style.visibility = 'collapse';
				}
				else
				{
					this.displayIdle();
					this.refreshId = window.setInterval(this.refreshAll, this.refreshRate*60*1000);
				}
				break;
			case 'onlyShowIcon':
				if (this.getPreference('onlyShowIcon'))
				{
					this.statuslabel.style.visibility = 'collapse';
				}
				else
				{
					this.statuslabel.style.visibility = 'visible';
				}
				break;
			case 'enableFilesToServer':
				// This block obsolete in v2?
				break;
				if (this.handleDownloads)
				{
					if (this.getPreference('enableFilesToServer'))
					{
						this.observerService.addObserver(this, 'dl-done', false);
					}
					else
					{
						this.observerService.removeObserver(this, 'dl-done');
					}
				}
				break;
			case 'servers':
				// Something with servers changed, lets narrow it down
				var sData = data.split('.');
				if (sData)
				{
					switch (sData[1])
					{
						case 'count':
							this.loadServers();
							// Need someway to edit the widgets that've been added/removed
							break;
						case 'favorite':
							this.favServer = this.getPreference('servers.favorite');
							break;
						default:
							var sNum = sData[1].match(/\d+/);
							if (sNum && (sNum[0] = sData[1]))
							{
								this.loadDetailsOf(sNum[0]);
							}
					}
				}
				break;
		}

		} catch(e) { nzbdStatus.errorLogger('preference',e); }

	},






	// Queue a refresh request for each widget
	refreshAll: function()
	{
		try {

		for each (var i in nzbdStatus.serverOrder)
		{
			if (nzbdStatus.servers[i].enabled)
			{
				nzbdStatus.servers[i].refresh();
			}
		}

		} catch(e) { nzbdStatus.errorLogger('refreshAll',e); }
	},

	// Count down a second
	countdown: function()
	{

		var countdowners = document.getElementById('status-bar').getElementsByClassName('nzbdstatus-time');
		var timeRemain;

		for (i = 0; i < countdowners.length; i++)
		{
			timeRemain = countdowners[i].value;
			if (timeRemain == '' || timeRemain == '0:00:00')
			{
				nzbdStatus.displayIdle(i);
				continue;
			}
			timeRemain = nzbdStatus.convertTimeToSeconds(timeRemain) - 1;
			timeRemain = nzbdStatus.convertSecondsToTime(timeRemain);
			countdowners[i].value = timeRemain;
		}

	},

	// Check to see if a pause or a resume should be sent
	togglePause: function(e)
	{

		var widget = e.currentTarget.parentNode.id.match(/nzbdstatus-context-(\d)+/)[1];
		var toPause = (document.getElementById('nzbdstatus-panel-'+widget).getElementsByClassName('nzbdstatus-context-pause')[0].getAttribute('checked') != '');
		if (toPause)
		{
			nzbdStatus.queuePause(widget);
		}
		else
		{
			nzbdStatus.queueResume(widget);
		}

	},

	// Make the changes needed for when a widget is paused
	displayPaused: function(serverId)
	{
		var widget = document.getElementById('nzbdstatus-panel-'+serverId);
		widget.getElementsByClassName('nzbdstatus-context-pause')[0].setAttribute('checked', true);
		widget.getElementsByTagName('image')[0].setAttribute('src', this.getPreference('iconPaused'));
		widget.getElementsByClassName('nzbdstatus-tooltip-text')[0].setAttribute('value', '&nzbdstatus.tooltip_pause.value;');
		widget.getElementsByClassName('nzbdstatus-tooltip-text')[0].className = widget.getElementsByClassName('nzbdstatus-tooltip-text')[0].className.replace(/nzbdstatus-hidden/g, '');
		widget.getElementsByClassName('nzbdstatus-tooltip-data')[0].className += ' nzbdstatus-hidden';
		widget.getElementsByTagName('label')[0].className = widget.getElementsByTagName('label')[0].className.replace(/nzbdstatus-time/g, '');
		widget.getElementsByClassName('nzbdstatus-jobs0-time')[0].className = widget.getElementsByClassName('nzbdstatus-jobs0-time')[0].className.replace(/nzbdstatus-time/g, '');
		widget.className = widget.className.replace(/nzbdstatus-hidden/g, '');
	},

	// Make the changes needed for when a widget goes idle
	displayIdle: function(serverId)
	{
		var widget = document.getElementById('nzbdstatus-panel-'+serverId);
		if (!widget)
		{
			return;
		}
		widget.getElementsByClassName('nzbdstatus-context-pause')[0].removeAttribute('checked');
		widget.getElementsByTagName('image')[0].setAttribute('src', this.getPreference('iconIdle'));
		widget.getElementsByClassName('nzbdstatus-tooltip-text')[0].setAttribute('value', '&nzbdstatus.tooltip_idle.value;');
		widget.getElementsByClassName('nzbdstatus-tooltip-text')[0].className = widget.getElementsByClassName('nzbdstatus-tooltip-text')[0].className.replace(/nzbdstatus-hidden/g, '');
		widget.getElementsByClassName('nzbdstatus-tooltip-data')[0].className += ' nzbdstatus-hidden';
		widget.getElementsByTagName('label')[0].value = '';
		widget.getElementsByTagName('label')[0].className = widget.getElementsByTagName('label')[0].className.replace(/nzbdstatus-time/g, '');
		widget.getElementsByClassName('nzbdstatus-jobs0-time')[0].className = widget.getElementsByClassName('nzbdstatus-jobs0-time')[0].className.replace(/nzbdstatus-time/g, '');
/*
		if (this.getPreference('alwaysShowIcon'))
		{
			this.statusbar.style.visibility = 'visible';
			this.statuslabel.style.visibility = 'collapse';
		}
		else
		{
			this.statusbar.style.visibility = 'collapse';
		}
		if (this.countdownId != null)
		{
			this.countdownId = clearInterval(this.countdownId);
		}
*/
	},

	// Make the changes neeeded for when a widget goes active
	displayActive: function(serverId)
	{

		var widget = document.getElementById('nzbdstatus-panel-'+serverId);
		widget.getElementsByClassName('nzbdstatus-context-pause')[0].removeAttribute('checked');
		widget.getElementsByClassName('nzbdstatus-tooltip-text')[0].className += ' nzbdstatus-hidden';
		widget.getElementsByClassName('nzbdstatus-tooltip-data')[0].className = widget.getElementsByClassName('nzbdstatus-tooltip-data')[0].className.replace(/nzbdstatus-hidden/g, '');
		widget.getElementsByTagName('image')[0].setAttribute('src', this.getPreference('iconDownload'));
		widget.getElementsByTagName('label')[0].className += ' nzbdstatus-time';
		widget.getElementsByClassName('nzbdstatus-jobs0-time')[0].className += ' nzbdstatus-time';
		widget.className = widget.className.replace(/nzbdstatus-hidden/g, '');


		if (this.getPreference('onlyShowIcon'))
		{
			widget.getElementsByTagName('label')[0].className += ' nzbdstatus-hidden';
		}
		else
		{
			widget.getElementsByTagName('label')[0].className = widget.getElementsByTagName('label')[0].className.replace(/nzbdstatus-hidden/g, '');
		}
		if (this.countdownId == null)
		{
			this.countdownId = window.setInterval(this.countdown, 1000);
		}

	},

	queueFile: function(subject, topic, data)
	{

		try {

		var dlCom = subject.QueryInterface(Components.interfaces.nsIDownload);
		var filename = null;
		filename = dlCom.displayName;
		if (filename.search(/\.nzb$/) == -1)
		{
			// Not an NZB file
			return;
		}

		var newEvent = {
		 action: 'sendFile',
		 serverId: nzbdStatus.favServer,
		 path: dlCom.targetFile.path,
		 filename: filename,
		 deleteAfter: true
		 };
		nzbdStatus.queueEvent(newEvent);

		} catch(e) { nzbdStatus.errorLogger('queueFile',e); }

	},

	queueRefresh: function(serverId)
	{

		var newEvent = {
		 action: 'sendRefresh',
		 serverId: serverId,
		 tries: 0
		 };
		nzbdStatus.queueEvent(newEvent);

	},

	queueRefreshSoon: function(serverId)
	{
		// Have a five second delay before asking for a refresh
		window.setTimeout(function() { nzbdStatus.queueRefresh(serverId); }, 5000);
	},

	queuePause: function(serverId)
	{

		var newEvent = {
		 action: 'sendPause',
		 serverId: serverId,
		 tries: 0
		 };
		nzbdStatus.queueEvent(newEvent);

	},

	queueResume: function(serverId)
	{

		var newEvent = {
		 action: 'sendResume',
		 serverId: serverId,
		 tries: 0
		 };
		nzbdStatus.queueEvent(newEvent);

	},

	// Process a Send File event
	sendFile: function(eventDetails)
	{

		var file = Components.classes['@mozilla.org/file/local;1']
		 .createInstance(Components.interfaces.nsILocalFile);
		file.initWithPath(eventDetails.path);
		if (!file.exists())
		{
			// The file we're supposed to upload has disappeared
			return;
		}

		var fiStream = Components.classes['@mozilla.org/network/file-input-stream;1']
		 .createInstance(Components.interfaces.nsIFileInputStream);
		var siStream = Components.classes['@mozilla.org/scriptableinputstream;1']
		 .createInstance(Components.interfaces.nsIScriptableInputStream);
		var data = new String();
		fiStream.init(file, 1, 0, false);
		siStream.init(fiStream);
		data += siStream.read(-1);
		siStream.close();
		fiStream.close();

		var serverDetails = this.serverDetails[eventDetails.serverId];
		var fullUrl = serverDetails.url, requestTimeout = nzbdStatus.getPreference('servers.timeoutSecs');

		switch (serverDetails.type)
		{
			case 'sabnzbd+':
				fullUrl += 'api?mode=addfile';
				if (serverDetails.username != null || serverDetails.password != null)
				{
					fullUrl += '&ma_username='+serverDetails.username+'&ma_password='+serverDetails.password;
				}
				if (serverDetails.apikey != '')
				{
					fullUrl += '&apikey='+serverDetails.apikey;
				}
				// Optional: &cat=<category>&pp=<job-option>&script=<script>
				var d = new Date();
				var boundary = '--------' + d.getTime();
				var requestbody = '--' + boundary + '\nContent-Disposition: form-data; name="name"; filename="' +
				 eventDetails.filename + '"\n' + 'Content-Type: application/octet-stream\n\n' + data + '\n' +
				 '--' + boundary + '--\n';
				break;
			case 'hellanzb':
			case 'nzbget':
			default:
				// Something that's not been implemented yet
				dump('Unsupported server type `'+serverDetails.type+'` requested\n');
				break;
		}



		var processingHttp = nzbdStatus.processingHttp;
		processingHttp.open('POST', fullUrl, true);
		//processingHttp.setRequestHeader('Referer', serverDetails.url);
		processingHttp.setRequestHeader('Content-Type', 'multipart/form-data; boundary=' + boundary);
		processingHttp.setRequestHeader('Connection', 'close');
		processingHttp.setRequestHeader('Content-Length', requestbody.length);
		processingHttp.onload = function() { nzbdStatus.processingResponse(this.responseText, eventDetails, serverDetails) };
		serverDetails.timeout = setTimeout(function() { nzbdStatus.abortRequestProcessing(processingHttp, eventDetails, serverDetails) }, requestTimeout*1000);
		processingHttp.send(requestbody);

	},

	// Process a Send Newzbin ID event
	sendNewzbinId: function(eventDetails)
	{

		var serverDetails = this.serverDetails[eventDetails.serverId];
		var fullUrl = serverDetails.url, requestTimeout = nzbdStatus.getPreference('servers.timeoutSecs');

		switch (serverDetails.type)
		{
			case 'sabnzbd+':
				fullUrl += 'api?mode=addid&name='+eventDetails.newzbinId;
				if (serverDetails.username != null || serverDetails.password != null)
				{
					fullUrl += '&ma_username='+serverDetails.username+'&ma_password='+serverDetails.password;
				}
				if (serverDetails.apikey != '')
				{
					fullUrl += '&apikey='+serverDetails.apikey;
				}
				// Optional: &cat=<category>&pp=<job-option>&script=<script>
				break;
			case 'hellanzb':
			case 'nzbget':
			default:
				// Something that's not been implemented yet
				dump('Unsupported server type `'+serverDetails.type+'` requested\n');
				break;
		}

		var processingHttp = nzbdStatus.processingHttp;
		processingHttp.open('GET', fullUrl, true);
		processingHttp.onload = function() { nzbdStatus.processingResponse(this.responseText, eventDetails, serverDetails) };
		serverDetails.timeout = setTimeout(function() { nzbdStatus.abortRequestProcessing(processingHttp, eventDetails, serverDetails) }, requestTimeout*1000);
		processingHttp.send(null);

	},

	sendRefresh: function(eventDetails)
	{

		var serverDetails = this.serverDetails[eventDetails.serverId];
		var fullUrl = serverDetails.url, requestTimeout = nzbdStatus.getPreference('servers.timeoutSecs');

		switch (serverDetails.type)
		{
			case 'sabnzbd+':
				fullUrl += 'api?mode=qstatus&output=json';
				if (serverDetails.username != null || serverDetails.password != null)
				{
					fullUrl += '&ma_username='+serverDetails.username+'&ma_password='+serverDetails.password;
				}
				if (serverDetails.apikey != '')
				{
					fullUrl += '&apikey='+serverDetails.apikey;
				}
				// Optional: &cat=<category>&pp=<job-option>&script=<script>
				break;
			case 'hellanzb':
			case 'nzbget':
			default:
				// Something that's not been implemented yet
				dump('Unsupported server type `'+serverDetails.type+'` requested\n');
				break;
		}

		var processingHttp = nzbdStatus.processingHttp;
		processingHttp.open('GET', fullUrl, true);
		processingHttp.onload = function() { nzbdStatus.processingResponse(this.responseText, eventDetails, serverDetails) };
		serverDetails.timeout = setTimeout(function() { nzbdStatus.abortRequestProcessing(processingHttp, eventDetails, serverDetails) }, requestTimeout*1000);
		processingHttp.send(null);

	},

	sendPause: function(eventDetails)
	{

		var serverDetails = this.serverDetails[eventDetails.serverId];
		var fullUrl = serverDetails.url, requestTimeout = nzbdStatus.getPreference('servers.timeoutSecs');

		switch (serverDetails.type)
		{
			case 'sabnzbd+':
				fullUrl += 'api?mode=pause';
				if (serverDetails.username != null || serverDetails.password != null)
				{
					fullUrl += '&ma_username='+serverDetails.username+'&ma_password='+serverDetails.password;
				}
				if (serverDetails.apikey != '')
				{
					fullUrl += '&apikey='+serverDetails.apikey;
				}
				// Optional: &cat=<category>&pp=<job-option>&script=<script>
				break;
			case 'hellanzb':
			case 'nzbget':
			default:
				// Something that's not been implemented yet
				dump('Unsupported server type `'+serverDetails.type+'` requested\n');
				break;
		}

		var processingHttp = nzbdStatus.processingHttp;
		processingHttp.open('GET', fullUrl, true);
		processingHttp.onload = function() { nzbdStatus.processingResponse(this.responseText, eventDetails, serverDetails) };
		serverDetails.timeout = setTimeout(function() { nzbdStatus.abortRequestProcessing(processingHttp, eventDetails, serverDetails) }, requestTimeout*1000);
		processingHttp.send(null);

	},

	sendResume: function(eventDetails)
	{

		var serverDetails = this.serverDetails[eventDetails.serverId];
		var fullUrl = serverDetails.url, requestTimeout = nzbdStatus.getPreference('servers.timeoutSecs');

		switch (serverDetails.type)
		{
			case 'sabnzbd+':
				fullUrl += 'api?mode=resume';
				if (serverDetails.username != null || serverDetails.password != null)
				{
					fullUrl += '&ma_username='+serverDetails.username+'&ma_password='+serverDetails.password;
				}
				if (serverDetails.apikey != '')
				{
					fullUrl += '&apikey='+serverDetails.apikey;
				}
				// Optional: &cat=<category>&pp=<job-option>&script=<script>
				break;
			case 'hellanzb':
			case 'nzbget':
			default:
				// Something that's not been implemented yet
				dump('Unsupported server type `'+serverDetails.type+'` requested\n');
				break;
		}

		var processingHttp = nzbdStatus.processingHttp;
		processingHttp.open('GET', fullUrl, true);
		processingHttp.onload = function() { nzbdStatus.processingResponse(this.responseText, eventDetails, serverDetails) };
		serverDetails.timeout = setTimeout(function() { nzbdStatus.abortRequestProcessing(processingHttp, eventDetails, serverDetails) }, requestTimeout*1000);
		processingHttp.send(null);

	},

	processingResponse: function(responseStatus, eventDetails)
	{
		try {
nzbdStatus.logger('in processingResponse');

		var alertMessage, alertTitle, retryLimit = nzbdStatus.getPreference('servers.retryLimit');
		var serverDetails = nzbdStatus.servers[eventDetails.serverid];
		clearTimeout(nzbdStatus.queueTimeout);

/*
				if (eventDetails.action == 'sendRefresh')
				{
					try
					{
						var refreshObject = nzbdStatus._JSON.decode(responseText);
						responseStatus = true;
*/

		eventDetails.tries++;
		if (!responseStatus && (eventDetails.tries < retryLimit))
		{
			// Server failed to receive data and there are still retries left
			nzbdStatus.queueEvent(eventDetails);
		}
		else
		{
			// Further processing based on action
			switch (eventDetails.action)
			{
				case 'sendUrl':
					if (responseStatus)
					{
						alertMessage = serverDetails.label+' has received ';
						alertTitle = 'URL Received';
						if (eventDetails.reportname)
						{
							alertMessage += eventDetails.reportname;
						}
						else
						{
							alertMessage += 'the URL';
						}
					}
					else
					{
						alertMessage = serverDetails.label+' failed to receive the URL';
						alertTitle = serverDetails.label+' Failure Detected';
					}
					break;
				case 'sendFile':
					if (responseStatus)
					{
						alertMessage = serverDetails.label+' has received the file '+eventDetails.filename;
						alertTitle = 'File Received';
						if (eventDetails.deleteAfter)
						{
							// Delete file file now that we're done with it
							var file = Components.classes['@mozilla.org/file/local;1']
							 .createInstance(Components.interfaces.nsILocalFile);
							file.initWithPath(eventDetails.path);
							file.remove(false);
						}
					}
					else
					{
						alertMessage = serverDetails.label+' failed to receive the file '+eventDetails.filename;
						alertTitle = serverDetails.label+' Failure Detected';
					}
					break;
				case 'sendNewzbinId':
					if (responseStatus)
					{
						alertMessage = serverDetails.label+' has received Newzbin report #'+eventDetails.newzbinId;
						alertTitle = 'Newzbin Report Received';
						eventDetails.icon.style.opacity = '.25';
					}
					else
					{
						alertMessage = serverDetails.label+' failed to receive Newzbin report #'+eventDetails.newzbinId;
						alertTitle = serverDetails.label+' Failure Detected';
					}
					if (eventDetails.newzbinIdName != '')
					{
						alertMessage += ', '+eventDetails.newzbinIdName;
					}
					break;
				case 'sendRefresh':
					if (responseStatus)
					{
						nzbdStatus.processRefresh(serverDetails, refreshObject);
					}
					else
					{
						alertMessage = 'Could not retrieve data from '+serverDetails.label;
						alertTitle = serverDetails.label+' Failure Detected';
					}
					break;
				case 'sendPause':
					if (responseStatus)
					{
						nzbdStatus.displayPaused(eventDetails.serverId);
					}
					else
					{
						alertMessage = serverDetails.label+' failed to pause';
						alertTitle = serverDetails.label+' Failure Detected';
					}
					break;
				case 'sendResume':
					if (responseStatus)
					{
						nzbdStatus.displayIdle(eventDetails.serverId);
						nzbdStatus.queueRefreshSoon(eventDetails.serverId);
					}
					else
					{
						alertMessage = serverDetails.label+' failed to resume';
						alertTitle = serverDetails.label+' Failure Detected';
					}
					break;
				default:
			}
			if (responseStatus)
			{
				nzbdStatus.sendDownloadAlert(alertTitle, alertMessage);
			}
			else
			{
				nzbdStatus.sendErrorAlert(alertTitle, alertMessage);
			}
		}

		// Go do the next thing in the queue
		setTimeout(nzbdStatus.processQueue, 1);

		} catch(e) { nzbdStatus.errorLogger('processingResponse',e); }
	},

	processRefresh: function(serverDetails, refreshObject)
	{

		var paused = false, speed, totalTimeRemain, totalMb, totalMbRemain, totalPer, curDL, curTime, curMbRemain;
		var finSpace, queue;

		switch (serverDetails.type)
		{
			case 'sabnzbd+':
				speed = refreshObject.kbpersec;
				totalMbRemain = refreshObject.mbleft;
				totalMb = refreshObject.mb;
				if (refreshObject.noofslots > 0)
				{
					curDL = refreshObject.jobs[0].filename.replace(/\.nzb$/i, '');
					curMbRemain = refreshObject.jobs[0].mbleft;
				}
				finSpace = refreshObject.diskspace1;
				paused = refreshObject.paused;
				break;
			case 'hellanzb':
			case 'nzbget':
			default:
				// Something that's not been implemented yet
				dump('Unsupported server type `'+serverDetails.type+'` requested\n');
				break;
		}


		if (paused)
		{
			nzbdStatus.displayPaused(serverDetails.id);
			return;
		}
		if ((Math.floor(totalMbRemain) == 0) || speed == 0)
		{
			dump('speed:'+speed+':totalrm:'+totalMbRemain+'\n');
			nzbdStatus.displayIdle(serverDetails.id);
			return;
		}

		totalPer = Math.floor((1 - (totalMbRemain / totalMb)) * 100)+'%';
		totalTimeRemain = (totalMbRemain * 1024) / speed;
		totalTimeRemain = nzbdStatus.convertSecondsToTime(totalTimeRemain);
		curTime = (curMbRemain * 1024) / speed;
		curTime = nzbdStatus.convertSecondsToTime(curTime);

		var widget = document.getElementById('nzbdstatus-panel-'+serverDetails.id);
		widget.getElementsByTagName('label')[0].value = totalTimeRemain;
		widget.getElementsByClassName('nzbdstatus-kbpersec')[0].setAttribute('value', Math.floor(speed) + ' KB/s');
		widget.getElementsByClassName('nzbdstatus-mbleft')[0].setAttribute('value', totalPer);
		widget.getElementsByClassName('nzbdstatus-diskspace1')[0].setAttribute('value', (Math.floor(finSpace * 100) / 100) + ' GB');
		widget.getElementsByClassName('nzbdstatus-jobs0')[0].setAttribute('value', curDL);
		widget.getElementsByClassName('nzbdstatus-jobs0-time')[0].setAttribute('value', curTime);

		nzbdStatus.displayActive(serverDetails.id);

	},




/// Rewritten


	// Read the server details into the cache
	loadServers: function()
	{
		for each (var i in nzbdStatus.serverOrder)
		{
			nzbdStatus.loadDetailsOf(i);
		}
	},

	// Loads the details for a single server into the cache
	loadDetailsOf: function(serverId)
	{
		var serverType = nzbdStatus.getPreference('servers.'+serverId+'.type');
		switch (serverType)
		{
			case 'sabnzbd':
				var serverObject = new sabnzbdServerObject(serverId);
				if (serverObject.enabled)
				{
					serverObject.connect();
					nzbdStatus.numServerEnabled += 1;
				}
				break;
		}
		nzbdStatus.servers[serverId] = serverObject;
	},

	// This creates a widget for each server then sticks it into the status bar
	createAllWidgets: function()
	{
		var newWidget, templateWidget = document.getElementById('nzbdstatus-panel-template');

		for each (var i in nzbdStatus.serverOrder)
		{
			newWidget = templateWidget.cloneNode(true);
			newWidget.setAttribute('id', 'nzbdstatus-panel-'+i);
			newWidget.setAttribute('context', 'nzbdstatus-context-'+i);
			newWidget.setAttribute('tooltip', 'nzbdstatus-tooltip-'+i);
			newWidget.getElementsByTagName('tooltip')[0].setAttribute('id', 'nzbdstatus-tooltip-'+i);
			newWidget.getElementsByTagName('menupopup')[0].setAttribute('id', 'nzbdstatus-context-'+i);
			newWidget.getElementsByTagName('image')[0].setAttribute('src', 'chrome://nzbdstatus/skin/'+nzbdStatus.servers[i].icon);
			newWidget.setAttribute('hidden', 'false');
			if (!nzbdStatus.servers[i].enabled)
			{
				newWidget.setAttribute('hidden', 'true');
			}
			if (!nzbdStatus.servers[i].showInStatusBar)
			{
				newWidget.setAttribute('hidden', 'true');
			}
			templateWidget.parentNode.insertBefore(newWidget, templateWidget);
		}
	},

	// Stick each server into the context menu
	fillContextMenu: function()
	{
		var newWidget, templateWidget = document.getElementById('nzbdstatus-context-server-template');

		for each (var i in nzbdStatus.serverOrder)
		{
			newWidget = templateWidget.cloneNode(true);
			newWidget.setAttribute('id', 'nzbdstatus-context-server-'+i);
			newWidget.setAttribute('label', nzbdStatus.servers[i].label);
			newWidget.setAttribute('image', 'chrome://nzbdstatus/skin/'+nzbdStatus.servers[i].icon);
			newWidget.setAttribute('hidden', 'false');
			if (!nzbdStatus.servers[i].enabled)
			{
				newWidget.setAttribute('hidden', 'true');
			}
			templateWidget.parentNode.appendChild(newWidget);
		}
		templateWidget.setAttribute('hidden', 'true');
	},

	// A string representing the site if supported, false otherwise
	supportedSite: function(host)
	{
		if (((host.search('newzbin.com') > -1) || (host.search('newzxxx.com') > -1))
		 && (host.search('v2.newzbin.com') == -1))
		{
			return 'newzbin';
		}
		if (host.search('nzbmatrix.com') > -1)
		{
			return 'nzbmatrix';
		}
		if (host.search('tvnzb.com') > -1)
		{
			return 'tvnzb';
		}
		if (host.search('nzbs.org') > -1)
		{
			return 'nzbsorg';
		}
		if ((host.search('nzbindex.nl') > -1) || (host.search('nzbindex.com') > -1))
		{
			return 'nzbindex';
		}
		if ((host.search('binsearch.info') > -1) || (host.search('binsearch.net') > -1))
		{
			return 'binsearch';
		}
		if (host.search('animeusenet.org') > -1)
		{
			return 'animeusenet';
		}
		if (host.search('newzleech.com') > -1)
		{
			return 'newzleech';
		}
		if (host.search('albumsindex.com') > -1)
		{
			return 'albumsindex';
		}
		return false;
	},

	// A UL with the list of servers
	getServerUL: function(doc)
	{
		var serverList = doc.createElement('ul');
		serverList.id = 'nzbdserverList';
		serverList.className = 'nzbdservers tabMenu';  // TODO: This is newzbin specific, change it
		serverList.addEventListener('mouseover', function(e){var doc = e.target.ownerDocument;doc.getElementById('nzbdserverList').style.display='block';}, false);
		serverList.addEventListener('mouseout', function(e){var doc = e.target.ownerDocument;doc.getElementById('nzbdserverList').style.display='none';}, false);

		var serverItem, serverIcon, serverLink, serverDetails;
		for each (var i in nzbdStatus.serverOrder)
		{
			serverItem = doc.createElement('li');
			serverLink = doc.createElement('a');
			serverName = nzbdStatus.servers[i].label;
			serverIcon = doc.createElement('img');
			serverIcon.setAttribute('src', 'chrome://nzbdstatus/skin/'+nzbdStatus.servers[i].icon);
			serverIcon.setAttribute('alt', nzbdStatus.servers[i].label);
			serverLink.appendChild(serverIcon);
			serverLink.appendChild(doc.createTextNode(nzbdStatus.servers[i].label));
			serverItem.appendChild(serverLink);
			serverItem.className += 'nzblistentry nzbServer'+i;
			serverItem.addEventListener('click', nzbdStatus.queuePostId, false);
			if (!nzbdStatus.servers[i].enabled)
			{
				serverItem.style.display = 'none';
			}
			serverList.appendChild(serverItem);
		}
		return serverList;
	},

	// Fired when a widget is clicked on
	clickedOn: function(e)
	{
		var widgetClicked = e.currentTarget.id.match(/nzbdstatus-panel-(\d)+/)[1];
		if (e.button == 0)
		{
			var action = nzbdStatus.getPreference('leftClick');
		}
		else if (e.button == 1)
		{
			var action = nzbdStatus.getPreference('middleClick');
		}
		var url = nzbdStatus.servers[widgetClicked].url;
		/// TODO: This is sabnzbd specific, it should be changed
		switch (action)
		{
			case 'refresh':
				nzbdStatus.queueRefresh(widgetClicked);
				break;
			case 'newtab':
				getBrowser().addTab(url);
				break;
			case 'newtabfocus':
				gBrowser.selectedTab = getBrowser().addTab(url);
				break;
			case 'sametab':
				loadURI(url);
				break;
			case 'newwindow':
				window.open(url);
				break;
			case 'qnewtab':
				getBrowser().addTab(url+'queue/');
				break;
			case 'qnewtabfocus':
				gBrowser.selectedTab = getBrowser().addTab(url+'queue/');
				break;
			case 'qsametab':
				loadURI(url+'queue/');
				break;
			case 'qnewwindow':
				window.open(url+'queue/');
				break;
		}
	},

	// A send all button
	makeSendAllButton: function(doc)
	{
		var allButton = doc.createElement('input');
		allButton.setAttribute('type', 'button');
		allButton.setAttribute('value', nzbdStatus.stringsBundle.getString('sendAllReports'));
		allButton.addEventListener('click', nzbdStatus.sendAllToServer, false);
		return allButton;
	},

	// Makes the one click icon
	makeSendIcon: function(doc, url)
	{
		try {
		var sendIcon = doc.createElement('img');
		sendIcon.setAttribute('src', 'chrome://nzbdstatus/skin/oneclick.png');
		sendIcon.setAttribute('data-url', url);
		sendIcon.className = 'nzboneclick nzbServer0';  // TODO: make this fav / first server?
		sendIcon.title = 'Send to Server';
		sendIcon.addEventListener('click', nzbdStatus.queuePostId, false);
		if (nzbdStatus.numServerEnabled > 1)
		{
			sendIcon.addEventListener('mouseover', nzbdStatus.showServerList, false);
			sendIcon.addEventListener('mouseout', nzbdStatus.hideServerList, false);
		}
		return sendIcon;
		} catch(e) { nzbdStatus.errorLogger('makeSendIcon',e); }
	},

	contextSupported: function()
	{
		try {

		var href = false;
		if (gContextMenu && gContextMenu.getLinkURL)
		{
			href = gContextMenu.getLinkURL();
		}
		else if (gContextMenu && gContextMenu.linkURL)
		{
			href = gContextMenu.linkURL();
		}
		if (!href)
		{
			// Couldn't obtain a link
			return false;
		}
		var siteAt = nzbdStatus.supportedSite(href);
		switch (siteAt)
		{
			case 'newzbin':
				return (href.search(/newz(bin|xxx)\.com\/browse\/post\/(\d+)/i) > -1);
				break;
			case 'nzbmatrix':
				return (href.search(/nzbmatrix\.com\/nzb-d(ownload|etails).php\?id=(\d+)/i) > -1);
				break;
			case 'tvnzb':
				return (href.search(/tvnzb\.com\/nzb\/(\d+)/i) > -1);
				break;
			case 'nzbsorg':
				return (href.search(/nzbs\.org\/index\.php\?.*nzbid=(\d+)/i) > -1);
				break;
			case 'nzbindex':
				return (href.search(/nzbindex\.(nl|com)\/download\/(\d+)/i) > -1);
				break;
			case 'binsearch':
				return (href.search(/tvnzb\.com\/nzb\/(\d+)/i) > -1);
				break;
			case 'animeusenet':
				return (href.search(/animeusenet\.org\/.*\/(\d+)/i) > -1);
				break;
			case 'newzleech':
				return (href.search(/newzleech\.com\/\?m=gen&dl=1&post=(\d+)/i) > -1);
				break;
			case 'albumsindex':
				return (href.search(/albumsindex\.com\/(nzb\/)?(\d+)/i) > -1);
				break;
		}

		return (href.match(/\.nzb$/i) || href.match(/\.nzb\.zip$/i) || href.match(/\.nzb\.gz$/i) || href.match(/\.nzb\.rar$/i));

		} catch(e) { nzbdStatus.errorLogger('contextSupported',e); }
	},


	///
	/// Page load functions
	///

	// This happens every page load
	onPageLoad: function(event)
	{
		try {

		var doc = event.originalTarget;
		if (!doc.location && !doc.location.host)
		{
			return;
		}

		// Quickly try to get out of doing anything
		var siteAt = nzbdStatus.supportedSite(doc.location.host);
		if (!siteAt)
		{
			return;
		}

		if (nzbdStatus.numServerEnabled > 1)
		{
			// Insert the CSS needed to style our menu
			var oneclickCSS = doc.createElement('link');
			oneclickCSS.rel = 'stylesheet';
			oneclickCSS.type = 'text/css';
			oneclickCSS.href = 'chrome://nzbdstatus/content/oneclick.css';
			doc.getElementsByTagName('head')[0].appendChild(oneclickCSS);
			doc.getElementsByTagName('body')[0].appendChild(nzbdStatus.getServerUL(doc));
		}

		switch (siteAt)
		{
			case 'newzbin':
				nzbdStatus.onNewzbinPageLoad(doc);
				break;
			case 'nzbmatrix':
				nzbdStatus.onNzbmatrixPageLoad(doc);
				break;
			case 'tvnzb':
				nzbdStatus.onTvnzbLoad(doc);
				break;
			case 'nzbsorg':
				nzbdStatus.onNzbsOrgLoad(doc);
				break;
			case 'nzbindex':
				nzbdStatus.onNzbIndexLoad(doc);
				break;
			case 'binsearch':
				nzbdStatus.onBinSearchLoad(doc);
				break;
			case 'animeusenet':
				nzbdStatus.onAnimeUsenetLoad(doc);
				break;
			case 'newzleech':
				nzbdStatus.onNewzleechLoad(doc);
				break;
			case 'albumsindex':
				nzbdStatus.onAlbumsindexLoad(doc);
				break;
		}

		} catch(e) { nzbdStatus.errorLogger('onPageLoad',e); }
	},

	// newzbin.com and newzxxx.com
	onNewzbinPageLoad: function(doc)
	{
		var loggedIn = nzbdStatus.selectSingleNode(doc, doc, '//a[contains(@href,"/account/logout/")]');
		if (!loggedIn)
		{
			// Not logged in so drop out because they probably don't have a NewzBin account
			return;
		}
		results = nzbdStatus.selectNodes(doc, doc, '//form[@id="PostEdit"][contains(@action,"/browse/post/")]');
		if (results != null && results.length > 0)
		{
			nzbdStatus.onNewzbinReportDetailMode(doc);
			return;
		}
		results = nzbdStatus.selectNodes(doc, doc, '//a[contains(@href, "/nzb")][@title="Download report NZB"]');
		if (results != null && results.length > 0)
		{
			nzbdStatus.onNewzbinReportMode(doc);
			return;
		}
		results = nzbdStatus.selectNodes(doc, doc, '//form[contains(@action,"/database/fileactions/")]');
		if (results != null && results.length > 0)
		{
			nzbdStatus.onNewzbinRawMode(doc);
			return;
		}
	},

	// nzbindex.nl and nzbindex.com
	onNzbIndexLoad: function(doc)
	{
		var results = nzbdStatus.selectNodes(doc, doc, '//a[contains(@href,"/download/")]');
		if (results.length == 0)
		{
			return;
		}
		var sendAllButton = nzbdStatus.selectSingleNode(doc, doc, '//input[@type="submit"][@value="Create NZB"]');
		if (sendAllButton)
		{
			var allButton = nzbdStatus.makeSendAllButton(doc);
			allButton.className = sendAllButton.className;
			sendAllButton.parentNode.insertBefore(allButton, sendAllButton);
			sendAllButton.parentNode.insertBefore(doc.createTextNode(' '), sendAllButton);
		}
		var reportname = null, url, oldIcon, postId, newIcon, rowcount = results.length;
		for (i = 0; i < rowcount; i++)
		{
			oldIcon = results[i];
			postId = oldIcon.href.match(/(nzbindex\.(nl|com)\/download\/(.*)\/(.*))$/i);
			if (postId == null)
			{
				continue;
			}
			results[i].parentNode.parentNode.parentNode.parentNode.addEventListener('click', nzbdStatus.rowClick, false);
			url = 'http://'+postId[1];
			newIcon = nzbdStatus.makeSendIcon(doc, url);
			reportname = oldIcon.parentNode.parentNode.parentNode.getElementsByTagName('label');
			if (reportname)
			{
				if (reportname[0].textContent.match(/"(.*)"/))
				{
					reportname = reportname[0].textContent.match(/"(.*)"/)[1];
				}
			}
			newIcon.setAttribute('data-name', reportname);
			dlLink = oldIcon.parentNode.parentNode.parentNode.parentNode.getElementsByClassName('firstcolumn')[0];
			dlLink.appendChild(newIcon);
		}
	},

	// binsearch.info and binsearch.net
	onBinSearchLoad: function(doc)
	{
		var results = nzbdStatus.selectNodes(doc, doc, '//table[@id="r2"]//input[@type="checkbox"]');
		if (results.length == 0)
		{
			return;
		}
		var sendAllButton = nzbdStatus.selectSingleNode(doc, doc, '//form[@name="r"]//input[@class="b"]');
		if (sendAllButton)
		{
			var allButton = nzbdStatus.makeSendAllButton(doc);
			allButton.className = sendAllButton.className;
			sendAllButton.parentNode.insertBefore(allButton, sendAllButton);
			sendAllButton.parentNode.insertBefore(doc.createTextNode(' '), sendAllButton);
		}
		var reportname = null, url, oldIcon, postId, newIcon, rowcount = results.length, domain = doc.location.host.match(/binsearch\.(.*)/)[1];
		for (i = 0; i < rowcount; i++)
		{
			oldIcon = results[i];
			postId = oldIcon.name.match(/(\d+)/);
			if (postId == null)
			{
				continue;
			}
			results[i].parentNode.parentNode.addEventListener('click', nzbdStatus.rowClick, false);
			url = 'http://binsearch.'+domain+'/?action=nzb&'+postId[1]+'=1';
			newIcon = nzbdStatus.makeSendIcon(doc, url);
			reportname = oldIcon.parentNode.parentNode.getElementsByClassName('s');
			if (reportname)
			{
				if (reportname[0].textContent.match(/"(.*)"/))
				{
					reportname = reportname[0].textContent.match(/"(.*)"/)[1];
				}
			}
			newIcon.setAttribute('data-name', reportname);
			oldIcon.parentNode.style.whiteSpace = 'nowrap';
			oldIcon.parentNode.appendChild(newIcon);
		}
	},

	// animeusenet.org
	onAnimeUsenetLoad: function(doc)
	{
		var results = nzbdStatus.selectNodes(doc, doc, '//a[contains(@href,"/nzb/")]');
		if (results.length == 0)
		{
			return;
		}
		var reportname = null, url, oldIcon, postId, newIcon, rowcount = results.length;
		for (i = 0; i < rowcount; i++)
		{
			oldIcon = results[i];
			postId = oldIcon.href.match(/animeusenet\.org\/nzb\/(\d+)/i);
			if (postId == null)
			{
				continue;
			}
			url = 'http://www.animeusenet.org/nzb/'+postId[1]+'/download/';
			newIcon = nzbdStatus.makeSendIcon(doc, url);
			reportname = oldIcon.parentNode.parentNode.parentNode.getElementsByClassName('normaltext');
			if (reportname)
			{
				if (reportname[0].textContent.match(/"(.*)"/))
				{
					reportname = reportname[0].textContent.match(/"(.*)"/)[1];
				}
			}
			newIcon.setAttribute('data-name', reportname);
			newIcon.setAttribute('data-category', 'anime');
			oldIcon.parentNode.insertBefore(newIcon, oldIcon);
		}
	},

	// newzleech.com
	onNewzleechLoad: function(doc)
	{
		var results = nzbdStatus.selectNodes(doc, doc, '//td[@class="check"]/input[@name="binary[]"]');
		if (results.length == 0)
		{
			return;
		}
		var sendAllButton = nzbdStatus.selectSingleNode(doc, doc, '//input[@name="getnzb"]');
		if (sendAllButton)
		{
			var allButton = nzbdStatus.makeSendAllButton(doc);
			allButton.className = sendAllButton.className;
			sendAllButton.parentNode.insertBefore(allButton, sendAllButton);
			sendAllButton.parentNode.insertBefore(doc.createTextNode(' '), sendAllButton);
		}
		var reportname = null, url, oldIcon, postId, newIcon, rowcount = results.length;
		for (i = 0; i < rowcount; i++)
		{
			oldIcon = results[i];
			postId = oldIcon.value.match(/(\d+)/);
			if (postId == null)
			{
				continue;
			}
			url = 'http://www.newzleech.com/?m=gen&dl=1&post='+postId[1];
			newIcon = nzbdStatus.makeSendIcon(doc, url);
			reportname = oldIcon.parentNode.parentNode.getElementsByClassName('subject');
			if (reportname)
			{
				if (reportname[0].textContent.match(/"(.*)"/))
				{
					reportname = reportname[0].textContent.match(/"(.*)"/)[1];
				}
			}
			newIcon.setAttribute('data-name', reportname);
			oldIcon.parentNode.style.whiteSpace = 'nowrap';
			oldIcon.parentNode.appendChild(newIcon);
		}
	},

	// albumsindex.com
	onAlbumsindexLoad: function(doc)
	{
		var results = nzbdStatus.selectNodes(doc, doc, '//div[@id="content"]/div/*/a');
		if (results.length == 0)
		{
			return;
		}
		var filename, url, oldIcon, postId, newIcon, rowcount = results.length;
		for (i = 0; i < rowcount; i++)
		{
			oldIcon = results[i];
			if (oldIcon.textContent.search(/download/i) == -1)
			{
				continue;
			}
			postId = oldIcon.href.match(/\/(\d+)/);
			if (postId == null)
			{
				continue;
			}
			if (oldIcon.parentNode.getElementsByClassName('res_album').length > 0)
			{
				filename = oldIcon.parentNode.getElementsByClassName('res_artist')[0].textContent + ' - ' + oldIcon.parentNode.getElementsByClassName('res_album')[0].textContent;
			}
			else if (doc.getElementsByTagName('h1').length > 1)
			{
				filename = doc.getElementsByTagName('h1')[1].textContent;
			}
			else
			{
				filename = 'albumsindex';
			}
			url = 'http://www.albumsindex.com/nzb/'+postId[1]+'/'+encodeURIComponent(filename)+'.nzb';
			newIcon = nzbdStatus.makeSendIcon(doc, url);
			newIcon.setAttribute('data-category', 'music');
			newIcon.setAttribute('data-name', filename);
			newIcon.style.marginRight = '.5em';
			oldIcon.parentNode.insertBefore(newIcon, oldIcon);
		}
	},

	// Newzbin's individual report view
	onNewzbinReportDetailMode: function(doc)
	{
		var isFinished = nzbdStatus.selectSingleNode(doc, doc, '//img[@title="Report is complete"]');
		if (isFinished == null)
		{
			return;
		}
		var postId = doc.location.pathname.match(/(\d+)/)[1];
		var newIcon = nzbdStatus.makeSendIcon(doc, postId);
		isFinished.parentNode.insertBefore(newIcon, isFinished);
		isFinished.parentNode.insertBefore(doc.createTextNode('\t'), isFinished);
	},

	// Newzbin's report mode
	onNewzbinReportMode: function(doc)
	{
		try {
		// Add our send all reports button
		var results = nzbdStatus.selectSingleNode(doc, doc, '//input[@name="add_to_bookmarks"]');
		if (results != null)
		{
			results.parentNode.insertBefore(nzbdStatus.makeSendAllButton(doc), results);
		}
		var results = nzbdStatus.selectNodes(doc, doc, '//form/table/tbody[not(@class="dateLine")]');  // Can't really make it any more specific and have it work in lite and regular still
		if (results.length == 1 && (results[0].textContent.search('No results') > -1))
		{
			return;
		}
		var row, postId, sendTo, oldTo, rowcount = results.length;
		for (i = 0; i < rowcount; i++)
		{
			row = results[i];
			row.addEventListener('click', nzbdStatus.rowClick, false);
			oldTo = nzbdStatus.selectSingleNode(doc, row, 'tr/td/a[@title="Download report NZB"]');
			if (oldTo == null)
			{
				continue;
			}
			postId = oldTo.href.match(/post\/(\d+)\//);
			postId = postId[1];
			sendTo = nzbdStatus.makeSendIcon(doc, postId);
			oldTo.parentNode.replaceChild(sendTo, oldTo);
		}
		} catch(e) { nzbdStatus.errorLogger('onNewzbinReportMode',e); }
	},

	// Newzbin's raw / condensed mode
	onNewzbinRawMode: function(doc)
	{
		try {
		// Add our send all reports button
		var results = nzbdStatus.selectSingleNode(doc, doc, '//input[@value="Create NZB"]');
		if (results != null)
		{
			results.parentNode.insertBefore(nzbdStatus.makeSendAllButton(doc), results);
		}
		var results = nzbdStatus.selectNodes(doc, doc, '//form[contains(@action,"/database/fileactions/")]//table/tbody[not(@class="dateLine")]');
		if (results.length == 1 && (results[0].textContent.search('No results') > -1))
		{
			return;
		}
		var row, postId, sendTo, oldTo, rowcount = results.length;
		for (i = 0; i < rowcount; i++)
		{
			row = results[i];
			row.addEventListener('click', nzbdStatus.rowClick, false);
			oldTo = nzbdStatus.selectSingleNode(doc, row, 'tr/td/a[contains(@title,"Assigned")]');
			if (oldTo != null)
			{
				postId = oldTo.href.match(/post\/(\d+)\//)[1];
				sendTo = nzbdStatus.makeSendIcon(doc, postId);
				oldTo.parentNode.insertBefore(sendTo, oldTo);
				oldTo.parentNode.insertBefore(doc.createTextNode('\t'), oldTo);
				oldTo.parentNode.insertBefore(doc.createTextNode('\t'), oldTo);
				oldTo.parentNode.style.whiteSpace = 'nowrap';
			}
		}
		} catch(e) { nzbdStatus.errorLogger('onNewzbinRawMode',e); }
	},


	///
	/// Events that get fired from the client
	///

	// Runs when the context menu popup opens
	contextPopupShowing: function()
	{
		if (gContextMenu && gContextMenu.onLink && nzbdStatus.contextSupported())
		{
			document.getElementById('nzbdstatus-context-sendlink').hidden = false;
		}
		else
		{
			document.getElementById('nzbdstatus-context-sendlink').hidden = true;
		}
	},

	// When clicking anywhere on the row, check the box so the row is selected
	rowClick: function(e)
	{
		var nodeName = e.target.nodeName.toLowerCase();
		if ((nodeName == 'input') || (nodeName == 'img') || (nodeName == 'a'))
		{
			return;
		}
		e.currentTarget.getElementsByTagName('input')[0].click();
	},

	// Show the server list just right of the one click icon
	showServerList: function(e)
	{
		var doc = e.target.ownerDocument, targ = e.target;
		var sList = doc.getElementById('nzbdserverList');
		sList.setAttribute('data-url', targ.getAttribute('data-url'));
		sList.setAttribute('data-category', targ.getAttribute('data-category'));
		sList.setAttribute('data-name', targ.getAttribute('data-name'));
		sList.style.display = 'block';
		sList.style.left = (e.originalTarget.x + targ.offsetWidth) + 'px';
		sList.style.top = (e.originalTarget.y - Math.floor((sList.offsetHeight - targ.offsetHeight) / 2)) + 'px';
		return;
	},

	// Hide the server list
	hideServerList: function(e)
	{
		var doc = e.target.ownerDocument;
		var sList = doc.getElementById('nzbdserverList');
		sList.style.display = 'none';
		return;
	},

	// Fired when a send all button is clicked on
	sendAllToServer: function(event)
	{
		try{
		var params = {servers:[], out:null};
		for each (var i in nzbdStatus.serverOrder)
		{
			if (nzbdStatus.servers[i].enabled)
			{
				params.servers[i] = {};
				params.servers[i].label = nzbdStatus.servers[i].label;
				params.servers[i].icon = nzbdStatus.servers[i].icon;
			}
		}

		window.openDialog("chrome://nzbdstatus/content/multisend.xul", "", "chrome, dialog, modal, resizable=no", params).focus();

		var doc = event.originalTarget.ownerDocument;
		switch (nzbdStatus.supportedSite(doc.location.host))
		{
			case 'newzbin':
				results = nzbdStatus.selectNodes(doc, doc, '//tbody[contains(@class,"select")]/tr/td/img[@class="sabsend"]');
				break;
			case 'nzbsorg':
				results = nzbdStatus.selectNodes(doc, doc, '//tr[contains(@class,"selected")]/td/b/img[@class="sabsend"]');
				break;
			case 'tvnzb':
				results = nzbdStatus.selectNodes(doc, doc, '//input[@name="marked_nzb[]"]');
				break;
			case 'nzbindex':
				results = nzbdStatus.selectNodes(doc, doc, '//input[@name="r[]"]');
				break;
			default:
				return;
		}

		if (results != null && results.length > 0)
		{
			var rowcount = results.length;
			for (i = 0; i < rowcount; i++)
			{
				if ((siteSrc == 'newzbin') || (siteSrc == 'nzbsorg'))
				{
					results[i].click(event);
				}
				if (((siteSrc == 'tvnzb') || (siteSrc == 'nzbindex')) && results[i].checked)
				{
					results[i].parentNode.parentNode.getElementsByClassName('sabsend')[0].click(event);
				}
			}
		}

		} catch(e) { nzbdStatus.errorLogger('sendAllToServer',e); }
	},


	///
	/// Methods for adding to the queue
	///

	// Queue up a one click request
	queuePostId: function(e)
	{
		try {

		var doc = e.target.ownerDocument, targ = e.target;
		var url = null, serverid = null, category = null, reportname = null;
		if (targ.className.match(/nzboneclick/))
		{
			url = targ.getAttribute('data-url');
			category = targ.getAttribute('data-category');
			reportname = targ.getAttribute('data-name');
			serverid = targ.className.match(/nzbServer([0-9]+)/)[1];
		}
		else
		{
			var datarow = targ;
			if (targ.nodeName.toUpperCase() == 'A')
			{
				datarow = targ.parentNode;
			}
			else if (targ.nodeName.toUpperCase() == 'IMG')
			{
				datarow = targ.parentNode.parentNode;
			}
			if (datarow.className.match(/nzblistentry/))
			{
				url = doc.getElementById('nzbdserverList').getAttribute('data-url');
				category = doc.getElementById('nzbdserverList').getAttribute('data-category');
				reportname = doc.getElementById('nzbdserverList').getAttribute('data-name');
				if (datarow.className.match(/nzbServer([0-9]+)/))
				{
					serverid = datarow.className.match(/nzbServer([0-9]+)/)[1];
				}
			}
			else
			{
				return false;
			}
		}

		if (url == null || serverid == null)
		{
			return false;
		}

		var siteSrc = nzbdStatus.supportedSite(doc.location.host);
		switch (siteSrc)
		{
			case 'newzbin':
				url = 'http://www.newzbin.com/browse/post/' + url + '/';
				break;
			case 'nzbmatrix':
				url = 'http://nzbmatrix.com/nzb-details.php?id=' + url;
				break;
			case 'tvnzb':
				url = 'http://tvnzb.com/nzb/'+url;
				break;
			case 'nzbsorg':
				var rssLink = nzbdStatus.selectSingleNode(doc, doc, '//link[@type="application/rss+xml"]');
				var details = rssLink.href.match(/rss\.php\?.*&i=(\d+)&h=(\w+)/);
				if (details)
				{
					url = 'http://nzbs.org/index.php?action=getnzb&nzbid='+url+'&i='+details[1]+'&h='+details[2];
				}
				break;
		}

		var newEvent = {
		 action: 'sendUrl',
		 serverid: serverid,
		 category: category,
		 url: url,
		 reportname: reportname,
		 icon: nzbdStatus.selectSingleNode(doc, doc, '//img[@data-url="'+url+'"]'),
		 tries: 0,
		 callback: nzbdStatus.processingResponse
		 };
		nzbdStatus.queueEvent(newEvent);

		} catch(e) { nzbdStatus.errorLogger('queuePostId',e); }
	},

	// Queue up a right click request
	queueUrl: function(e)
	{
		try {

		var serverid, category;
		// I stole this if/else block from somewhere, I don't know what it means
		if (gContextMenu && gContextMenu.getLinkURL)
		{
			var href = gContextMenu.getLinkURL();
		}
		else if (gContextMenu && gContextMenu.linkURL)
		{
			var href = gContextMenu.linkURL();
		}
		// We wern't able to obtain a link that they clicked on, so give up
		if (!href)
		{
			return false;
		}
		// Which server in the menu did they select
		if (e.target.id.match(/nzbdstatus-context-server-(\d+)/))
		{
			serverid = e.target.id.match(/nzbdstatus-context-server-(\d+)/)[1];
		}

		/// TODO: Some sort of thing to modify urls that need it

		var newEvent = {
		 action: 'sendUrl',
		 serverid: serverid,
		 url: href,
		 icon: gContextMenu.target,
		 tries: 0,
		 callback: nzbdStatus.processingResponse
		 };
		nzbdStatus.queueEvent(newEvent);

		} catch(e) { nzbdStatus.errorLogger('queueUrl',e); }
	},

	// Add an event to the end of the event queue
	queueEvent: function(newEvent)
	{
		nzbdStatus.logger('in queueEvent');
		nzbdStatus.processingQueue.push(newEvent);
		if (!nzbdStatus.processingQueueActive)
		{
			nzbdStatus.processingQueueActive = true;
			setTimeout(nzbdStatus.processQueue, 1); // Send this off so we can go about our day
		}
	},


	///
	/// Methods for processing the queue
	///

	// Do the oldest thing in the event queue
	processQueue: function()
	{
		try {

		if (nzbdStatus.processingQueue.length > 0)
		{
			var currentEvent = nzbdStatus.processingQueue.shift();
			nzbdStatus.logger('action: '+currentEvent.action);
			switch (currentEvent.action)
			{
				case 'sendUrl':
					nzbdStatus.sendUrl(currentEvent);
					break;
				case 'sendFile':
					nzbdStatus.sendFile(currentEvent);
					break;
				case 'sendRefresh':
					nzbdStatus.sendRefresh(currentEvent);
					break;
				case 'sendPause':
					nzbdStatus.sendPause(currentEvent);
					break;
				case 'sendResume':
					nzbdStatus.sendResume(currentEvent);
					break;
				default:
					// Something that's not been implemented yet
					nzbdStatus.logger('Unsupported action `'+currentEvent.action+'` requested\n');
					break;
			}
		}
		else
		{
			nzbdStatus.logger('nothing in queue; '+nzbdStatus.processingQueue.length);
			nzbdStatus.processingQueueActive = false;
		}

		} catch(e) { nzbdStatus.errorLogger('processQueue',e); }
	},

	// Abort the last item to be done
	abortRequestProcessing: function(eventDetails)
	{
		var server = nzbdStatus.servers[eventDetails.serverid];
		server.abortLastSend();
		nzbdStatus.processingResponse(false, eventDetails)
	},

	// Process a Send URL event
	sendUrl: function(eventDetails)
	{
		nzbdStatus.logger('in sendUrl');
		var server = nzbdStatus.servers[eventDetails.serverid];
		requestTimeout = nzbdStatus.getPreference('servers.timeoutSecs'); // TODO: server.timeout
		nzbdStatus.queueTimeout = setTimeout(function() { nzbdStatus.abortRequestProcessing(eventDetails) }, requestTimeout*1000);
		server.sendUrl(eventDetails);
	},



	///
	/// Startup and Shutdown methods
	///

	// Statup stuff here like initialization and starting of timers
	startup: function()
	{
		try {

		// Localization hook
		nzbdStatus.stringsBundle = document.getElementById("nzbstatus-string-bundle");

		// Add in our RSS feed handler
		if (nzbdStatus.getPreference('addFeedHandler'))
		{
			nzbdStatus.addFeedHandler();
		}

		// Load up some preferences into the object
		nzbdStatus.refreshRate = nzbdStatus.getPreference('refreshRate');
		nzbdStatus.serverOrder = nzbdStatus.getPreference('servers.order').split(',');

		// Load up the server details into the cache
		nzbdStatus.loadServers();

		// Create the additional widgets for the status bar (if needed)
		nzbdStatus.createAllWidgets();
		// Add the servers to the context menu
		nzbdStatus.fillContextMenu();

		// Check to see if we need to put an observer on the download manager
		var dlObs = nzbdStatus.observerService.enumerateObservers('nzbdStatus');
		if (!dlObs.hasMoreElements())
		{
			// It's just us, so toss on an observer for downloads
			nzbdStatus.observerService.addObserver(nzbdStatus, 'dl-done', false);
		}
		else
		{
			// There's someone else out there, we'll let them handle it
			nzbdStatus.handleDownloads = false;
		}
		// We observe our channel for other instances
		nzbdStatus.observerService.addObserver(nzbdStatus, 'nzbdStatus', false);

		// Put an observer on the preferences
		nzbdStatus.preferences.QueryInterface(Components.interfaces.nsIPrefBranch2);
		nzbdStatus.preferences.addObserver('', nzbdStatus, false);

		// Add a listener to the context menu
		var menu = document.getElementById('contentAreaContextMenu');
		menu.addEventListener('popupshowing', nzbdStatus.contextPopupShowing, false);

		// Add the onload handler
		var appcontent = document.getElementById('appcontent');   // browser
		if (appcontent)
		{
			appcontent.addEventListener('load', nzbdStatus.onPageLoad, true);
		}

		// Start the monitors
		nzbdStatus.refreshAll();
		nzbdStatus.refreshId = window.setInterval(nzbdStatus.refreshAll, nzbdStatus.refreshRate*60*1000);

		} catch(e) { nzbdStatus.errorLogger('startup',e); }
	},

	// Shutdown stuff done here like removing observers
	shutdown: function()
	{
		this.preferences.removeObserver('', this);
		this.observerService.removeObserver(this, 'nzbdStatus');
		if (this.handleDownloads)
		{
			var dlObs = observerService.enumerateObservers('nzbdStatus')
			if (dlObs.hasMoreElements())
			{
				var otherWindow = dlObs.getNext().QueryInterface(Components.interfaces.nsIObserver);
				otherWindow.notify(null, 'nzbdStatus', 'startHandleDownload');
			}
			this.observerService.removeObserver(this, 'dl-done');
		}
	},


	///
	/// Logger functions
	///

	// Outputting of errors happens here
	errorLogger: function(fName, error)
	{
		if (!nzbdStatus.getPreference('showErrors'))
		{
			return;
		}
		var msg = fName + ' threw error `' + error.message + '` on line: ' + error.lineNumber + '\n';
		switch (nzbdStatus.getPreference('errorMode'))
		{
			case 0: // alert
				alert(msg);
				break;
			case 1: // dump
				dump(msg);
				break;
			case 2: // console.log
				console.log(msg);
				break;
		}
	},

	// Outputting of log messages happens here
	logger: function(msg)
	{
		if (!nzbdStatus.getPreference('showLogger'))
		{
			return;
		}
		switch (nzbdStatus.getPreference('loggerMode'))
		{
			case 0: // alert
				alert(msg);
				break;
			case 1: // dump
				dump(msg+'\n');
				break;
			case 2: // console.log
				console.log(msg);
				break;
		}
	}

}

nzbdStatus = new nzbdStatusObject();

if (nzbdStatus && !nzbdStatus.getPreference('disabled'))
{
	dump('nzbdStatus Loaded\n');
	window.addEventListener('load', function(e) { nzbdStatus.startup(); }, false);
	window.addEventListener('unload', function(e) { nzbdStatus.shutdown(); }, false);
}
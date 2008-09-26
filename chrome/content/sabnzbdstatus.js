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

// Originally based off inpheaux's SABnzbd/Newzbin Greasemonkey script, has deviated a bit since then
// (c) 2008 Ben Dusinberre

// The nzbdStatusObject definition itself
function nzbdStatusObject()
{
}
// Now extend it
nzbdStatusObject.prototype = {

	// Public variables
	refreshId: null, // setInterval container
	countdownId: null, // setInterval container
	refreshRate: null, // Controlled by a preference
	statusbar: null, // Shortcut
	statusicon: null, // Shortcut
	statuslabel: null, // Shortcut

	processingQueue: Array(), // Where what needs to be done is put
	processingQueueActive: false,  // So we don't try to do things twice


	// Private variables
	_preferences: Components.classes['@mozilla.org/preferences;1']
	 .getService(Components.interfaces.nsIPrefService)
	 .getBranch('extensions.nzbdstatus.'),
	_observerService: Components.classes['@mozilla.org/observer-service;1']
	 .getService(Components.interfaces.nsIObserverService),
	_askForPass: false,
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


	// Functions

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

	// Return the cached details of the indicated server
	getServerDetails: function(serverId)
	{
		var serverDetails = {
			url : '',
			type: '',
			label: '',
			color: '',
			username: '',
			password: ''
		};
		return serverDetails;
	},

	sendAlert: function(icon, title, message)
	{
		try {

		var alertsService = Components.classes["@mozilla.org/alerts-service;1"]
		 .getService(Components.interfaces.nsIAlertsService);
		alertsService.showAlertNotification(icon, title, message, false, "", null, "nzbdStatus");

		} catch(e) {}
	},

	sendPause: function()
	{
		var favServer = nzbdStatus.getPreference('servers.favorite');
		var sabUrl = nzbdStatus.getPreference('servers.'+favServer+'.url') + nzbdStatus.getPreference('pauseUrl');
		var xmlHttp = this.xmlHttp;
		xmlHttp.open('GET', sabUrl, true);
		xmlHttp.send(null);
	},

	sendResume: function()
	{
		try {

		var favServer = nzbdStatus.getPreference('servers.favorite');
		var sabUrl = nzbdStatus.getPreference('servers.'+favServer+'.url') + nzbdStatus.getPreference('unpauseUrl');
		var xmlHttp = this.xmlHttp;
		xmlHttp.open('GET', sabUrl, true);
		xmlHttp.send(null);
		this.refreshStatus();

		} catch(e) { dump('sendResume error:'+e); }
	},

	loginToSAB: function()
	{
		try {

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
		var favServer = nzbdStatus.getPreference('servers.favorite');
		var sabUrl = this.getPreference('servers.'+favServer+'.url');
		var xmlHttp = this.queueHttp;
		xmlHttp.open('POST', sabUrl, true);
		xmlHttp.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
		xmlHttp.setRequestHeader('Content-Length', postVars.length);
		xmlHttp.onload = nzbdStatus.processLogin;
		xmlHttp.send(postVars);

		} catch(e) {dump('logsab:'+e);}
	},

	processLogin: function()
	{
		var output = nzbdStatus.queueHttp.responseText;
		var tryingToLogin = (output.search(/<title>Login<\/title>/i) > -1);
		if (tryingToLogin)
		{
			// We didn't login so we'll try to read the username/password from Firefox
			var favServer = nzbdStatus.getPreference('servers.favorite');
			var fullUrl = nzbdStatus.getPreference('servers.'+favServer+'.url');
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
				window.openDialog('chrome://nzbdstatus/content/configuration.xul','sabnzb-prefs',
				 'chrome,dependent,titlebar,toolbar,centerscreen,resizable','sabnzb-sab');
			}
		}
		nzbdStatus.refreshStatus();
	},

	countdown: function()
	{
		try {

		var timeRemain = nzbdStatus.statuslabel.value;
		if (timeRemain == '' || timeRemain == '0:00:00')
		{
			nzbdStatus.goIdle();
			return;
		}

		timeRemain = nzbdStatus.convertTimeToSeconds(timeRemain) - 1;
		timeRemain = nzbdStatus.convertSecondsToTime(timeRemain);
		nzbdStatus.statuslabel.value = timeRemain;

		timeRemain = document.getElementById('sabstatus-jobs0-time').value;
		timeRemain = nzbdStatus.convertTimeToSeconds(timeRemain) - 1;
		timeRemain = nzbdStatus.convertSecondsToTime(timeRemain);
		document.getElementById('sabstatus-jobs0-time').value = timeRemain;

	} catch(e) { dump('countdown error:'+e); }
	},

	clickedOn: function(e)
	{
		try {

		var favServer = this.getPreference('servers.favorite');
		var SABurl = this.getPreference('servers.'+favServer+'.url');
		if (e.button == 0)
		{
			var action = this.getPreference('leftClick');
		}
		else if (e.button == 1)
		{
			var action = this.getPreference('middleClick');
		}
		switch (action)
		{
			case 'refresh':
				this.refreshStatus();
				break;
			case 'newtab':
				getBrowser().addTab(SABurl);
				break;
			case 'sametab':
				loadURI(SABurl);
				break;
			case 'newwindow':
				window.open(SABurl);
				break;
		}

		} catch(e) { dump('clickedOn error:'+e); }
	},

	togglePause: function()
	{
		var toPause = (document.getElementById('sabstatus-context-pause').getAttribute('checked') != '');
		if (toPause)
		{
			this.goPaused();
			this.sendPause();
		}
		else
		{
			this.goIdle();
			this.sendResume();
		}
	},

	goIdle: function()
	{
		document.getElementById('sabstatus-context-pause').removeAttribute('checked');
		this.statusicon.src = this.getPreference('iconIdle');
		this.statusbar.setAttribute('tooltip', 'sabstatus-idle');
		this.statuslabel.value = '';
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

	goPaused: function()
	{
		document.getElementById('sabstatus-context-pause').setAttribute('checked', true);
		this.statusicon.src = this.getPreference('iconPaused');
		this.statusbar.setAttribute('tooltip', 'sabstatus-pause');
		if (this.countdownId != null)
		{
			this.countdownId = clearInterval(this.countdownId);
		}
	},

	goActive: function()
	{
		document.getElementById('sabstatus-context-pause').removeAttribute('checked');
		this.statusicon.src = this.getPreference('iconDownload');
		this.statusbar.setAttribute('tooltip', 'sabstatus-info');
		this.statusbar.style.visibility = 'visible';
		if (this.getPreference('onlyShowIcon'))
		{
			this.statuslabel.style.visibility = 'collapse';
		}
		else
		{
			this.statuslabel.style.visibility = 'visible';
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

	historyReceived: function()
	{
		try {

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
				nzbdStatus.sendAlert('chrome://nzbdstatus/skin/sabnzbd.png', 'Download Completed', alertMessage);
			}
		}

		} catch(e) { dump('historyReceived error:' + e); }

	},

	queueReceived: function()
	{
		try {

		var output = nzbdStatus.queueHttp.responseText;
		if (output == '')
		{
			nzbdStatus.goIdle();
			return;
		}

		if (output.search(/<title>Login<\/title>/i) > -1)
		{
			nzbdStatus.goIdle();
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
			nzbdStatus.goPaused();
			return;
		}
		if ((Math.floor(totalMbRemain) == 0) || speed == 0)
		{
			nzbdStatus.goIdle();
			return;
		}

		totalPer = Math.floor((1 - (totalMbRemain / totalMb)) * 100)+'%';
		totalTimeRemain = (totalMbRemain * 1024) / speed;
		totalTimeRemain = nzbdStatus.convertSecondsToTime(totalTimeRemain);
		curTime = (curMbRemain * 1024) / speed;
		curTime = nzbdStatus.convertSecondsToTime(curTime);

		nzbdStatus.statuslabel.value = totalTimeRemain;
		document.getElementById('sabstatus-kbpersec').value = Math.floor(speed) + ' KB/s';
		document.getElementById('sabstatus-mbleft').setAttribute('value', totalPer);
		document.getElementById('sabstatus-diskspace1').value = (Math.floor(finSpace * 100) / 100) + ' GB';
		document.getElementById('sabstatus-jobs0').value = curDL;
		document.getElementById('sabstatus-jobs0-time').value = curTime;

		nzbdStatus.goActive();

		} catch(e) { dump('ajax error:' + e); }
	},

	refreshStatus: function()
	{
		try {

		var favServer = nzbdStatus.getPreference('servers.favorite');
		var queueUrl = nzbdStatus.getPreference('servers.'+favServer+'.url') + nzbdStatus.getPreference('queueUrl');
		nzbdStatus.queueHttp.open('GET', queueUrl, true);
		nzbdStatus.queueHttp.onload = nzbdStatus.queueReceived;
		nzbdStatus.queueHttp.send(null);

		var historyUrl = nzbdStatus.getPreference('servers.'+favServer+'.url') + nzbdStatus.getPreference('historyUrl');
		nzbdStatus.historyHttp.open('GET', historyUrl, true);
		nzbdStatus.historyHttp.overrideMimeType('text/xml');
		nzbdStatus.historyHttp.onload = nzbdStatus.historyReceived;
		nzbdStatus.historyHttp.send(null);

		} catch(e) { dump('refresh error:' + e); }
	},

	getServerUL: function(doc)
	{
		var serverList = doc.createElement('ul');
		serverList.id = 'nzbdserverList';
		serverList.className ='nzbdservers tabMenu';
		serverList.addEventListener('mouseover', function(e){var doc = e.target.ownerDocument;doc.getElementById('nzbdserverList').style.display='block';}, false);
		serverList.addEventListener('mouseout', function(e){var doc = e.target.ownerDocument;doc.getElementById('nzbdserverList').style.display='none';}, false);

		var serverCount = this.getPreference('servers.count');
		var favServer = this.getPreference('servers.favorite');
		var serverItem, serverName, serverColor, serverIcon, serverLink;
		for (var i = 1; i <= serverCount; i++)
		{
			serverItem = doc.createElement('li');
			if (i == favServer)
			{
				serverItem.className = 'selected'
			}
			serverLink = doc.createElement('a');
			serverLink.setAttribute('href', '#');
			serverName = this.getPreference('servers.'+i+'.label');
			serverColor = this.getPreference('servers.'+i+'.color');
			serverIcon = doc.createElement('img');
			serverIcon.setAttribute('src', 'chrome://nzbdstatus/skin/'+serverColor+'.png');
			serverIcon.setAttribute('alt', serverName);
			serverLink.appendChild(serverIcon);
			serverLink.appendChild(doc.createTextNode(serverName));
			serverItem.appendChild(serverLink);
			serverList.appendChild(serverItem);
		}
		return serverList;
	},

	// This happens every page load
	onPageLoad: function(e)
	{
		try {

		var doc = e.originalTarget;
		if (!doc.location)
		{
			return;
		}
		// Make sure we are on a supported version of Newzbin
		if ((doc.location.href.search('newzbin') == -1) && (doc.location.href.search('newzxxx') == -1))
		{
			return;
		}
		// v2 of newsbin isn't supported
		if ((doc.location.href.search('v2.newzbin') != -1))
		{
			return;
		}
		if (!nzbdStatus.getPreference('enableInNewzbin'))
		{
			// They'ved turned off the NewzBin features
			return;
		}
		var loggedIn = nzbdStatus.selectSingleNode(doc, doc, '//a[contains(@href,"/account/logout/")]');
		if (!loggedIn)
		{
			// Not logged in so drop out because they probably don't have a NewzBin account
			return;
		}
		var newzbinJS = doc.createElement('script');
		newzbinJS.type = 'text/javascript';
		newzbinJS.src = 'chrome://nzbdstatus/content/newzbin.js';
		doc.getElementsByTagName('head')[0].appendChild(newzbinJS);
		var newzbinCSS = doc.createElement('link');
		newzbinCSS.rel = 'stylesheet';
		newzbinCSS.type = 'text/css';
		newzbinCSS.href = 'chrome://nzbdstatus/content/newzbin.css';
		doc.getElementsByTagName('head')[0].appendChild(newzbinCSS);
		doc.getElementsByTagName('body')[0].appendChild(nzbdStatus.getServerUL(doc));

		// Report detail mode
		var results = nzbdStatus.selectNodes(doc, doc, '//form[@id="PostEdit"][contains(@action,"/browse/post/")]');
		if (results != null && results.length > 0)
		{
			nzbdStatus.reportSummaryPage(doc);
			return;
		}
		// Report browser mode
		results = nzbdStatus.selectNodes(doc, doc, '//a[contains(@href, "/nzb")][@title="Download report NZB"]');
		if (results != null && results.length > 0)
		{
			nzbdStatus.listingsPage(doc);
			return;
		}
		// File browser mode
		results = nzbdStatus.selectNodes(doc, doc, '//form[contains(@action,"/database/fileactions/")]');
		if (results != null && results.length > 0)
		{
			nzbdStatus.filesPage(doc);
			return;
		}

		} catch(e) { dump('onPageLoad error: '+e+'\n'); }
	},

	reportSummaryPage: function(doc)
	{
		var isFinished = nzbdStatus.selectSingleNode(doc, doc, '//img[@title="Report is complete"]');
		if (isFinished == null)
		{
			return;
		}
		var postId = doc.location.pathname.match(/(\d+)/)[1];
		isFinished.parentNode.insertBefore(makeSendIcon(doc, postId), isFinished);
	},

	listingsPage: function(doc)
	{
		try {

		var results = nzbdStatus.selectNodes(doc, doc, '//form/table/tbody[not(@class="dateLine")]');  // Can't really make it any more specific and have it work in lite and regular still
		if (results.length == 1 && (results[0].textContent.search('No results') > -1))
		{
			return;
		}
		var row, postId, sendTo, oldTo, rowcount = results.length;
		for (i = 0; i < rowcount; i++)
		{
			row = results[i];
			oldTo = nzbdStatus.selectSingleNode(doc, row, 'tr/td/a[@title="Download report NZB"]');
			if (oldTo == null)
			{
				continue;
			}
			postId = oldTo.href.match(/post\/(\d+)\//);
			row.addEventListener('click', nzbdStatus.newzbinRowClick, false);
			postId = postId[1];
			sendTo = nzbdStatus.makeSendIcon(doc, postId);
			oldTo = nzbdStatus.selectSingleNode(doc, row, 'tr/td/a[@title="Download report NZB"]');
			oldTo.parentNode.replaceChild(sendTo, oldTo);
		}

		} catch(e) { dump('listingsPage error: '+e+'\n'); }
	},

	filesPage: function(doc)
	{
		var results = nzbdStatus.selectNodes(doc, doc, '//form[contains(@action,"/database/fileactions/")]//table/tbody[not(@class="dateLine")]');
		if (results.length == 1 && (results[0].textContent.search('No results') > -1))
		{
			return;
		}
		var row, postId, sendTo, oldTo, rowcount = results.length;
		for (i = 0; i < rowcount; i++)
		{
			row = results[i];
			row.addEventListener('click', nzbdStatus.newzbinRowClick, false);
			if (row.getElementsByTagName('img')[0].alt == 'Assigned')
			{
				oldTo = nzbdStatus.selectSingleNode(doc, row, 'tr/td/a[@title="Assigned; click to view Report"]');
				postId = oldTo.href.match(/post\/(\d+)\//)[1];
				sendTo = nzbdStatus.makeSendIcon(doc, postId);
				oldTo.parentNode.insertBefore(sendTo, oldTo);
				oldTo.parentNode.insertBefore(doc.createTextNode('\t'), oldTo);
				oldTo.parentNode.insertBefore(doc.createTextNode('\t'), oldTo);
				oldTo.parentNode.style.whiteSpace = 'nowrap';
			}
		}
	},

	newzbinRowClick: function(e)
	{
		if ((e.target.nodeName.toLowerCase() == 'input') || (e.target.nodeName.toLowerCase() == 'img'))
		{
			return;
		}
		if (nzbdStatus.getPreference('editorMode'))
		{
			return;
		}
		e.currentTarget.getElementsByTagName('input')[0].click();
	},

	makeSendIcon: function(doc, postId)
	{
		var sendTo = doc.createElement('img');
		sendTo.src = nzbdStatus.getPreference('iconDownload');
		sendTo.alt = postId;
		sendTo.className = 'nzbsend';
		sendTo.title = 'Send to SABnzbd';
		sendTo.addEventListener('click', nzbdStatus.sendToSAB, false);
		if (nzbdStatus.getPreference('servers.count') > 1)
		{
			sendTo.addEventListener('mouseover', nzbdStatus.showServerList, false);
			sendTo.addEventListener('mouseout', nzbdStatus.hideServerList, false);
		}
		return sendTo;
	},

	showServerList: function(e)
	{
		var doc = e.target.ownerDocument, targ = e.target;
		var sList = doc.getElementById('nzbdserverList');
		sList.style.display = 'block';
		sList.style.left = (e.originalTarget.x + targ.offsetWidth) + 'px';
		sList.style.top = (e.originalTarget.y - Math.floor((sList.offsetHeight - targ.offsetHeight) / 2)) + 'px';
		return;
	},

	hideServerList: function(e)
	{
		var doc = e.target.ownerDocument;
		var sList = doc.getElementById('nzbdserverList');
		sList.style.display = 'none';
		return;
	},

	checkForNZB: function()
	{
		try {

		if (!gContextMenu.onLink)
		{
			return false;
		}
		if (gContextMenu && gContextMenu.getLinkURL)
		{
			var href = gContextMenu.getLinkURL();
		}
		else if (gContextMenu && gContextMenu.linkURL)
		{
			var href = gContextMenu.linkURL();
		}
		if (!href)
		{
			return false;
		}
		if (href.match(/\.nzb$/i))
		{
			return true;
		}

		} catch(e) { dump('checkForNZB error: '+e+'\n'); }
	},

	// Runs when the context menu popup opens
	contextPopupShowing: function()
	{
		if (nzbdStatus.checkForNZB())
		{
			document.getElementById('sabstatus-context-sendlink').hidden = false;
		}
		else
		{
			document.getElementById('sabstatus-context-sendlink').hidden = true;
		}
	},

	sendToSAB: function(e)
	{
		try {

		var postid = this.alt;
		var favServer = nzbdStatus.getPreference('servers.favorite');
		var fullUrl = nzbdStatus.getPreference('servers.'+favServer+'.url') + nzbdStatus.getPreference('addID');
		if (nzbdStatus.getPreference('legacyMode'))
		{
			fullUrl += '?id=';
		}
		else
		{
			fullUrl += '?mode=addid&name=';
		}
		fullUrl += postid;
		var postproc = nzbdStatus.getPreference('newzbinToSAB');
		if (postproc != -1)
		{
			fullUrl += '&pp=' + postproc;
		}
		var xmlHttp = nzbdStatus.xmlHttp;
		xmlHttp.open('GET', fullUrl, true);
		xmlHttp.onload = nzbdStatus.goActiveSoon;
		xmlHttp.send(null);

		this.style.opacity = '.25';

		} catch(e) { dump('sendtosab error: '+e+'\n'); }
	},

	sendUrl: function(e)
	{
		try {

		if (gContextMenu && gContextMenu.getLinkURL)
		{
			var href = gContextMenu.getLinkURL();
		}
		else if (gContextMenu && gContextMenu.linkURL)
		{
			var href = gContextMenu.linkURL();
		}
		if (!href)
		{
			return false;
		}
		var favServer = nzbdStatus.getPreference('servers.favorite');
		var fullUrl = nzbdStatus.getPreference('servers.'+favServer+'.url') + nzbdStatus.getPreference('addUrl');
		if (nzbdStatus.getPreference('legacyMode'))
		{
			fullUrl += '?url=';
		}
		else
		{
			fullUrl += '?mode=addurl&name=';
		}
		fullUrl += encodeURIComponent(href);
		var postproc = nzbdStatus.getPreference('newzbinToSAB');
		if (postproc != -1)
		{
			fullUrl += '&pp=' + postproc;
		}
		var xmlHttp = nzbdStatus.xmlHttp;
		xmlHttp.open('GET', fullUrl, true);
		xmlHttp.onload = nzbdStatus.goActiveSoon;
		xmlHttp.send(null);
		gContextMenu.target.style.opacity = '.25';

		} catch(e) { dump('sendurl error: '+e+'\n'); }
	},

	uploadFile: function(filename, content)
	{
		try {

		var justname = filename.split(/(\/|\\)/)[filename.split(/(\/|\\)/).length-1];
		var favServer = this.getPreference('servers.favorite');
		var fullUrl =  + this.getPreference('addFile');
		if (!this.getPreference('legacyMode'))
		{
			fullUrl += '?mode=addfile';
			var namename = 'name';
		}
		else
		{
			var namename = 'nzbfile';
		}
		var d = new Date();
		var boundary = '--------' + d.getTime();
		var requestbody = '--' + boundary + '\nContent-Disposition: form-data; name="'+namename+'"; filename="' + justname + '"\n' +
		 'Content-Type: application/octet-stream\n\n' + content + '\n' +
		 '--' + boundary;
		if (this.getPreference('filesToSAB') != -1)
		{
			requestbody += '\nContent-Disposition: form-data; name="pp"\n\n' +
			 this.getPreference('filesToSAB') + '\n' + '--' + boundary;
		}
		requestbody += '--\n';

		// We don't use the object's one so that we can have multiple going
		var xmlHttp = nzbdStatus.xmlHttp;
		xmlHttp.open('POST', fullUrl, true);
		xmlHttp.setRequestHeader('Referer', this.getPreference('servers.'+favServer+'.url'));
		xmlHttp.setRequestHeader('Content-Type', 'multipart/form-data; boundary=' + boundary);
		xmlHttp.setRequestHeader('Connection', 'close');
		xmlHttp.setRequestHeader('Content-Length', requestbody.length);
		xmlHttp.onload = nzbdStatus.goActiveSoon;
		xmlHttp.send(requestbody);

		} catch(e) { dump('uploadFile:'+e+'\n'); }
	},

	// Initialization and starting of timers are done here
	startup: function()
	{
		try {

		if (this.getPreference('enableFilesToSAB'))
		{
			// Put an observer on all downloads
			this.observerService.addObserver(this, 'dl-done', false);
		}

		var menu = document.getElementById('contentAreaContextMenu');
		menu.addEventListener('popupshowing', this.contextPopupShowing, false);
		this.statusbar = document.getElementById('sabstatus');
		this.statusicon = document.getElementById('sabstatus-image');
		this.statuslabel = document.getElementById('sabstatus-label');
		this.goIdle();
		if (this.getPreference('onlyShowIcon'))
		{
			this.statuslabel.style.visibility = 'collapse';
		}
		// Put an observer on the preferences
		this.preferences.QueryInterface(Components.interfaces.nsIPrefBranch2);
		this.preferences.addObserver('', this, false);
		this.refreshRate = this.getPreference('refreshRate');
		this.refreshStatus();
		this.refreshId = window.setInterval(this.refreshStatus, this.refreshRate*60*1000);
		var appcontent = document.getElementById('appcontent');   // browser
		if (appcontent)
		{
			appcontent.addEventListener('load', this.onPageLoad, true);
		}

		} catch(e) { dump('startup error:'+e+'\n'); }
	},

	// Shutdown stuff done here
	shutdown: function()
	{
		this.preferences.removeObserver('', this);
		this.observerService.removeObserver(this, 'dl-done');
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
				nzbdStatus.observeFileDownload(subject, topic, data);
				break;
		}
	},

	// File download observer
	observeFileDownload: function(subject, topic, data)
	{
		try {

		var dlCom = subject.QueryInterface(Components.interfaces.nsIDownload);
		var fileDetails = null;
		fileDetails = dlCom.targetFile;
		if (fileDetails.path.search(/\.nzb$/) == -1)
		{
			return;
		}
		var file = Components.classes['@mozilla.org/file/local;1']
		 .createInstance(Components.interfaces.nsILocalFile);
		file.initWithPath(fileDetails.path);
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
		this.uploadFile(fileDetails.path, data);
		// Delete file file now that we're done with it
		file.remove(false);

		} catch(e) { dump('observeFileDownload:'+e+'\n'); }
	},

	// Preferences observer
	observePreferences: function(subject, topic, data)
	{
		switch (data)
		{
			case 'refreshRate':
				this.refreshId = clearInterval(this.refreshId);
				this.refreshRate = this.getPreference('refreshRate');
				if (this.refreshRate < 1)
				{
					this.refreshRate = 1;
				}
				this.refreshStatus();
				this.refreshId = window.setInterval(this.refreshStatus, this.refreshRate*60*1000);
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
					this.goIdle();
					this.refreshId = window.setInterval(this.refreshStatus, this.refreshRate*60*1000);
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
			case 'enableFilesToSAB':
				if (this.getPreference('enableFilesToSAB'))
				{
					this.observerService.addObserver(this, 'dl-done', false);
				}
				else
				{
					this.observerService.removeObserver(this, 'dl-done');
				}
				break;
			case 'legacyMode':
				if (this.getPreference('legacyMode'))
				{
					this.setPreference('queueUrl', 'queue/');
					this.setPreference('pauseUrl', 'queue/resume');
					this.setPreference('unpauseUrl', 'queue/resume');
					this.setPreference('addUrl', 'addURL');
					this.setPreference('addID', 'addID');
					this.setPreference('addFile', 'addFile');
				}
				else
				{
					this.setPreference('template', 'None');
					this.setPreference('queueUrl', 'api?mode=qstatus&output=json');
					this.setPreference('pauseUrl', 'api?mode=pause');
					this.setPreference('unpauseUrl', 'api?mode=resume');
					this.setPreference('addUrl', 'api');
					this.setPreference('addID', 'api');
					this.setPreference('addFile', 'api');
				}
			case 'sabusername':
			case 'sabpassword':
				this._askForPass = false;
				break;
		}
	},

	// Do the oldest thing in the event queue
	processQueue: function()
	{
		var currentEvent;
		if (this.processingQueue.length > 0)
		{
			currentEvent = this.processingQueue.shift();
			switch (currentEvent.action)
			{
				case 'sendUrl':
					this.sendUrl(currentEvent);
					break;
				case 'sendFile':
					this.sendFile(currentEvent);
					break;
				case 'sendNewzbinId':
					this.sendNewzbinId(currentEvent);
					break;
				case 'sendPause':
					this.sendPause(currentEvent);
					break;
				case 'sendResume':
					this.sendResume(currentEvent);
					break;
				default:
					// Something that's not been implemented yet
					dump('Unsupported action `'+currentEvent.action+'` requested\n');
					break;
			}
		}
		else
		{
			this.processingQueueActive = false;
		}
	},

	// Add an event to the end of the event queue
	queueEvent: function(newEvent)
	{
		this.processingQueue.push(newEvent);
		if (!this.processingQueueActive)
		{
			this.processingQueueActive = true;
			setTimeout(this.processQueue, 1); // Fork this off so we can go about our day
		}
	},

	// Process a Send Newzbin ID event
	sendNewzbinId: function(eventDetails)
	{

		try {

		var serverDetails = this.getServerDetails(eventDetails.serverId);
		var fullUrl = serverDetails.url;

		switch (serverDetails.type)
		{
			case 'sabnzbd+':
				fullUrl += '?mode=addid&name='+eventDetails.newzbinId;
				if (serverDetails.username != '' || serverDetails.password != '')
				{
					fullUrl += '&ma_username='+serverDetails.username+'&ma_password='+serverDetails.password;
				}
				// &cat=<category>&pp=<job-option>&script=<script>
				break;
			case 'hellanzb':
			case 'nzbget':
			default:
				// Something that's not been implemented yet
				dump('Unsupported server type `'+serverDetails.type+'` requested\n');
				break;
		}

		var queueHttp = nzbdStatus.queueHttp;
		queueHttp.open('GET', fullUrl, true);
		queueHttp.onload = function() { nzbdStatus.processQueueResponse(eventDetails, serverDetails) };
		queueHttp.send(null);

		this.style.opacity = '.25';

		} catch(e) { dump(arguments.callee.toString().match(/function\s([^\s]*)[\s|(]/)[1]+' has thrown an error: '+e+'\n'); }

	},

	processQueueResponse: function(eventDetails, serverDetails)
	{

		try {

		var queueResponse = queueHttp.responseText;

		switch (serverDetails.type)
		{
			case 'sabnzbd+':
				if (fileResponse.search(/ok\n/) > -1)
				{
					// Success
					if (eventDetails.action == 'sendNewzbinId')
					{
						eventDetails.icon.style.opacity = '.25';
						eventDetails.icon.style.background = 'none';
					}
				}
				else
				{
					// Failure
					if (eventDetails.action == 'sendNewzbinId')
					{
						eventDetails.icon.style.opacity = '1';
						eventDetails.icon.style.background = '#f00';
					}
					nzbdStatus.queueEvent(eventDetails);
				}
				break;
			case 'hellanzb':
			case 'nzbget':
			default:
				// Something that's not been implemented yet
				dump('Unsupported server type `'+serverDetails.type+'` requested\n');
				break;
		}

		} catch(e) { dump(arguments.callee.toString().match(/function\s([^\s]*)[\s|(]/)[1]+' has thrown an error: '+e+'\n'); }
	}

	// Don't forget to add a comma
}

nzbdStatus = new nzbdStatusObject();

if (nzbdStatus && !nzbdStatus.getPreference('disabled'))
{
	dump('nzbdStatus Loaded\n');
	window.addEventListener('load', function(e) { nzbdStatus.startup(); }, false);
	window.addEventListener('unload', function(e) { nzbdStatus.shutdown(); }, false);
}
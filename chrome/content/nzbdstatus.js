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
	favServer: null, // Our favorite server
	serverDetails: Array(), // Cache for the server details
	processingQueue: Array(), // Where what needs to be done is put
	processingQueueActive: false,  // So we don't try to do things twice


	// Private variables
	_preferences: Components.classes['@mozilla.org/preferences;1']
	 .getService(Components.interfaces.nsIPrefService)
	 .getBranch('extensions.nzbdstatus.'),
	_observerService: Components.classes['@mozilla.org/observer-service;1']
	 .getService(Components.interfaces.nsIObserverService),
	_askForPass: false,
	_handleDownloads: true,
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

	sendAlert: function(icon, title, message)
	{
		try {

		var alertsService = Components.classes["@mozilla.org/alerts-service;1"]
		 .getService(Components.interfaces.nsIAlertsService);
		alertsService.showAlertNotification(icon, title, message, false, "", null, "nzbdStatus");

		} catch(e) {}
	},

	sendDownloadAlert: function(title, message)
	{
		this.sendAlert('chrome://mozapps/skin/downloads/downloadIcon.png', title, message);
	},

	sendErrorAlert: function(title, message)
	{
		this.sendAlert('chrome://global/skin/icons/Error.png', title, message);
	},

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
		var sabUrl = this.getPreference('servers.'+this.favServer+'.url');
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

		timeRemain = document.getElementById('nzbdstatus-tooltip-0').getElementsByClassName('nzbdstatus-jobs0-time')[0].value;
		timeRemain = nzbdStatus.convertTimeToSeconds(timeRemain) - 1;
		timeRemain = nzbdStatus.convertSecondsToTime(timeRemain);
		document.getElementById('nzbdstatus-tooltip-0').getElementsByClassName('nzbdstatus-jobs0-time')[0].value = timeRemain;

	} catch(e) { dump('countdown error:'+e); }
	},

	togglePause: function()
	{
		var toPause = (document.getElementById('nzbdstatus-context-0').getElementsByClassName('nzbdstatus-context-pause')[0].getAttribute('checked') != '');
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

	goActive: function(serverId)
	{
		if (serverId == undefined)
		{
			serverId = this.favServer;
		}
		var widget = document.getElementById('nzbdstatus-panel-'+serverId)
		widget.getElementsByClassName('nzbdstatus-context-pause')[0].removeAttribute('checked');
		widget.getElementsByClassName('nzbdstatus-tooltip-text')[0].className += ' nzbdstatus-hidden';
		widget.getElementsByClassName('nzbdstatus-tooltip-data')[0].className = widget.getElementsByClassName('nzbdstatus-tooltip-data')[0].className.replace(/nzbdstatus-hidden/g, '');
		widget.getElementsByTagName('image')[0].setAttribute('src', this.getPreference('iconDownload'));
		widget.className = widget.className.replace(/nzbdstatus-hidden/g, '');


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
		document.getElementById('nzbdstatus-tooltip-0').getElementsByClassName('nzbdstatus-kbpersec')[0].value = Math.floor(speed) + ' KB/s';
		document.getElementById('nzbdstatus-tooltip-0').getElementsByClassName('nzbdstatus-mbleft')[0].setAttribute('value', totalPer);
		document.getElementById('nzbdstatus-tooltip-0').getElementsByClassName('nzbdstatus-diskspace1')[0].value = (Math.floor(finSpace * 100) / 100) + ' GB';
		document.getElementById('nzbdstatus-tooltip-0').getElementsByClassName('nzbdstatus-jobs0')[0].value = curDL;
		document.getElementById('nzbdstatus-tooltip-0').getElementsByClassName('nzbdstatus-jobs0-time')[0].value = curTime;

		nzbdStatus.goActive();

		} catch(e) { dump('ajax error:' + e); }
	},

	refreshStatus: function(server)
	{
		try {

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

		} catch(e) { dump('refresh error:' + e); }
	},

	getServerUL: function(doc)
	{

		try {

		var serverList = doc.createElement('ul');
		serverList.id = 'nzbdserverList';
		serverList.className ='nzbdservers tabMenu nzbsend';
		serverList.addEventListener('mouseover', function(e){var doc = e.target.ownerDocument;doc.getElementById('nzbdserverList').style.display='block';}, false);
		serverList.addEventListener('mouseout', function(e){var doc = e.target.ownerDocument;doc.getElementById('nzbdserverList').style.display='none';}, false);

		var serverCount = this.getPreference('servers.count');
		var serverItem, serverIcon, serverLink, serverDetails;
		for (var i = 0; i < serverCount; i++)
		{
			serverItem = doc.createElement('li');
			if (i == this.favServer)
			{
				serverItem.className = 'selected'
			}
			serverLink = doc.createElement('a');
			serverName = this.serverDetails[i].label;
			serverIcon = doc.createElement('img');
			serverIcon.setAttribute('src', 'chrome://nzbdstatus/skin/'+this.serverDetails[i].icon);
			serverIcon.setAttribute('alt', this.serverDetails[i].label);
			serverLink.appendChild(serverIcon);
			serverLink.appendChild(doc.createTextNode(this.serverDetails[i].label));
			serverItem.appendChild(serverLink);
			serverItem.className += ' nzbServer'+i;
			serverItem.addEventListener('click', nzbdStatus.queueNewzbinId, false);
			serverList.appendChild(serverItem);
		}
		return serverList;

		} catch(e) { dump('getServerUL has thrown an error: '+e+'\n'); }

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

		} catch(e) { dump('onPageLoad has thrown an error: '+e+'\n'); }

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

		} catch(e) { dump('listingsPage has thrown an error: '+e+'\n'); }

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

		try {

		var sendIcon = doc.createElement('img');
		sendIcon.setAttribute('src', 'chrome://nzbdstatus/skin/'+this.serverDetails[this.favServer].icon);
		sendIcon.setAttribute('alt', 'nzbId'+postId);
		sendIcon.className = 'nzbsend nzbServer'+this.favServer;
		sendIcon.title = 'Send to SABnzbd';
		sendIcon.addEventListener('click', nzbdStatus.queueNewzbinId, false);
		if (nzbdStatus.getPreference('servers.count') > 1)
		{
			sendIcon.addEventListener('mouseover', nzbdStatus.showServerList, false);
			sendIcon.addEventListener('mouseout', nzbdStatus.hideServerList, false);
		}
		return sendIcon;

		} catch(e) { dump('makeSendIcon has thrown an error: '+e+'\n'); }

	},

	showServerList: function(e)
	{

		try {

		var doc = e.target.ownerDocument, targ = e.target;
		var sList = doc.getElementById('nzbdserverList');
		sList.className = sList.className.replace(/nzbId[0-9]+/g, '');
		sList.className += ' ' + targ.alt;
		sList.style.display = 'block';
		sList.style.left = (e.originalTarget.x + targ.offsetWidth) + 'px';
		sList.style.top = (e.originalTarget.y - Math.floor((sList.offsetHeight - targ.offsetHeight) / 2)) + 'px';
		return;

		} catch(e) { dump('showServerList has thrown an error: '+e+'\n'); }

	},

	hideServerList: function(e)
	{

		try {

		var doc = e.target.ownerDocument;
		var sList = doc.getElementById('nzbdserverList');
		sList.style.display = 'none';
		return;

		} catch(e) { dump('hideServerList has thrown an error: '+e+'\n'); }

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
			document.getElementById('nzbdstatus-context-sendlink').hidden = false;
		}
		else
		{
			document.getElementById('nzbdstatus-context-sendlink').hidden = true;
		}
	},

	// Initialization and starting of timers are done here
	startup: function()
	{
		try {

		// Store the favorite server
		this.favServer = this.getPreference('servers.favorite');

		// Load up the server details into the cache
		this.fillServerCache();

		// Create the additional widgets for the status bar (if needed)
		this.createAllWidgets();

		// Check to see if we need to put an observer on the download manager
		var dlObs = this.observerService.enumerateObservers('nzbdStatus');
		if (!dlObs.hasMoreElements())
		{
			if (this.getPreference('enableFilesToServer'))
			{
				this.observerService.addObserver(this, 'dl-done', false);
			}
		}
		else
		{
			this._handleDownloads = false;
		}
		this.observerService.addObserver(this, 'nzbdStatus', false);

		var menu = document.getElementById('contentAreaContextMenu');
		menu.addEventListener('popupshowing', this.contextPopupShowing, false);
		this.statusbar = document.getElementById('nzbdstatus-panel-0');
		this.statusicon = document.getElementById('nzbdstatus-panel-0').getElementsByTagName('image')[0];
		this.statuslabel = document.getElementById('nzbdstatus-panel-0').getElementsByTagName('label')[0];
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
		this.observerService.removeObserver(this, 'nzbdStatus');
		if (this._handleDownloads)
		{
			var dlObs = observerService.enumerateObservers('nzbdStatus')
			if (dlObs.hasMoreElements())
			{
				var otherWindow = dlObs.getNext().QueryInterface(Components.interfaces.nsIObserver);
				otherWindow.notify(null, 'nzbdStatus', 'startHandleDownload');
			}
			if (this.getPreference('enableFilesToServer'))
			{
				this.observerService.removeObserver(this, 'dl-done');
			}
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
				nzbdStatus.queueFile(subject, topic, data);
				break;
			case 'nzbdStatus':
				if (data == 'startHandleDownload')
				{
					// We've been told to handle file downloads now
					nzbdStatus._handleDownloads = true;
					if (nzbdStatus.getPreference('enableFilesToServer'))
					{
						nzbdStatus.observerService.addObserver(nzbdStatus, 'dl-done', false);
					}
				}
				break;
		}
	},

	// Preferences observer
	observePreferences: function(subject, topic, data)
	{
		switch (data.split('.')[0])
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
			case 'enableFilesToServer':
				if (this._handleDownloads)
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
							this.fillServerCache();
							break;
						case 'favorite':
							this.favServer = this.getPreference('servers.favorite');
							break;
						default:
							var sNum = sData[1].match(/\d+/);
							if (sNum && (sNum[0] = sData[1]))
							{
								this.cacheDetailsOf(sNum[0]);
							}
					}
				}
				break;
		}
	},





// Below here has been rewritten || is brand new for v2


	// This creates a widget for each server then sticks it into the status bar
	createAllWidgets: function()
	{
		try {

			var mainWidget = document.getElementById('nzbdstatus-panel-0');
			var serverCount = this.getPreference('servers.count');
			var serverDetails, newWidget, tooltip, popup, prevWidget = mainWidget;
			mainWidget.getElementsByTagName('image')[0].setAttribute('src', 'chrome://nzbdstatus/skin/'+this.serverDetails[0].icon);

			for (i = 1; i < serverCount; i++)
			{
				newWidget = mainWidget.cloneNode(true);
				newWidget.setAttribute('id', 'nzbdstatus-panel-'+i);
				newWidget.setAttribute('context', 'nzbdstatus-context-'+i);
				newWidget.setAttribute('tooltip', 'nzbdstatus-tooltip-'+i);
				newWidget.getElementsByTagName('tooltip')[0].setAttribute('id', 'nzbdstatus-tooltip-'+i);
				newWidget.getElementsByTagName('menupopup')[0].setAttribute('id', 'nzbdstatus-context-'+i);
				newWidget.getElementsByTagName('image')[0].setAttribute('src', 'chrome://nzbdstatus/skin/'+this.serverDetails[i].icon);
				prevWidget = mainWidget.parentNode.insertBefore(newWidget, prevWidget.nextSibling);
			}

			document.getElementById('nzbdstatus-panel-'+this.favServer).className = document.getElementById('nzbdstatus-panel-'+this.favServer).className.replace(/nzbdstatus-hidden/,'');

		} catch(e) { dump('createAllWidgets has thrown an error: '+e+'\n'); }
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
		switch (action)
		{
			case 'refresh':
				nzbdStatus.refreshStatus(widgetClicked);
				break;
			case 'newtab':
				getBrowser().addTab(nzbdStatus.serverDetails[widgetClicked].url);
				break;
			case 'sametab':
				loadURI(nzbdStatus.serverDetails[widgetClicked].url);
				break;
			case 'newwindow':
				window.open(nzbdStatus.serverDetails[widgetClicked].url);
				break;
		}
	},

	// Read the server details into the cache
	fillServerCache: function()
	{

		try {

		var serverCount = this.getPreference('servers.count');
		for (i = 0; i < serverCount; i++)
		{
			this.cacheDetailsOf(i);
		}

		} catch(e) { dump('fillServerCache has thrown an error: '+e+'\n'); }

	},

	// Loads the details for a single server into the cache
	cacheDetailsOf: function(serverId)
	{
		try {

		var fullUrl, rootUrl, notFound, serverType, logins, username = null, password = null;
		var passwordManager = Components.classes["@mozilla.org/login-manager;1"]
		 .getService(Components.interfaces.nsILoginManager);
		serverType = this.getPreference('servers.'+serverId+'.type');
		fullUrl = this.getPreference('servers.'+serverId+'.url');
		// This line will have to change to allow https lookups as well
		rootUrl = 'http://' + fullUrl.match(/\/\/([^\/]+)/)[1];
		var logins = passwordManager.findLogins({}, rootUrl, rootUrl, null);
		if (logins.length > 0)
		{
			username = logins[0].username;
			password = logins[0].password;
		}
		this.serverDetails[serverId] = {
		 url : fullUrl,
		 type: serverType,
		 label: this.getPreference('servers.'+serverId+'.label'),
		 icon: this.getPreference('servers.'+serverId+'.icon'),
		 username: username,
		 password: password
		};

		} catch(e) { dump('cacheDetailsOf has thrown an error: '+e+'\n'); }
	},

	// Do the oldest thing in the event queue
	processQueue: function()
	{

		try {
dump('in pq\n');
		if (nzbdStatus.processingQueue.length > 0)
		{
			var currentEvent = nzbdStatus.processingQueue.shift();
			switch (currentEvent.action)
			{
				case 'sendUrl':
					nzbdStatus.sendUrl(currentEvent);
					break;
				case 'sendFile':
					nzbdStatus.sendFile(currentEvent);
					break;
				case 'sendNewzbinId':
					nzbdStatus.sendNewzbinId(currentEvent);
					break;
				case 'sendPause':
					nzbdStatus.sendPause(currentEvent);
					break;
				case 'sendResume':
					nzbdStatus.sendResume(currentEvent);
					break;
				default:
					// Something that's not been implemented yet
					dump('Unsupported action `'+currentEvent.action+'` requested\n');
					break;
			}
		}
		else
		{
			nzbdStatus.processingQueueActive = false;
}

		} catch(e) { dump('processQueue has thrown an error: '+e+'\n'); }

	},

	// Add an event to the end of the event queue
	queueEvent: function(newEvent)
	{

		try {
dump('in qe\n')
		this.processingQueue.push(newEvent);
		if (!this.processingQueueActive)
		{
			this.processingQueueActive = true;
			setTimeout(this.processQueue, 1); // Send this off so we can go about our day
		}

		} catch(e) { dump('queueEvent has thrown an error: '+e+'\n'); }

	},

	queueUrl: function(e)
	{

		try {


		} catch(e) { dump('queueUrl has thrown an error: '+e+'\n'); }

	},

	queueFile: function(subject, topic, data)
	{

		try {
dump('in qf\n');
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

		} catch(e) { dump('queueFile has thrown an error: '+e+'\n'); }

	},

	queueNewzbinId: function(e)
	{

		try {

		var doc = e.target.ownerDocument, targ = e.target;
		var nzbId, serverId, icon;
		if (targ.className.match(/nzbServer([0-9]+)/) && targ.alt.match(/nzbId[0-9]+/))
		{
			nzbId = targ.alt.match(/nzbId([0-9]+)/)[1];
			serverId = targ.className.match(/nzbServer([0-9]+)/)[1];
		}
		else if (doc.getElementById('nzbdserverList').className.match('nzbsend') && doc.getElementById('nzbdserverList').className.match(/nzbId[0-9]+/))
		{
			nzbId = doc.getElementById('nzbdserverList').className.match(/nzbId([0-9]+)/)[1];
			if (targ.parentNode.className.match(/nzbServer([0-9]+)/))
			{
				serverId = targ.parentNode.className.match(/nzbServer([0-9]+)/)[1];
			}
			else if (targ.parentNode.parentNode.className.match(/nzbServer([0-9]+)/))
			{
				serverId = targ.parentNode.parentNode.className.match(/nzbServer([0-9]+)/)[1];
			}
			else
			{
				serverId = nzbdStatus.favServer;
			}
		}
		var newzbinIdName = nzbdStatus.selectSingleNode(doc, doc, '//A[@href="/browse/post/'+nzbId+'/"]');
		if (newzbinIdName)
		{
			newzbinIdName = newzbinIdName.textContent;
		}
		else
		{
			newzbinIdName = '';
		}

		var newEvent = {
		 action: 'sendNewzbinId',
		 serverId: serverId,
		 newzbinId: nzbId,
		 newzbinIdName: newzbinIdName,
		 icon: nzbdStatus.selectSingleNode(doc, doc, '//img[@alt="nzbId'+nzbId+'"]'),
		 tries: 0
		 };
		nzbdStatus.queueEvent(newEvent);

		} catch(e) { dump('queueNewzbinId has thrown an error: '+e+'\n'); }

	},

	// Process a Send URL event
	sendUrl: function(eventDetails)
	{

		try {


		var serverDetails = this.serverDetails[eventDetails.serverId];
		var fullUrl = serverDetails.url, requestTimeout = nzbdStatus.getPreference('servers.timeoutSecs');

		switch (serverDetails.type)
		{
			case 'sabnzbd+':
				fullUrl += 'api?mode=addurl&name='+encodeURIComponent(eventDetails.url);
				if (serverDetails.username != null || serverDetails.password != null)
				{
					fullUrl += '&ma_username='+serverDetails.username+'&ma_password='+serverDetails.password;
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
		serverDetails.timeout = setTimeout(function() { nzbdStatus.abortRequestProcessing(processingHttp, eventDetails, serverDetails) }, requestTimeout);
		processingHttp.send(null);
/*
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

		gContextMenu.target.style.opacity = '.25';
*/

		} catch(e) { dump('sendUrl has thrown an error: '+e+'\n'); }

	},

	// Process a Send File event
	sendFile: function(eventDetails)
	{

		try {
dump('in sf\n');

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
		serverDetails.timeout = setTimeout(function() { nzbdStatus.abortRequestProcessing(processingHttp, eventDetails, serverDetails) }, requestTimeout);
		processingHttp.send(requestbody);

		} catch(e) { dump('sendFile has thrown an error: '+e+'\n'); }

	},

	// Process a Send Newzbin ID event
	sendNewzbinId: function(eventDetails)
	{

		try {

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
		serverDetails.timeout = setTimeout(function() { nzbdStatus.abortRequestProcessing(processingHttp, eventDetails, serverDetails) }, requestTimeout);
		processingHttp.send(null);

		} catch(e) { dump('sendNewzbinId has thrown an error: '+e+'\n'); }

	},

	processingResponse: function(responseText, eventDetails, serverDetails)
	{

		try {
dump('in pr\n');

		var alertMessage, alertTitle, responseStatus, retryLimit = nzbdStatus.getPreference('servers.retryLimit');
		clearTimeout(serverDetails.timeout);

		// Process based on server type
		switch (serverDetails.type)
		{
			case 'sabnzbd+':
				if (responseText.search(/ok\n/) > -1)
				{
					// Success
					responseStatus = true;
				}
				else
				{
					// Failure or unknown response
					responseStatus = false;
				}
				break;
			case 'hellanzb':
			case 'nzbget':
			default:
				// Something that's not been implemented yet
				dump('Unsupported server type `'+serverDetails.type+'` requested\n');
				responseStatus = false;
				break;
		}

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
						alertMessage = serverDetails.label+' has received URL '+eventDetails.url;
						alertTitle = 'URL Received';
					}
					else
					{
						alertMessage = serverDetails.label+' failed to receive URL '+eventDetails.url;
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

		} catch(e) { dump('processingResponse has thrown an error: '+e+'\n'); }

	},

	abortRequestProcessing: function(processingHttp, eventDetails, serverDetails)
	{

		try {
dump('in er\n');

		processingHttp.abort();
		nzbdStatus.processingResponse('', eventDetails, serverDetails)

		} catch(e) { dump('abortRequestProcessing has thrown an error: '+e+'\n'); }

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
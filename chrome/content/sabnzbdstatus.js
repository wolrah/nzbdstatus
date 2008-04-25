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

// The SABnzbdStatusObject definition itself
function SABnzbdStatusObject()
{
}
// Now extend it
SABnzbdStatusObject.prototype = {

	// Public variables
	refreshId: null, // setInterval container
	countdownId: null, // setInterval container
	refreshRate: null, // Controlled by a preference
	statusbar: null, // Shortcut
	statusicon: null, // Shortcut
	statuslabel: null, // Shortcut

	// Private variables
	_preferences: Components.classes['@mozilla.org/preferences;1']
	 .getService(Components.interfaces.nsIPrefService)
	 .getBranch('extensions.sabnzbdstatus.'),
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
		var sabUrl = this.getPreference('sabUrl') + this.getPreference('pauseUrl');
		var xmlHttp = this.xmlHttp;
		xmlHttp.open('GET', sabUrl, true);
		xmlHttp.send(null);
	},

	sendResume: function()
	{
		try {

		var sabUrl = this.getPreference('sabUrl') + this.getPreference('unpauseUrl');
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
		var sabUrl = this.getPreference('sabUrl');
		var xmlHttp = this.queueHttp;
		xmlHttp.open('POST', sabUrl, true);
		xmlHttp.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
		xmlHttp.setRequestHeader('Content-Length', postVars.length);
		xmlHttp.onload = SABnzbdStatus.processLogin;
		xmlHttp.send(postVars);

		} catch(e) {dump('logsab:'+e);}
	},

	processLogin: function()
	{
		var output = SABnzbdStatus.queueHttp.responseText;
		var tryingToLogin = (output.search(/<title>Login<\/title>/i) > -1);
		if (tryingToLogin)
		{
			// We didn't login so we'll try to read the username/password from Firefox
			var rootUrl = 'http://' + SABnzbdStatus.getPreference('sabUrl').split('/')[2];
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
							SABnzbdStatus.setPreference('sabusername', pass.user);
							SABnzbdStatus.setPreference('sabpassword', pass.password);
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
					SABnzbdStatus.setPreference('sabusername', logins[0].username);
					SABnzbdStatus.setPreference('sabpassword', logins[0].password);
					notFound = false;
				}
			}
			if (notFound)
			{
				// Didn't find it so we'll ask them
				window.openDialog('chrome://sabnzbdstatus/content/configuration.xul','sabnzb-prefs',
				 'chrome,dependent,titlebar,toolbar,centerscreen,resizable','sabnzb-sab');
			}
		}
		SABnzbdStatus.refreshStatus();
	},

	countdown: function()
	{
		try {

		var timeRemain = SABnzbdStatus.statuslabel.value;
		if (timeRemain == '' || timeRemain == '0:00:00')
		{
			SABnzbdStatus.goIdle();
			return;
		}

		timeRemain = SABnzbdStatus.convertTimeToSeconds(timeRemain) - 1;
		timeRemain = SABnzbdStatus.convertSecondsToTime(timeRemain);
		SABnzbdStatus.statuslabel.value = timeRemain;

		timeRemain = document.getElementById('sabstatus-jobs0-time').value;
		timeRemain = SABnzbdStatus.convertTimeToSeconds(timeRemain) - 1;
		timeRemain = SABnzbdStatus.convertSecondsToTime(timeRemain);
		document.getElementById('sabstatus-jobs0-time').value = timeRemain;

	} catch(e) { dump('countdown error:'+e); }
	},

	clickedOn: function(e)
	{
		try {

		var SABurl = this.getPreference('sabUrl');
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

		var nzbHistory = SABnzbdStatus.historyHttp.responseText;
		if (nzbHistory == '')
		{
			return;
		}

		if (nzbHistory.search(/<title>Login<\/title>/i) > -1)
		{
			SABnzbdStatus.loginToSAB();
			return;
		}

		nzbHistory = SABnzbdStatus.historyHttp.responseXML;

		var lastBuildDate = Date.parse(nzbHistory.getElementsByTagName('lastBuildDate').item(0).firstChild.data);
		var timeNow = Date.parse(Date());
		var refreshRate = SABnzbdStatus.getPreference('refreshRate');
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
			if (nzbDescription.search(/processing/i) > -1)
			{
				// It's finished, send an alert
				alertMessage = 'Post processing on ' + fileList[i].getElementsByTagName('title').item(i).firstChild.data + ' has finished';
				SABnzbdStatus.sendAlert('chrome://sabnzbdstatus/skin/sabnzbd.png', 'Download Completed', alertMessage);
			}
		}

		} catch(e) { dump('historyReceived error:' + e); }

	},

	queueReceived: function()
	{
		try {

		var output = SABnzbdStatus.queueHttp.responseText;
		if (output == '')
		{
			SABnzbdStatus.goIdle();
			return;
		}

		if (output.search(/<title>Login<\/title>/i) > -1)
		{
			SABnzbdStatus.goIdle();
			SABnzbdStatus.loginToSAB();
			return;
		}

		var status, speed, totalTimeRemain, totalMb, totalMbRemain, totalPer, curDL, curTime, curMbRemain;
		var finSpace, queue;
		if (!SABnzbdStatus.getPreference('legacyMode'))
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
			switch (SABnzbdStatus.getPreference('template'))
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
			SABnzbdStatus.goPaused();
			return;
		}
		if ((Math.floor(totalMbRemain) == 0) || speed == 0)
		{
			SABnzbdStatus.goIdle();
			return;
		}

		totalPer = Math.floor((1 - (totalMbRemain / totalMb)) * 100)+'%';
		totalTimeRemain = (totalMbRemain * 1024) / speed;
		totalTimeRemain = SABnzbdStatus.convertSecondsToTime(totalTimeRemain);
		curTime = (curMbRemain * 1024) / speed;
		curTime = SABnzbdStatus.convertSecondsToTime(curTime);

		SABnzbdStatus.statuslabel.value = totalTimeRemain;
		document.getElementById('sabstatus-kbpersec').value = Math.floor(speed) + ' KB/s';
		document.getElementById('sabstatus-mbleft').setAttribute('value', totalPer);
		document.getElementById('sabstatus-diskspace1').value = (Math.floor(finSpace * 100) / 100) + ' GB';
		document.getElementById('sabstatus-jobs0').value = curDL;
		document.getElementById('sabstatus-jobs0-time').value = curTime;

		SABnzbdStatus.goActive();

		} catch(e) { dump('ajax error:' + e); }
	},

	refreshStatus: function()
	{
		try {

		var queueUrl = SABnzbdStatus.getPreference('sabUrl') + SABnzbdStatus.getPreference('queueUrl');
		SABnzbdStatus.queueHttp.open('GET', queueUrl, true);
		SABnzbdStatus.queueHttp.onload = SABnzbdStatus.queueReceived;
		SABnzbdStatus.queueHttp.send(null);

		var historyUrl = SABnzbdStatus.getPreference('sabUrl') + SABnzbdStatus.getPreference('historyUrl');
		SABnzbdStatus.historyHttp.open('GET', historyUrl, true);
		SABnzbdStatus.historyHttp.overrideMimeType('text/xml');
		SABnzbdStatus.historyHttp.onload = SABnzbdStatus.historyReceived;
		SABnzbdStatus.historyHttp.send(null);

		} catch(e) { dump('refresh error:' + e); }
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
		if ((doc.location.href.search('v3.newzbin') == -1) && (doc.location.href.search('newzxxx') == -1))
		{
			return;
		}
		if (!SABnzbdStatus.getPreference('enableInNewzbin'))
		{
			// They'ved turned off the NewzBin features
			return;
		}
		var loggedIn = SABnzbdStatus.selectSingleNode(doc, doc, '//a[contains(@href,"/account/logout/")]');
		if (!loggedIn)
		{
			// Not logged in so drop out because they probably don't have a NewzBin account
			return;
		}
		var newzbinJS = doc.createElement('script');
		newzbinJS.type = 'text/javascript';
		newzbinJS.src = 'chrome://sabnzbdstatus/content/newzbin.js';
		doc.getElementsByTagName('head')[0].appendChild(newzbinJS);
		var newzbinCSS = doc.createElement('link');
		newzbinCSS.rel = 'stylesheet';
		newzbinCSS.type = 'text/css';
		newzbinCSS.href = 'chrome://sabnzbdstatus/content/newzbin.css';
		doc.getElementsByTagName('head')[0].appendChild(newzbinCSS);
		var serverList = doc.createElement('ul');
		serverList.id = 'serverList';
		serverList.className ='nzbdservers';
		serverList.innerHTML = '<li><img src="chrome://sabnzbdstatus/skin/download.png" alt="">Server 1</li><li><img src="chrome://sabnzbdstatus/skin/download.png" alt="">Server 2</li><li><img src="chrome://sabnzbdstatus/skin/download.png" alt="">Server 3</li><li><img src="chrome://sabnzbdstatus/skin/download.png" alt="">Server 4</li><li><img src="chrome://sabnzbdstatus/skin/download.png" alt="">Server 5</li>';
		serverList.addEventListener('mouseover', function(e){var doc = e.target.ownerDocument;doc.getElementById('serverList').style.display='block';}, false);
		serverList.addEventListener('mouseout', function(e){var doc = e.target.ownerDocument;doc.getElementById('serverList').style.display='none';}, false);
		doc.getElementsByTagName('body')[0].appendChild(serverList);

		// Report detail mode
		var results = SABnzbdStatus.selectNodes(doc, doc, '//form[@id="PostEdit"][contains(@action,"/browse/post/")]');
		if (results != null && results.length > 0)
		{
			SABnzbdStatus.reportSummaryPage(doc);
			return;
		}
		// Report browser mode
		results = SABnzbdStatus.selectNodes(doc, doc, '//a[contains(@href, "/nzb")][@title="Download report NZB"]');
		if (results != null && results.length > 0)
		{
			SABnzbdStatus.listingsPage(doc);
			return;
		}
		// File browser mode
		results = SABnzbdStatus.selectNodes(doc, doc, '//form[contains(@action,"/database/fileactions/")]');
		if (results != null && results.length > 0)
		{
			SABnzbdStatus.filesPage(doc);
			return;
		}

		} catch(e) { dump('onPageLoad error: '+e+'\n'); }
	},

	reportSummaryPage: function(doc)
	{
		var isFinished = SABnzbdStatus.selectSingleNode(doc, doc, '//img[@title="Report is complete"]');
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

		var results = SABnzbdStatus.selectNodes(doc, doc, '//form/table/tbody[not(@class="dateLine")]');  // Can't really make it any more specific and have it work in lite and regular still
		if (results.length == 1 && (results[0].textContent.search('No results') > -1))
		{
			return;
		}
		var row, postId, sendTo, oldTo, rowcount = results.length;
		for (i = 0; i < rowcount; i++)
		{
			row = results[i];
			oldTo = SABnzbdStatus.selectSingleNode(doc, row, 'tr/td/a[@title="Download report NZB"]');
			if (oldTo == null)
			{
				continue;
			}
			postId = oldTo.href.match(/post\/(\d+)\//);
			row.addEventListener('click', SABnzbdStatus.newzbinRowClick, false);
			postId = postId[1];
			sendTo = SABnzbdStatus.makeSendIcon(doc, postId);
			oldTo = SABnzbdStatus.selectSingleNode(doc, row, 'tr/td/a[@title="Download report NZB"]');
			oldTo.parentNode.replaceChild(sendTo, oldTo);
		}

		} catch(e) { dump('listingsPage error: '+e+'\n'); }
	},

	filesPage: function(doc)
	{
		var results = SABnzbdStatus.selectNodes(doc, doc, '//form[contains(@action,"/database/fileactions/")]/table/tbody[not(@class="dateLine")]');
		if (results.length == 1 && (results[0].textContent.search('No results') > -1))
		{
			return;
		}
		var row, postId, sendTo, oldTo, rowcount = results.length;
		for (i = 0; i < rowcount; i++)
		{
			row = results[i];
			row.addEventListener('click', SABnzbdStatus.newzbinRowClick, false);
			if (row.getElementsByTagName('img')[0].alt == 'Assigned')
			{
				oldTo = SABnzbdStatus.selectSingleNode(doc, row, 'tr/td/a[@title="Assigned; click to view Report"]');
				postId = oldTo.href.match(/post\/(\d+)\//)[1];
				sendTo = SABnzbdStatus.makeSendIcon(doc, postId);
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
		if (SABnzbdStatus.getPreference('editorMode'))
		{
			return;
		}
		e.currentTarget.getElementsByTagName('input')[0].click();
	},

	makeSendIcon: function(doc, postId)
	{
		var sendTo = doc.createElement('img');
		sendTo.src = SABnzbdStatus.getPreference('iconDownload');
		sendTo.alt = postId;
		sendTo.className = 'sabsend';
		sendTo.title = 'Send to SABnzbd';
		sendTo.addEventListener('click', SABnzbdStatus.sendToSAB, false);
		sendTo.addEventListener('mouseover', SABnzbdStatus.showServerList, false);
		sendTo.addEventListener('mouseout', SABnzbdStatus.hideServerList, false);
		return sendTo;
	},

	showServerList: function(e)
	{
		var doc = e.target.ownerDocument, targ = e.target;
		var sList = doc.getElementById('serverList');
		sList.style.display = 'block';
		sList.style.left = (e.originalTarget.x + targ.offsetWidth) + 'px';
		sList.style.top = (e.originalTarget.y - Math.floor((sList.offsetHeight - targ.offsetHeight) / 2)) + 'px';
		return;
	},

	hideServerList: function(e)
	{
		var doc = e.target.ownerDocument;
		var sList = doc.getElementById('serverList');
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
		if (SABnzbdStatus.checkForNZB())
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
		var fullUrl = SABnzbdStatus.getPreference('sabUrl') + SABnzbdStatus.getPreference('addID');
		if (SABnzbdStatus.getPreference('legacyMode'))
		{
			fullUrl += '?id=';
		}
		else
		{
			fullUrl += '?mode=addid&name=';
		}
		fullUrl += postid + '&pp=' + SABnzbdStatus.getPreference('newzbinToSAB');
		var xmlHttp = SABnzbdStatus.xmlHttp;
		xmlHttp.open('GET', fullUrl, true);
		xmlHttp.onload = SABnzbdStatus.goActiveSoon;
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
		var fullUrl = SABnzbdStatus.getPreference('sabUrl') + SABnzbdStatus.getPreference('addUrl');
		if (SABnzbdStatus.getPreference('legacyMode'))
		{
			fullUrl += '?url=';
		}
		else
		{
			fullUrl += '?mode=addurl&name=';
		}
		fullUrl += encodeURIComponent(href) + '&pp=' + SABnzbdStatus.getPreference('newzbinToSAB');
		var xmlHttp = SABnzbdStatus.xmlHttp;
		xmlHttp.open('GET', fullUrl, true);
		xmlHttp.onload = SABnzbdStatus.goActiveSoon;
		xmlHttp.send(null);
		gContextMenu.target.style.opacity = '.25';

		} catch(e) { dump('sendurl error: '+e+'\n'); }
	},

	uploadFile: function(filename, content)
	{
		try {

		var justname = filename.split(/(\/|\\)/)[filename.split(/(\/|\\)/).length-1];
		var fullUrl = this.getPreference('sabUrl') + this.getPreference('addFile');
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
		 '--' + boundary +'\nContent-Disposition: form-data; name="pp"\n\n' +
		 this.getPreference('filesToSAB') + '\n' + '--' + boundary + '--\n';

		// We don't use the object's one so that we can have multiple going
		var xmlHttp = SABnzbdStatus.xmlHttp;
		xmlHttp.open('POST', fullUrl, true);
		xmlHttp.setRequestHeader('Referer', this.getPreference('sabUrl'));
		xmlHttp.setRequestHeader('Content-Type', 'multipart/form-data; boundary=' + boundary);
		xmlHttp.setRequestHeader('Connection', 'close');
		xmlHttp.setRequestHeader('Content-Length', requestbody.length);
		xmlHttp.onload = SABnzbdStatus.goActiveSoon;
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
				SABnzbdStatus.observePreferences(subject, topic, data);
				break;
			case 'dl-done':
				SABnzbdStatus.observeFileDownload(subject, topic, data);
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
	}

	// Don't forget to add a comma
}

SABnzbdStatus = new SABnzbdStatusObject();

if (SABnzbdStatus)
{
	dump('SABnzbdStatus Loaded\n');
	window.addEventListener('load', function(e) { SABnzbdStatus.startup(); }, false);
	window.addEventListener('unload', function(e) { SABnzbdStatus.shutdown(); }, false);
}

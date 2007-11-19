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

// Based off inpheaux's SABnzbd/Newzbin Greasemonkey script
// (c) 2007 Ben Dusinberre

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
	_preferences: Components.classes["@mozilla.org/preferences;1"]
	 .getService(Components.interfaces.nsIPrefService)
	 .getBranch("extensions.sabnzbdstatus."),
	_xmlHttp: new XMLHttpRequest(),
	_askForPass: false,


	// Getters

	// Our link to the preference service
	get preferences()
	{
		return this._preferences;
	},

	// Ajax!
	get xmlHttp()
	{
		return this._xmlHttp;
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

	sendPause: function()
	{
		var sabUrl = this.getPreference('sabUrl') + this.getPreference('pauseUrl');
		this.xmlHttp.open('GET', sabUrl, true);
		this.xmlHttp.send(null);
	},

	sendResume: function()
	{
		try {

		var sabUrl = this.getPreference('sabUrl') + this.getPreference('unpauseUrl');
		this.xmlHttp.open('GET', sabUrl, true);
		this.xmlHttp.send(null);

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
		this.xmlHttp.open('POST', sabUrl, true);
		this.xmlHttp.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
		this.xmlHttp.setRequestHeader('Content-Length', postVars.length);
		this.xmlHttp.onload = SABnzbdStatus.processLogin;
		this.xmlHttp.send(postVars);

		} catch(e) {dump('logsab:'+e);}
	},

	processLogin: function()
	{
		var output = SABnzbdStatus.xmlHttp.responseText;
		var tryingToLogin = (output.search(/<title>Login<\/title>/i) > -1);
		if (tryingToLogin)
		{
			window.openDialog('chrome://sabnzbdstatus/content/configuration.xul','sabnzb-prefs','chrome,dependent,titlebar,toolbar,centerscreen,resizable','sabnzb-sab');
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
		this.statuslabel.style.visibility = 'visible';
		if (this.countdownId == null)
		{
			this.countdownId = window.setInterval(this.countdown, 1000);
		}
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

	queueReceived: function()
	{
		try {

		var output = SABnzbdStatus.xmlHttp.responseText;
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

		var status, speed, totalTimeRemain, totalMb, totalMbRemain, totalPer, curDL, curTime, curMbRemain, finSpace, queue;
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
		document.getElementById('sabstatus-kbpersec').value = speed + ' kb/s';
		document.getElementById('sabstatus-mbleft').setAttribute('value', totalPer);
		document.getElementById('sabstatus-diskspace1').value = finSpace + ' GB';
		document.getElementById('sabstatus-jobs0').value = curDL;
		document.getElementById('sabstatus-jobs0-time').value = curTime;

		SABnzbdStatus.goActive();

		} catch(e) { dump('ajax error:' + e); }
	},

	refreshStatus: function()
	{
		try {

		var queueUrl = SABnzbdStatus.getPreference('sabUrl') + SABnzbdStatus.getPreference('queueUrl');
		SABnzbdStatus.xmlHttp.open("GET", queueUrl, true);
		SABnzbdStatus.xmlHttp.onload = SABnzbdStatus.queueReceived;
		SABnzbdStatus.xmlHttp.send(null);

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
		// Make sure we are on the right site or close to it
		if ((doc.location.href.search('newzbin') == -1) && (doc.location.href.search('newzxxx') == -1))
		{
			return;
		}
		if (!SABnzbdStatus.getPreference('enableInNewzbin'))
		{
			return;
		}
		var engine = doc.location.hostname.split('.')[0];
		if (engine == 'www')
		{
			if (doc.location.href.search('newzxxx') == -1)
			{
				engine = 'v2';
			}
			else
			{
				engine = 'v3';
			}
		}
		var loggedIn = SABnzbdStatus.selectNodes(doc, doc, '//input[@name="username"]');
		loggedIn = (loggedIn.length == 0);
		if (!loggedIn)
		{
			return;
		}
		if (doc.getElementById('ReportInfoPH'))
		{
			SABnzbdStatus.reportSummaryPage(doc, engine);
		}
		var results = SABnzbdStatus.selectNodes(doc, doc, '//table[@summary="Post query results"]/tbody/tr');
		if (results == null || results.length == 0)
		{
			return;
		}
		else
		{
			SABnzbdStatus.listingsPage(doc, engine);
		}

		} catch(e) { dump('onPageLoad error: '+e+'\n'); }
	},

	reportSummaryPage: function(doc, engine)
	{
		var isFinished = SABnzbdStatus.selectSingleNode(doc, doc, '//span[text()="Finished"]');
		if (isFinished == null)
		{
			return;
		}
		var postId = doc.location.pathname.match(/(\d+)/)[1];
		sendTo = doc.createElement('img');
		sendTo.src = SABnzbdStatus.getPreference('iconDownload');
		sendTo.alt = postId;
		sendTo.className = 'sabsend';
		sendTo.title = 'Send to SABnzbd';
		sendTo.style.cursor = 'pointer';
		sendTo.style.paddingLeft = '1em';
		sendTo.addEventListener('click', SABnzbdStatus.sendToSAB, false);
		isFinished.appendChild(sendTo);
	},

	listingsPage: function(doc, engine)
	{
		var results = SABnzbdStatus.selectNodes(doc, doc, '//table[@summary="Post query results"]/tbody/tr');
		if (results.length == 1 && (results[0].textContent.search('No results') > -1))
		{
			return;
		}
		var row, postId, pattern, sendTo, oldTo, rowcount = results.length;
		for (i = 0; i < rowcount; i++)
		{
			row = results[i];
			// Cheap way to get the post id
			pattern = new RegExp('\/browse\/post\/(\\d+)\/' + (engine == 'v3'?'nzb':''));
			postId = row.innerHTML.match(pattern);
			if (postId == null)
			{
				continue;
			}
			postId = postId[1];
			sendTo = doc.createElement('img');
			sendTo.src = SABnzbdStatus.getPreference('iconDownload');
			sendTo.alt = postId;
			sendTo.className = 'sabsend';
			sendTo.title = 'Send to SABnzbd';
			sendTo.style.cursor = 'pointer';
			sendTo.addEventListener('click', SABnzbdStatus.sendToSAB, false);
			switch (engine)
			{
				case 'v3':
					oldTo = SABnzbdStatus.selectSingleNode(doc, row, 'td/a[@title="Download report NZB"]');
					oldTo.parentNode.replaceChild(sendTo, oldTo);
					break;
				case 'v2':
					sendTo.style.marginRight = '1em';
					oldTo = row.getElementsByTagName('td')[1];
					oldTo.insertBefore(sendTo, oldTo.getElementsByTagName('img')[0]);
					break;
			}
		}
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
		var fullUrl = SABnzbdStatus.getPreference('sabUrl') + SABnzbdStatus.getPreference('addID') +
		 '?id=' + postid + '&pp=' + SABnzbdStatus.getPreference('newzbinToSAB');
		SABnzbdStatus.xmlHttp.open('GET', fullUrl, true);
		SABnzbdStatus.xmlHttp.send(null);
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
		var fullUrl = SABnzbdStatus.getPreference('sabUrl') + SABnzbdStatus.getPreference('addUrl') +
		 '?url=' + encodeURIComponent(href) + '&pp=' + SABnzbdStatus.getPreference('newzbinToSAB');
		SABnzbdStatus.xmlHttp.open('GET', fullUrl, true);
		SABnzbdStatus.xmlHttp.send(null);
		gContextMenu.target.style.opacity = '.25';

		} catch(e) { dump('sendurl error: '+e+'\n'); }
	},

	// Initialization and starting of timers are done here
	startup: function()
	{
		var menu = document.getElementById("contentAreaContextMenu");
		menu.addEventListener("popupshowing", this.contextPopupShowing, false);
		this.statusbar = document.getElementById('sabstatus');
		this.statusicon = document.getElementById('sabstatus-image');
		this.statuslabel = document.getElementById('sabstatus-label');
		this.goIdle();
		if (this.getPreference('onlyShowIcon'))
		{
			this.statuslabel.style.visibility = 'collapse';
		}
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
	},

	// Shutdown stuff done here
	shutdown: function()
	{
		this.preferences.removeObserver('', this);
	},

	// This gets fired every time the preferences get changed
	observe: function(subject, topic, data)
	{
		if (topic != 'nsPref:changed')
		{
			return;
		}
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
		}
	}

	// Don't forget to add a comma
}

SABnzbdStatus = new SABnzbdStatusObject();

if (SABnzbdStatus)
{
	dump("SABnzbdStatus Loaded\n");
	window.addEventListener("load", function(e) { SABnzbdStatus.startup(); }, false);
	window.addEventListener("unload", function(e) { SABnzbdStatus.shutdown(); }, false);
}



/**


// this needs a trailing slash. edit it to whatever you use.
var sabnzbd_address = "http://localhost:8080/sabnzbd/";

// protip: don't mess with this part
var sabicon = "iVBORw0KGgoAAAANSUhEUgAAAA0AAAAPCAMAAAAI/bVFAAAAB3RJTUUH1wMWAAkDufYeVwAAAAlw"+
              "SFlzAAAewgAAHsIBbtB1PgAAAARnQU1BAACxjwv8YQUAAAAqUExURf8A/2lpaQAAAP////+1MUhI"+
              "SOyTCKVpC0VFRQIFAYSEhAMHAg4lCGZmZrcavpEAAAABdFJOUwBA5thmAAAAV0lEQVR42oWN2w7A"+
              "IAhDobixi/7/766VmextRZIeUtCMAjXsFRqV45fu3icBonNvpbxmsDCPz55jW2ecFdpz/izL55xH"+
              "0NKHUGM4rcpqjkVKVjNZV2a7PeEAAfzhg8sVAAAAAElFTkSuQmCC";

// new! exciting! function!
function sendToSABnzbd( evt ){
	var processingOptions = evt.currentTarget.id.substring(0,evt.currentTarget.id.indexOf('-'));
	var postID = evt.currentTarget.id.substring(evt.currentTarget.id.indexOf('-')+1, evt.currentTarget.id.length);

	if (processingOptions == "lvxd")
		processingOptions = 3;
	else
		processingOptions = 1;

	// Now with no trailing comma, for Opera compatibility (props to gooni)
	GM_xmlhttpRequest({ method: 'GET', url: sabnzbd_address + "addID?id=" + postID + "&pp=" + processingOptions	});

	// OPACITY IS THE BANE OF MY PITIFUL EXISTENCE!
	// BE AN INTERNET HERO! MAKE THIS WORK CROSS-PLATFORM AND FADE SMOOTHLY!
	var row = document.getElementById(postID);
	if (window.opera)
		row.className = "";
	else
		row.style.opacity = 0.2;
}

var p = document.getElementById('PostActions');

if (p){
	// while we're at it, let's remove the "Post Actions" box.
	var f = p.getElementsByTagName('fieldset')[0];
	p.removeChild(f);

	// ok, now lets get into what we're really here for.

	var group = document.getElementsByTagName('a');

	for (var i=0; i< group.length; i++) {
		if ( group[i].title.indexOf('Download report NZB') == 0 ) {

		// extract the postid from the adjacent image
		var postid = group[i].href.substring(group[i].href.length-11,group[i].href.length-4);

		var sablink = document.createElement('a');
			sablink.id = "lvxd-"+postid;
			sablink.innerHTML = "<img style=\"padding-left: 5px;\" onMouseOver=\"javascript:this.style.cursor = 'pointer';\" src=\"data:image/png;base64,"+sabicon+"\">";
            sablink.addEventListener('click', sendToSABnzbd, false);
			sablink.setAttribute("title", "Send report NZB to SABnzbd");
			group[i].parentNode.insertBefore(sablink, group[i].nextSibling);
			sablink.parentNode.parentNode.parentNode.id = postid;
		}
	}
}



// ok, so if we don't have PostActions, we might be on a detail view.
var tbles = document.getElementsByTagName('table');
for (var x=0; x<tbles.length; x++){

        if ( tbles[x].className.indexOf('dataIrregular')==0 ) {
		// ok we've got the table "dataIrregular"

		// oh bother i bet we need a postid.
		var formthing = document.getElementById('PostEdit');
		var postid = formthing.action.substring(formthing.action.length-8,formthing.action.length-1);

		var tbody = tbles[x].lastChild;

		var newrow = document.createElement("tr");
		tbody.appendChild(newrow);
		newrow.innerHTML = '<th>SABnzbd:</th>' +
				   '<td>' +
				   '<a href="' + sabnzbd_address + 'addID?id=' + postid + '&pp=1" title="Leech & Verify">LV</a> / ' +
				   '<a href="' + sabnzbd_address + 'addID?id=' + postid + '&pp=2" title="Leech, Verify & Extract">LVX</a> / ' +
				   '<a href="' + sabnzbd_address + 'addID?id=' + postid + '&pp=3" title="Leech, Verify, Extract & Delete">LVXD</a>' +
				   '</td>';
        }
}
/**/
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

// The sabnzbdServerObject definition itself
function sabnzbdServerObject(serverid)
{
	try {

	this.stringsBundle = document.getElementById("nzb-string-bundle"); // Localization
	this._preferences = Components.classes['@mozilla.org/preferences;1']
	 .getService(Components.interfaces.nsIPrefService)
	 .getBranch('extensions.nzbdstatus.servers.'+serverid+'.');

	this.serverid = serverid;
	this.enabled = this.getPreference('enable');
	this.showNotifications = this.getPreference('showNotifications');
	this.showInStatusBar = this.getPreference('showInStatusBar');
	this.label = this.getPreference('label');
	this.url = this.getPreference('url');
	this.apikey = this.getPreference('apikey');
	this.username = this.getPreference('username');
	this.password = this.getPreference('password');
	this.type = 'sabnzbd';
	this.icon = this.getPreference('icon');
	this.extension = 'nzb';
	this.paused = false;

	} catch(e) { this.errorLogger('connect',e); }
}
// Now extend it
sabnzbdServerObject.prototype = {

	// Public properties
	connected: false,
	loginNeeded: false,
	apikeyNeeded: true,

	// Private properties
	_preferences: null,
	_queueHttp: new XMLHttpRequest(), // One httpRequest object for the processing queue


	// Getters

	// Our link to the preference service
	get preferences()
	{
		return this._preferences;
	},

	// Ajax for little things that shouldn't conflict
	get xmlHttp()
	{
		return new XMLHttpRequest();
	},

	// Ajax for the processing queue
	get queueHttp()
	{
		return this._queueHttp;
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


	///
	/// Startup & init functions
	///

	// This is the stuff you do when you add the server
	connect: function()
	{
		try {

		this.checkIfApiKeyNeeded();

		} catch(e) { this.errorLogger('connect',e); }
	},

	checkIfApiKeyNeeded: function()
	{
		var fullUrl = this.url + 'api?mode=version&output=xml';
		var xmldoc = this.xmlHttp;
		var thisServer = this;
		xmldoc.open('GET', fullUrl, true);
		xmldoc.onload = function() { thisServer.checkIfApiKeyNeededResponse(this); };
		this.connectiontimeout = setTimeout(function() { thisServer.abortTest(xmldoc); }, 30000);
		xmldoc.send(null);
	},

	abortTest: function(xmldoc)
	{
		xmldoc.abort();
		this.connected = false;
		this.logger('Timed out trying to connect to server for initial check');
	},

	checkIfApiKeyNeededResponse: function(that)
	{
		try {

		clearTimeout(this.connectiontimeout);
		if (that.status == 200)
		{
			if ((that.responseText.search('<title>Login</title>') > -1) || (that.responseText.search('Missing authentication') > -1))
			{
				if (this.loginNeeded)
				{
					// The username/password we tried was wrong, stop trying for now
					this.connected = false;
					this.logger('Username/Password required but was wrong');
					return;
				}
				// Username / Password required
				this.loginNeeded = true;
				this.getLogin();
				this.checkIfApiKeyNeeded();
				return;
			}
			var version = that.responseXML.getElementsByTagName('version')[0].textContent;
			if (version == 'trunk')
			{
				version = '99.99.99';
			}
			this.serverVersion = version;
			if ((version.split('.')[1] < 4) || ((version.split('.')[1] == 4) && (version.split('.')[2] < 9)))
			{
				// Don't need an API key
				this.apikeyNeeded = false;
			}
			else
			{
				// Lets confirm we need the key and that it's correct
				this.apikeyNeeded = true;
				var fullUrl = this.url + 'api?mode=get_cats&output=json&apikey=' + this.apikey;
				if (this.loginNeeded)
				{
					fullUrl += '&ma_username='+encodeURIComponent(this.username)+'&ma_password='+encodeURIComponent(this.password);
				}
				var xmldoc = this.xmlHttp;
				var thisServer = this;
				xmldoc.open('GET', fullUrl, true);
				xmldoc.onload = function() { thisServer.confirmApiKeyNeeded(this); };
				this.connectiontimeout = setTimeout(function() { thisServer.abortTest(xmldoc); }, 30000);
				xmldoc.send(null);
			}
		}
		if (that.status == 500)
		{
			// Got an error trying get version (usually) means it's old so we don't need an api key
			this.apikeyNeeded = false;
			this.serverVersion = '0.4.6';
		}
		this.connected = true;

		} catch(e) { this.errorLogger('checkIfApiKeyNeededResponse',e); }
	},

	confirmApiKeyNeeded: function(that)
	{
		try {

		clearTimeout(this.connectiontimeout);
		if ((that.status == 200) || (that.status == 500))
		{
			if (that.responseText.search('Missing authentication') > -1)
			{
				if (this.loginNeeded)
				{
					// The username/password we tried was wrong, stop trying for now
					this.connected = false;
					this.logger('Username/Password required but was wrong');
					return;
				}
				// Username / Password required
				this.loginNeeded = true;
				this.getLogin();
				this.checkIfApiKeyNeeded();
				return;
			}
			if ((that.responseText.search('API Key Required') > -1) || (that.responseText.search('API Key Incorrect') > -1))
			{
				// Open a new tab with the config and prompt for the apikey
				var newTabBrowser = gBrowser.getBrowserForTab(gBrowser.selectedTab = gBrowser.addTab(this.url + 'config/general/'));
				newTabBrowser.addEventListener('load', function() {
					var apikeydoc = newTabBrowser.contentDocument.getElementById('apikey');
					apikeydoc.scrollIntoView(true);
					}, true);
				var prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"].getService(Components.interfaces.nsIPromptService);
				var check = {value: false};
				var newApiKey = {value: ''};
				var keyReqText = this.stringsBundle.getString('keyReqText');
				var result = prompts.prompt(null, 'nzbdStatus', keyReqText, newApiKey, null, check);
				if (result && newApiKey.value != '')
				{
					this.setPreference('apikey', newApiKey.value);
					this.apiKey = newApiKey.value;
				}
				else
				{
					var keyReqFailText = this.stringsBundle.getString('keyReqFailText');
					prompts.alert(null, 'nzbdStatus', keyReqFailText);
				}
			}
		}

		} catch(e) { this.errorLogger('confirmApiKeyNeeded',e); }
	},


	///
	/// Send events
	///

	sendUrl: function(eventDetails)
	{
		try{
nzbdStatus.logger('in sab.sendUrl');

		var fullUrl = this.url + 'api?mode=addurl';
		fullUrl += '&name='+encodeURIComponent(eventDetails.url);
		if (this.loginNeeded)
		{
			fullUrl += '&ma_username='+encodeURIComponent(this.username)+'&ma_password='+encodeURIComponent(this.password);
		}
		if (this.apikeyNeeded)
		{
			fullUrl += '&apikey='+this.apikey;
		}
		if ((eventDetails.category != null) && (eventDetails.category != 'None'))
		{
			fullUrl += '&cat='+eventDetails.category;
		}

		var processingResponse = this.processingResponse;
		var queueHttp = this.queueHttp;
		queueHttp.open('GET', fullUrl, true);
		queueHttp.onload = function() { processingResponse(this.responseText, eventDetails) };
		queueHttp.send(null);

		} catch(e) { this.errorLogger('sab.sendUrl',e); }
	},

	sendFile: function(eventDetails)
	{
		try{
nzbdStatus.logger('in sab.sendFile');
/*
		var fullUrl = this.url + 'api?mode=addurl';
		fullUrl += '&name='+encodeURIComponent(eventDetails.url);
		if (this.loginNeeded)
		{
			fullUrl += '&ma_username='+encodeURIComponent(this.username)+'&ma_password='+encodeURIComponent(this.password);
		}
		if (this.apikeyNeeded)
		{
			fullUrl += '&apikey='+this.apikey;
		}
		if ((eventDetails.category != null) && (eventDetails.category != 'None'))
		{
			fullUrl += '&cat='+eventDetails.category;
		}

		var processingResponse = this.processingResponse;
		var queueHttp = this.queueHttp;
		queueHttp.open('GET', fullUrl, true);
		queueHttp.onload = function() { processingResponse(this.responseText, eventDetails) };
		queueHttp.send(null);
*/
		} catch(e) { this.errorLogger('sab.sendFile',e); }
	},

	processingResponse: function(responseText, eventDetails)
	{
		try {
nzbdStatus.logger('in sab.processingResponse');
		if (responseText.search(/ok\n/) > -1)
		{
			// Success
			var responseStatus = true;
		}
		else
		{
			// Failure or unknown response
			var responseStatus = false;
		}
		eventDetails.callback(responseStatus, eventDetails);

		} catch(e) { this.errorLogger('sab.processingResponse',e); }
	},

	abortLastSend: function()
	{
		this.queueHttp.abort();
	},

	refresh: function(eventDetails)
	{
		var fullUrl = this.url + 'api?mode=queue&output=json';
		if (this.apikeyNeeded)
		{
			fullUrl += '&apikey='+this.apikey;
		}
		if (this.loginNeeded)
		{
			fullUrl += '&ma_username='+encodeURIComponent(this.username)+'&ma_password='+encodeURIComponent(this.password);
		}
		var queueReceived = this.queueReceived;
		var xmldoc = this.xmlHttp;
		xmldoc.open('GET', fullUrl, true);
		that = this;
		xmldoc.onload = function() { queueReceived(this, eventDetails, that); };
		xmldoc.send(null);
	},

	queueReceived: function(that, eventDetails, thisObject)
	{
		try {

		if (that.status != 200)
		{
			dump('queueReceived status: '+that.status+'\n');
			eventDetails.callback(false, eventDetails);
			return;
		}
		var output = that.responseText;
		if (output == '')
		{
			dump('queueReceived empty output\n');
			eventDetails.callback(false, eventDetails);
			return;
		}
		if ((output.search('<title>Login</title>') > -1) || (output.search('Missing authentication') > -1))
		{
			dump('queueReceived Not logged in\n');
			eventDetails.callback(false, eventDetails);
			return;
		}

		var i, status, queue;

		if (!JSON)
		{
			// Firefox 3.0 didn't have the JSON object out like in 3.5+
			var nativeJSON = Components.classes["@mozilla.org/dom/json;1"].createInstance(Components.interfaces.nsIJSON);
			queueData = nativeJSON.decode(output);
		}
		else
		{
			queueData = JSON.parse(output);
		}

		if (queueData.queue.paused == true || queueData.queue.paused.toLowerCase == 'true')
		{
			thisObject.paused = true;
			eventDetails.callback('pause', eventDetails);
			return;
		}
		if ((Math.floor(queueData.queue.mbleft) == 0) || queueData.queue.kbpersec < 5)
		{
			thisObject.paused = false;
			eventDetails.callback('idle', eventDetails);
			return;
		}
		thisObject.paused = false;

		if (queueData.queue.slots.length > 0)
		{
			i = 0;
			do
			{
				/// TODO: Fix case for when all slots are paused
				jobData = queueData.queue.slots[i++]
			}
			while (jobData.status.toLowerCase() == 'paused')
		}
		else
		{
			/// TODO: Queue is empty but it's still download?
		}

		if (Math.floor(queueData.queue.kbpersec) > 1100)
		{
			var kbpersec = Math.floor(queueData.queue.kbpersec / 100) / 10 + ' MB/s';
		}
		else
		{
			var kbpersec = Math.floor(queueData.queue.kbpersec) + ' KB/s';
		}

dump('serverId: '+eventDetails.serverid+'\n');
dump('timeleft: '+queueData.queue.timeleft+'\n');
dump('kbpersec: '+kbpersec+'\n')
dump('percent:  '+jobData.percentage+'\n')
dump('finSpace: '+queueData.queue.diskspace1+'\n')
dump('filename: '+jobData.filename+'\n')
dump('curTime:  '+jobData.timeleft+'\n')

		// The Total Time Remaining goes on the widget
		document.getElementById('nzbdstatus-panel-'+eventDetails.serverid).getElementsByClassName('nzbdstatus-label')[0].value = queueData.queue.timeleft;
		document.getElementById('nzbdstatus-panel-'+eventDetails.serverid).getElementsByClassName('nzbdstatus-kbpersec')[0].value = kbpersec;
		document.getElementById('nzbdstatus-panel-'+eventDetails.serverid).getElementsByClassName('nzbdstatus-mbleft')[0].setAttribute('value', jobData.percentage+'%');
		document.getElementById('nzbdstatus-panel-'+eventDetails.serverid).getElementsByClassName('nzbdstatus-diskspace1')[0].value = (Math.floor(queueData.queue.diskspace1 * 100) / 100) + ' GB';
		document.getElementById('nzbdstatus-panel-'+eventDetails.serverid).getElementsByClassName('nzbdstatus-jobs0')[0].value = jobData.filename;
		document.getElementById('nzbdstatus-panel-'+eventDetails.serverid).getElementsByClassName('nzbdstatus-jobs0-time')[0].value = jobData.timeleft;

		eventDetails.callback('active', eventDetails);

		} catch(error) {dump('sab.queue threw error `' + error.message + '` on line: ' + error.lineNumber + '\n'); }
	},

	pause: function(eventDetails)
	{
		try{
nzbdStatus.logger('in sab.pause');

		var fullUrl = this.url + 'api?mode=pause';
		if (this.loginNeeded)
		{
			fullUrl += '&ma_username='+encodeURIComponent(this.username)+'&ma_password='+encodeURIComponent(this.password);
		}
		if (this.apikeyNeeded)
		{
			fullUrl += '&apikey='+this.apikey;
		}

		var processingResponse = this.processingResponse;
		var queueHttp = this.queueHttp;
		queueHttp.open('GET', fullUrl, true);
		queueHttp.onload = function() { processingResponse(this.responseText, eventDetails) };
		queueHttp.send(null);

		this.paused = true;

		} catch(e) { this.errorLogger('sab.pause',e); }
	},

	resume: function(eventDetails)
	{
		try{
nzbdStatus.logger('in sab.resume');

		var fullUrl = this.url + 'api?mode=resume';
		if (this.loginNeeded)
		{
			fullUrl += '&ma_username='+encodeURIComponent(this.username)+'&ma_password='+encodeURIComponent(this.password);
		}
		if (this.apikeyNeeded)
		{
			fullUrl += '&apikey='+this.apikey;
		}

		var processingResponse = this.processingResponse;
		var queueHttp = this.queueHttp;
		queueHttp.open('GET', fullUrl, true);
		queueHttp.onload = function() { processingResponse(this.responseText, eventDetails) };
		queueHttp.send(null);

		this.paused = false;

		} catch(e) { this.errorLogger('sab.resume',e); }
	},

	errorLogger: function(fName, error)
	{
		if (!nzbdStatus.getPreference('showErrors'))
		{
			return;
		}
		var msg = 'sabnzbdServerObject.' + fName + ' threw error `' + error.message + '` on line: ' + error.lineNumber + '\n';
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

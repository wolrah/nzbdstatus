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
function sabnzbdServerObject(serverId)
{
	try {

	this.stringsBundle = document.getElementById("nzb-string-bundle"); // Localization
	this._preferences = Components.classes['@mozilla.org/preferences;1']
	 .getService(Components.interfaces.nsIPrefService)
	 .getBranch('extensions.nzbdstatus.servers.'+serverId+'.');

	this.serverId = serverId;
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
					fullUrl += '&ma_username='+this.username+'&ma_password='+this.password;
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

nzbdStatus.logger('in sendurl');
		var fullUrl = this.url + 'api?mode=addurl';
		fullUrl += '&name='+encodeURIComponent(eventDetails.url);
		if (this.loginNeeded)
		{
			fullUrl += '&ma_username='+this.username+'&ma_password='+this.password;
		}
		if (this.apikeyNeeded)
		{
			fullUrl += '&apikey='+this.apikey;
		}
		if ((eventDetails.category != null) && (eventDetails.category != 'None'))
		{
			fullUrl += '&cat='+eventDetails.category;
		}
nzbdStatus.logger(fullUrl);

		var processingResponse = this.processingResponse;
		var queueHttp = this.queueHttp;
		queueHttp.open('GET', fullUrl, true);
		queueHttp.onload = function() { processingResponse(this.responseText, eventDetails) };
		queueHttp.send(null);

		} catch(e) { this.errorLogger('sab.sendUrl',e); }
	},

	processingResponse: function(responseText, eventDetails)
	{
		try {
nzbdStatus.logger('in processingResponse');
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

	refresh: function()
	{
		var fullUrl = this.url + 'api?mode=qstatus&output=json';
		if (this.apikeyNeeded)
		{
			fullUrl += '&apikey='+this.apikey;
		}
		if (this.loginNeeded)
		{
			fullUrl += '&ma_username='+this.username+'&ma_password='+this.password;
		}
		var xmldoc = this.xmlHttp;
		var thisServer = this;
		xmldoc.open('GET', fullUrl, true);
		xmldoc.onload = function() { thisServer.queueReceived(this); };
		//this.timeout = setTimeout(function() { thisServer.abortTest(xmldoc); }, 10000);
		xmldoc.send(null);
	},

	queueReceived: function(that)
	{
		try {

		if (that.status != 200)
		{
			dump('queueReceived status: '+that.status+'\n');
			return;
		}
		var output = that.responseText;
		if (output == '')
		{
			dump('queueReceived empty output\n');
			return;
		}
		if ((output.search('<title>Login</title>') > -1) || (output.search('Missing authentication') > -1) || (nzbdStatus.connectionTest == false))
		{
			dump('queueReceived Not logged in\n');
			return;
		}

		var status, speed, totalTimeRemain, totalMb, totalMbRemain, totalPer, curDL, curTime, curMbRemain, finSpace, queue;

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

		speed = queueData.kbpersec;
		totalMbRemain = queueData.mbleft;
		totalMb = queueData.mb;
//dump('1\n');
		if (queueData.jobs.length > 0)
		{
			curDL = queueData.jobs[0].filename;
			curMbRemain = queueData.jobs[0].mbleft;
		}
		finSpace = queueData.diskspace1;
		if (queueData.paused == true || queueData.paused == 'true')
		{
			status = 'pause';
		}
//dump('2\n');

		if (status == 'pause')
		{
			//nzbdStatus.goPaused();
			return;
		}
		if ((Math.floor(totalMbRemain) == 0) || speed == 0)
		{
			//nzbdStatus.goIdle();
			return;
		}

		totalPer = Math.floor((1 - (totalMbRemain / totalMb)) * 100)+'%';
		totalTimeRemain = (totalMbRemain * 1024) / speed;
		totalTimeRemain = nzbdStatus.convertSecondsToTime(totalTimeRemain);
		curTime = (curMbRemain * 1024) / speed;
		curTime = nzbdStatus.convertSecondsToTime(curTime);

		document.getElementById('nzbdstatus-panel-'+this.serverId).getElementsByClassName('nzbdstatus-label')[0].value = totalTimeRemain;
		if (Math.floor(speed) > 1100)
		{
			var kbpersec = Math.floor(speed / 100) / 10 + ' MB/s';
		}
		else
		{
			var kbpersec = Math.floor(speed) + ' KB/s';
		}
		document.getElementById('nzbdstatus-panel-'+this.serverId).getElementsByClassName('nzbdstatus-kbpersec')[0].value = kbpersec;
		document.getElementById('nzbdstatus-panel-'+this.serverId).getElementsByClassName('nzbdstatus-mbleft')[0].setAttribute('value', totalPer);
		document.getElementById('nzbdstatus-panel-'+this.serverId).getElementsByClassName('nzbdstatus-diskspace1')[0].value = (Math.floor(finSpace * 100) / 100) + ' GB';
		document.getElementById('nzbdstatus-panel-'+this.serverId).getElementsByClassName('nzbdstatus-jobs0')[0].value = curDL;
		document.getElementById('nzbdstatus-panel-'+this.serverId).getElementsByClassName('nzbdstatus-jobs0-time')[0].value = curTime;
dump('kbpersec: '+kbpersec+'\n')
dump('totalPer: '+totalPer+'\n')
dump('finSpace: '+finSpace+'\n')
dump('curDL: '+curDL+'\n')
dump('curTime: '+curTime+'\n')


		nzbdStatus.goActive(this.serverId);


		} catch(error) {dump('queue threw error `' + error.message + '` on line: ' + error.lineNumber + '\n'); }
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

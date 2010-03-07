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

	this.enabled = this.getPreference('enable');
	this.showNotifications = this.getPreference('showNotifications');
	this.showStatusBar = this.getPreference('showInStatusBar');
	this.label = this.getPreference('label');
	this.url = this.getPreference('url');
	this.apikey = this.getPreference('apikey');
	this.username = this.getPreference('username');
	this.password = this.getPreference('password');
	this.type = this.getPreference('type');
	this.icon = this.getPreference('icon');

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



	// This is the stuff you do when you add the server
	connect: function()
	{
		try {

		this.checkIfApiKeyNeeded();

		} catch(e) { this.errorLogger('connect',e); }

/*			// There's no apikey stored so we'll check if there's a password saved
			rootUrl = fullUrl.match(/(https?:\/\/([^\/]+))/)[1];
			var logins = passwordManager.findLogins({}, rootUrl, rootUrl, null);
			if (logins.length > 0)
			{
				username = logins[0].username;
				password = logins[0].password;
			}
*/
	},

	checkIfApiKeyNeeded: function()
	{
		var fullUrl = this.url + 'api?mode=version&output=xml';
		var xmldoc = this.xmlHttp;
		var thisServer = this;
		xmldoc.open('GET', fullUrl, true);
		xmldoc.onload = function() { thisServer.checkIfApiKeyNeededResponse(this); };
		this.timeout = setTimeout(function() { thisServer.abortTest(xmldoc); }, 10000);
		xmldoc.send(null);
	},

	abortTest: function(xmldoc)
	{
		xmldoc.abort();
		this.connected = false;
	},

	checkIfApiKeyNeededResponse: function(that)
	{
		clearTimeout(this.timeout);
		if (that.status == 200)
		{
			if ((that.responseText.search('<title>Login</title>') > -1) || (that.responseText.search('Missing authentication') > -1))
			{
				if (this.loginNeeded)
				{
					// The username/password we tried was wrong, stop trying for now
					this.connected = false;
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
				var fullUrl = this.url + 'api?mode=get_cats&output=xml&apikey=' + this.apikey;
				if (this.loginNeeded)
				{
					fullUrl += '&ma_username='+this.username+'&ma_password='+this.password;
				}
				var xmldoc = this.xmlHttp;
				var thisServer = this;
				xmldoc.open('GET', fullUrl, true);
				xmldoc.onload = function() { thisServer.confirmApiKeyNeeded(this); };
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
	},

	confirmApiKeyNeeded: function(that)
	{
		if ((that.status == 200) || (that.status == 500))
		{
			if (that.responseText.search('Missing authentication') > -1)
			{
				if (this.loginNeeded)
				{
					// The username/password we tried was wrong, stop trying for now
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
	},

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
	}

}

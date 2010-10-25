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


function nzbdStatusConfigObject()
{
}
// Now extend it
nzbdStatusConfigObject.prototype = {

	// Public variables
	stringsBundle: document.getElementById('nzb-config-string-bundle'),

	// Private variables
	_preferences: Components.classes['@mozilla.org/preferences;1']
	 .getService(Components.interfaces.nsIPrefService)
	 .getBranch('extensions.nzbdstatus.'),

	// Getters

	// Our link to the preference service
	get preferences()
	{
		return this._preferences;
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

	prefonload: function()
	{
		try {
		// Get the version number then insert it into the box
		/// TODO: Update this to the new code for FF4
		var fuel = Components.classes["@mozilla.org/fuel/application;1"].getService(Components.interfaces.fuelIApplication);
		var extInfo = fuel.extensions.get('sabnzbdstatus@dq5studios.com');
		document.getElementById('sabversion').setAttribute('value', extInfo.version);

		nzbdStatusConfig.buildServerList();
		nzbdStatusConfig.buildServerDeck();
		nzbdStatusConfig.buildServerPreferences();
		nzbdStatusConfig.inactivateMovement();
		// Check to see if we're supposed to open a certain panel
		if (window.arguments && window.arguments.length != 0)
		{
			var selected = document.getElementById(window.arguments[0]);
			document.getElementById('nzbd-prefs').showPane(selected);
		}
		window.sizeToContent();
		document.getElementById('nzbdserver-list').selectedIndex = 0;
		} catch(e) {dump('prefonload error: '+e+'\n'); }
	},

	buildServerList: function()
	{
		try {
		var j = 0, sList = document.getElementById('nzbdserver-list');
		var serverOrder = this.getPreference('servers.order').split(',');
		for each (var i in serverOrder)
		{
			sList.insertItemAt(j++, this.getPreference('servers.'+i+'.label'), i);
		}
		} catch(e) {dump('buildlists error: '+e+'\n'); }
	},

	buildServerDeck: function()
	{
		var serverOrder = this.getPreference('servers.order').split(',');
		for each (var i in serverOrder)
		{
			this.addServerDeck(i);
		}
	},

	addServerDeck: function(serverId, iAfter)
	{
		var sDeck = document.getElementById('nzbdserver-deck');
		var sTemplate = document.getElementById('nzbdserver-deck-template');
		var newDeck = sTemplate.cloneNode(true);
		var nAtt;
		newDeck.getElementsByTagName('caption')[0].setAttribute('label', this.getPreference('servers.'+serverId+'.label'));
		newDeck.setAttribute('id', newDeck.id.replace(/template/, serverId));
		var elems = newDeck.getElementsByClassName('nzbd-updatepref');
		for (j = 0; j < elems.length; j++)
		{
			nAtt = elems[j].getAttribute('preference');
			elems[j].setAttribute('preference', nAtt.replace(/template/, serverId));
		}
		var elems = newDeck.getElementsByClassName('nzbd-update');
		for (j = 0; j < elems.length; j++)
		{
			nAtt = elems[j].getAttribute('id');
			elems[j].setAttribute('id', nAtt.replace(/template/, serverId));
		}
		if (iAfter == undefined)
		{
			sDeck.insertBefore(newDeck, sTemplate);
		}
		else
		{
			sDeck.insertBefore(newDeck, document.getElementById('nzbdserver-deck-'+iAfter).nextSibling);
		}
	},

	buildServerPreferences: function()
	{
		var serverOrder = this.getPreference('servers.order').split(',');
		for each (var i in serverOrder)
		{
			this.addServerPreferences(i);
		}
	},

	addServerPreferences: function(serverId)
	{
		var sPrefs = document.getElementById('nzbdserver-preferences');
		var newPref = document.createElement('preference');
		newPref.setAttribute('id', 'nzbdlabel-'+serverId);
		newPref.setAttribute('name', 'extensions.nzbdstatus.servers.'+serverId+'.label');
		newPref.setAttribute('type', 'string');
		sPrefs.appendChild(newPref);
		newPref = document.createElement('preference');
		newPref.setAttribute('id', 'nzbdurl-'+serverId);
		newPref.setAttribute('name', 'extensions.nzbdstatus.servers.'+serverId+'.url');
		newPref.setAttribute('type', 'string');
		sPrefs.appendChild(newPref);
		newPref = document.createElement('preference');
		newPref.setAttribute('id', 'nzbdapikey-'+serverId);
		newPref.setAttribute('name', 'extensions.nzbdstatus.servers.'+serverId+'.apikey');
		newPref.setAttribute('type', 'string');
		sPrefs.appendChild(newPref);
		newPref = document.createElement('preference');
		newPref.setAttribute('id', 'nzbdusername-'+serverId);
		newPref.setAttribute('name', 'extensions.nzbdstatus.servers.'+serverId+'.username');
		newPref.setAttribute('type', 'string');
		sPrefs.appendChild(newPref);
		newPref = document.createElement('preference');
		newPref.setAttribute('id', 'nzbdpassword-'+serverId);
		newPref.setAttribute('name', 'extensions.nzbdstatus.servers.'+serverId+'.password');
		newPref.setAttribute('type', 'string');
		sPrefs.appendChild(newPref);
		newPref = document.createElement('preference');
		newPref.setAttribute('id', 'nzbdserver-'+serverId);
		newPref.setAttribute('name', 'extensions.nzbdstatus.servers.'+serverId+'.type');
		newPref.setAttribute('type', 'string');
		sPrefs.appendChild(newPref);
		newPref = document.createElement('preference');
		newPref.setAttribute('id', 'nzbdicon-'+serverId);
		newPref.setAttribute('name', 'extensions.nzbdstatus.servers.'+serverId+'.icon');
		newPref.setAttribute('type', 'string');
		sPrefs.appendChild(newPref);
		newPref = document.createElement('preference');
		newPref.setAttribute('id', 'nzbdshownotif-'+serverId);
		newPref.setAttribute('name', 'extensions.nzbdstatus.servers.'+serverId+'.showNotifications');
		newPref.setAttribute('type', 'bool');
		sPrefs.appendChild(newPref);
		newPref = document.createElement('preference');
		newPref.setAttribute('id', 'nzbdenable-'+serverId);
		newPref.setAttribute('name', 'extensions.nzbdstatus.servers.'+serverId+'.enable');
		newPref.setAttribute('type', 'bool');
		sPrefs.appendChild(newPref);
		newPref = document.createElement('preference');
		newPref.setAttribute('id', 'nzbdshowstatus-'+serverId);
		newPref.setAttribute('name', 'extensions.nzbdstatus.servers.'+serverId+'.showInStatusBar');
		newPref.setAttribute('type', 'bool');
		sPrefs.appendChild(newPref);
	},

	inactivateMovement: function()
	{
		var serverOrder = this.getPreference('servers.order').split(',');
		//var firstS = serverOrder[0];
		//var lastS = serverOrder[serverOrder.length-1];
		//document.getElementById('nzbdserver-deck-'+firstS).getElementsByClassName('goback')[0].setAttribute('disabled', 'true');
		//document.getElementById('nzbdserver-deck-'+lastS).getElementsByClassName('goforward')[0].setAttribute('disabled', 'true');
	},

	activateMovement: function()
	{
		var serverOrder = this.getPreference('servers.order').split(',');
		//var firstS = serverOrder[0];
		//var lastS = serverOrder[serverOrder.length-1];
		//document.getElementById('nzbdserver-deck-'+firstS).getElementsByClassName('goback')[0].setAttribute('disabled', 'false');
		//document.getElementById('nzbdserver-deck-'+lastS).getElementsByClassName('goforward')[0].setAttribute('disabled', 'false');
	},

	addServer: function()
	{
		var serverOrder = nzbdStatusConfig.getPreference('servers.order').split(',');
		var sList = document.getElementById('nzbdserver-list');
		var curSel = sList.currentIndex;
		var newServerName = this.stringsBundle.getString('newServer');
		var newServerid = Math.max.apply(Math, serverOrder) + 1;
		sList.insertItemAt(curSel + 1, newServerName, newServerid);
		serverOrder.splice(curSel + 1, 0, newServerid);
		nzbdStatusConfig.setPreference('servers.order', serverOrder.join(','));

		nzbdStatusConfig.addServerPreferences(newServerid);

		nzbdStatusConfig.preferences.setCharPref('servers.'+newServerid+'.label', newServerName);
		nzbdStatusConfig.preferences.setCharPref('servers.'+newServerid+'.icon', 'flag_red.png');
		nzbdStatusConfig.preferences.setCharPref('servers.'+newServerid+'.type', 'sabnzbd');

		nzbdStatusConfig.addServerDeck(newServerid, serverOrder[curSel]);
		document.getElementById('nzbdiconid-'+newServerid).selectedIndex = 0;
		document.getElementById('nzbdserverid-'+newServerid).selectedIndex = 0;
		document.getElementById('nzbdserver-deck-'+newServerid).getElementsByTagName('caption')[0].setAttribute('label', newServerName);

		sList.moveByOffset(1, true, false);
	},

	removeServer: function()
	{
		var serverOrder = nzbdStatusConfig.getPreference('servers.order').split(',');
		var curSel = document.getElementById('nzbdserver-list').currentIndex;
		var serverid = serverOrder[curSel];
		serverOrder.splice(curSel, 1);
		nzbdStatusConfig.setPreference('servers.order', serverOrder.join(','));

		var sList = document.getElementById('nzbdserver-list');
		sList.removeItemAt(curSel);
		var deck = document.getElementById('nzbdserver-deck-'+serverid);
		deck.parentNode.removeChild(deck);
		sList.moveByOffset(0, true, false);
	},

	changeServerDeck: function()
	{
		var switchTo = document.getElementById('nzbdserver-list').currentIndex;
		document.getElementById('nzbdserver-deck').selectedIndex = switchTo;
	},

	moveLeft: function()
	{
		//
		sList.insertBefore(sList.getSelectedItem(0), sList.getSelectedItem(0).previousSibling);
	},

	moveRight: function()
	{
		try {

		var sList = document.getElementById('nzbdserver-list');
		var curSID = sList.currentIndex;
		if ((curSID + 1) >= nzbdStatusConfig.getPreference('servers.count'))
		{
			return;
		}
		nzbdStatusConfig.activateMovement();
		var sDeck = document.getElementById('nzbdserver-deck');

		sList.insertBefore(sList.getSelectedItem(0).nextSibling, sList.getSelectedItem(0));
		sDeck.insertBefore(sDeck.childNodes[curSID+1], sDeck.childNodes[curSID]);
		nzbdStatusConfig.changeServerDeck();

		var serverOrder = nzbdStatusConfig.getPreference('servers.order').split(',');
		var x = serverOrder[curSID];
		serverOrder[curSID] = serverOrder[curSID+1];
		serverOrder[curSID+1] = x;
		nzbdStatusConfig.setPreference('servers.order', serverOrder.join(','));
		nzbdStatusConfig.inactivateMovement();

		} catch(e) { console.warn(e); }
	},

	testConnection: function(withpass)
	{
		try {

		var serverOrder = nzbdStatusConfig.getPreference('servers.order').split(',');
		var serverid = serverOrder[document.getElementById('nzbdserver-list').currentIndex];
		var connectionText = document.getElementById('nzbdconnectionText-'+serverid);
		var connectionIcon = document.getElementById('nzbdconnectionIcon-'+serverid);
		connectionIcon.src = 'chrome://nzbdstatus/skin/throbber.gif';
		connectionText.value = this.stringsBundle.getString('testActive');

		var serverType = this.getPreference('servers.'+serverid+'.type');
		switch (serverType)
		{
			case 'sabnzbd':
				var serverObject = new sabnzbdServerObject(serverId);
				serverObject.testConnection(this.successResult, this.failureResult);
				break;
		}

		} catch(e) { dump('testConnection threw error `' + e.message + '` on line: ' + e.lineNumber + '\n');}
	},

	successResult: function(serverid, message)
	{
		var connectionText = document.getElementById('nzbdconnectionText-'+serverid);
		var connectionIcon = document.getElementById('nzbdconnectionIcon-'+serverid);
		connectionIcon.src = 'chrome://nzbdstatus/skin/pass.png';
		connectionText.value = message;
	},

	failureResult: function(serverid, message)
	{
		var connectionText = document.getElementById('nzbdconnectionText-'+serverid);
		var connectionIcon = document.getElementById('nzbdconnectionIcon-'+serverid);
		connectionIcon.src = 'chrome://nzbdstatus/skin/fail.png';
		connectionText.value = message;
	},

	testConnectionResponse: function(that, withpass)
	{
		clearTimeout(nzbdStatusConfig.timeout);
		var connectionText = document.getElementById('connectionText');
		var connectionIcon = document.getElementById('connectionIcon');
		if ((that.status == 200) || (that.status == 500))
		{
			if ((that.responseText.search('<title>Login</title>') > -1) || (that.responseText.search('Missing authentication') > -1))
			{
				if (withpass)
				{
					connectionIcon.src = 'chrome://nzbdstatus/skin/error.png';
					connectionText.value = this.stringsBundle.getString('testPasswordFail');
				}
				else
				{
					nzbdStatusConfig.testConnection(true);
				}
			}
			else
			{
				var version = that.responseXML.getElementsByTagName('version')[0].textContent;
				if ((version.split('.')[1] < 4) || ((version.split('.')[1] == 4) && (version.split('.')[2] < 9)))
				{
					connectionIcon.src = 'chrome://nzbdstatus/skin/pass.png';
					connectionText.value = this.stringsBundle.getString('testSuccess');
				}
				else
				{
					nzbdStatusConfig.apiKeyTest(withpass);
				}
			}
		}
		else
		{
			connectionIcon.src = 'chrome://nzbdstatus/skin/fail.png';
			connectionText.value = this.stringsBundle.getString('testFail');
		}
	},

	apiKeyTest: function(withpass)
	{
		var fullUrl = nzbdStatusConfig.getPreference('sabUrl')+'api?mode=get_scripts&output=xml&apikey='+nzbdStatusConfig.getPreference('apikey');
		if (withpass)
		{
			fullUrl += '&ma_username='+nzbdStatusConfig.getPreference('sabusername')+'&ma_password='+nzbdStatusConfig.getPreference('sabpassword');
		}
		var xmldoc = nzbdStatusConfig.xmlHttp;
		xmldoc.open('GET', fullUrl, true);
		xmldoc.onload = function() { nzbdStatusConfig.apiKeyTestResponse(this, withpass); };
		nzbdStatusConfig.timeout = setTimeout(function() { nzbdStatusConfig.abortTest(xmldoc) }, 10000);
		xmldoc.send(null);
	},

	apiKeyTestResponse: function(that, withpass)
	{
		clearTimeout(nzbdStatusConfig.timeout);
		var connectionText = document.getElementById('connectionText');
		var connectionIcon = document.getElementById('connectionIcon');
		if ((that.status == 200) || (that.status == 500))
		{
			if (that.responseText.search('Missing authentication') > -1)
			{
				if (withpass)
				{
					connectionIcon.src = 'chrome://nzbdstatus/skin/error.png';
					connectionText.value = this.stringsBundle.getString('testPasswordFail');
				}
				else
				{
					nzbdStatusConfig.testConnection(true);
				}
			}
			else
			{
				if (that.responseText.search('API Key Required') > -1)
				{
					connectionIcon.src = 'chrome://nzbdstatus/skin/error.png';
					connectionText.value = this.stringsBundle.getString('testAPIKeyMissing');
				}
				else if (that.responseText.search('API Key Incorrect') > -1)
				{
					connectionIcon.src = 'chrome://nzbdstatus/skin/error.png';
					connectionText.value = this.stringsBundle.getString('testAPIKeyWrong');
				}
				else
				{
					connectionIcon.src = 'chrome://nzbdstatus/skin/pass.png';
					connectionText.value = this.stringsBundle.getString('testSuccess');
				}
			}
		}
		else
		{
			connectionIcon.src = 'chrome://nzbdstatus/skin/fail.png';
			connectionText.value = this.stringsBundle.getString('testFail');
		}
	},

	abortTest: function(xmldoc)
	{
		xmldoc.abort();
		var connectionText = document.getElementById('connectionText');
		var connectionIcon = document.getElementById('connectionIcon');
		connectionIcon.src = 'chrome://nzbdstatus/skin/fail.png';
		connectionText.value = this.stringsBundle.getString('testFail');
	},

	updateName: function(e)
	{
		var newLabel = e.target.value;
		var serverId = e.target.getAttribute('preference').match(/nzbdlabel-(\d+)/)[1];
		var serverOrder = nzbdStatusConfig.getPreference('servers.order').split(',');
		document.getElementById('nzbdserver-deck-'+serverId).getElementsByTagName('caption')[0].setAttribute('label', newLabel);
		document.getElementById('nzbdserver-list').getElementsByTagName('listitem')[serverOrder.indexOf(serverId)].setAttribute('label', newLabel);
	}

}

nzbdStatusConfig = new nzbdStatusConfigObject();


function ensureEndSlash()
{
	var _preferences = Components.classes['@mozilla.org/preferences;1']
	 .getService(Components.interfaces.nsIPrefService)
	 .getBranch('extensions.nzbdstatus.');
	var sabUrl = _preferences.getCharPref('sabUrl');
	if (sabUrl[sabUrl.length-1] != '/')
	{
		_preferences.setCharPref('sabUrl', sabUrl + '/');
	}
}

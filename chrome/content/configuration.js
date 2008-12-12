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
		var sList = document.getElementById('nzbdserver-list');
		var serverCount = this.getPreference('servers.count');
		var newListItem;
		for (i = 0; i < serverCount; i++)
		{
			newListItem = document.createElement('listitem');
			newListItem.setAttribute('label', this.getPreference('servers.'+i+'.label'));
			sList.appendChild(newListItem);
		}
		} catch(e) {dump('buildlists error: '+e+'\n'); }
	},

	buildServerDeck: function()
	{
		var serverCount = this.getPreference('servers.count');
		var fav = this.getPreference('servers.favorite');
		for (i = 0; i < serverCount; i++)
		{
			this.addServerDeck(i);
		}
		var favDeck = document.getElementById('nzbdserver-deck-'+fav);
		favDeck.getElementsByTagName('radio')[0].setAttribute('selected', 'true');
	},

	addServerDeck: function(serverId)
	{
		var sDeck = document.getElementById('nzbdserver-deck');
		var sTemplate = document.getElementById('nzbdserver-deck-template');
		var newDeck = sTemplate.cloneNode(true);
		var nAtt;
		newDeck.getElementsByTagName('caption')[0].setAttribute('label', this.getPreference('servers.'+serverId+'.label'));
		newDeck.setAttribute('id', newDeck.id.replace(/template/, serverId));
		var elems = newDeck.getElementsByTagName('radio');
		elems[0].setAttribute('value', serverId);
		elems[0].setAttribute('selected', 'false');
		elems = newDeck.getElementsByClassName('nzbd-updatepref');
		for (j = 0; j < elems.length; j++)
		{
			nAtt = elems[j].getAttribute('preference');
			elems[j].setAttribute('preference', nAtt.replace(/template/, serverId));
		}
		if (document.getElementById('nzbdserver-deck-'+(serverId+1)))
		{
			sDeckInsertBefore(newDeck, document.getElementById('nzbdserver-deck-'+(serverId+1)));
		}
		else
		{
			sDeck.insertBefore(newDeck, sTemplate);
		}
	},

	buildServerPreferences: function()
	{
		var serverCount = this.getPreference('servers.count');
		for (i = 0; i < serverCount; i++)
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
		document.getElementById('nzbdserver-deck-0').getElementsByClassName('goback')[0].setAttribute('disabled', 'true');
		var count = nzbdStatusConfig.getPreference('servers.count');
		document.getElementById('nzbdserver-deck-'+(count-1)).getElementsByClassName('goforward')[0].setAttribute('disabled', 'true');
	},

	addServer: function()
	{
		//
		var curSID = document.getElementById('nzbdserver-list').currentIndex;
		var newSID = curSID + 1;
		var maxSID = nzbdStatusConfig.getPreference('servers.count');
		nzbdStatusConfig.addServerPreferences(newSID);
		nzbdStatusConfig.setPreference('servers.count', maxSID+1);
		nzbdStatusConfig.inactivateMovement();
	},

	removeServer: function()
	{
		//
		nzbdStatusConfig.inactivateMovement();
	},

	changeServerDeck: function()
	{
		var switchTo = document.getElementById('nzbdserver-list').currentIndex;
		document.getElementById('nzbdserver-deck').selectedIndex = switchTo;
	},

	moveLeft: function()
	{
		//
	},

	moveRight: function()
	{
		//
	},

	testConnection: function()
	{
		//
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

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

	prefonload: function()
	{
		try {
		nzbdStatusConfig.buildServerList();
		nzbdStatusConfig.buildServerDeck();
		nzbdStatusConfig.buildServerPreferences();
		// Check to see if we're supposed to open a certain panel
		if (window.arguments && window.arguments.length != 0)
		{
			var selected = document.getElementById(window.arguments[0]);
			document.getElementById('nzbd-prefs').showPane(selected);
		}
		window.sizeToContent();
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
		var sDeck = document.getElementById('nzbdserver-deck');
		var sTemplate = document.getElementById('nzbdserver-deck-template');
		var sPrefs = document.getElementById('nzbdserver-preferences');
		var serverCount = this.getPreference('servers.count');
		var newDeck, elems, nAtt;
		for (i = 0; i < serverCount; i++)
		{
			newDeck = sTemplate.cloneNode(true);
			newDeck.getElementsByTagName('caption')[0].setAttribute('label', this.getPreference('servers.'+i+'.label'));
			elems = newDeck.getElementsByClassName('nzbd-updatepref');
			for (j = 0; j < elems.length; j++)
			{
				nAtt = elems[j].getAttribute('preference');
				elems[j].setAttribute('preference', nAtt.replace(/template/, i));
			}
			elems = newDeck.getElementsByTagName('radio');
			elems[0].setAttribute('value', i);
			sDeck.insertBefore(newDeck, sTemplate);
		}
	},

	buildServerPreferences: function()
	{
		var sPrefs = document.getElementById('nzbdserver-preferences');
		var serverCount = this.getPreference('servers.count');
		var newPref;
		for (i = 0; i < serverCount; i++)
		{
			newPref = document.createElement('preference');
			newPref.setAttribute('id', 'nzbdlabel-'+i);
			newPref.setAttribute('name', 'extensions.nzbdstatus.servers.'+i+'.label');
			newPref.setAttribute('type', 'string');
			sPrefs.appendChild(newPref);
			newPref = document.createElement('preference');
			newPref.setAttribute('id', 'nzbdurl-'+i);
			newPref.setAttribute('name', 'extensions.nzbdstatus.servers.'+i+'.url');
			newPref.setAttribute('type', 'string');
			sPrefs.appendChild(newPref);
			newPref = document.createElement('preference');
			newPref.setAttribute('id', 'nzbdserver-'+i);
			newPref.setAttribute('name', 'extensions.nzbdstatus.servers.'+i+'.type');
			newPref.setAttribute('type', 'string');
			sPrefs.appendChild(newPref);
			newPref = document.createElement('preference');
			newPref.setAttribute('id', 'nzbdicon-'+i);
			newPref.setAttribute('name', 'extensions.nzbdstatus.servers.'+i+'.icon');
			newPref.setAttribute('type', 'string');
			sPrefs.appendChild(newPref);
			newPref = document.createElement('preference');
			newPref.setAttribute('id', 'nzbdshownotif-'+i);
			newPref.setAttribute('name', 'extensions.nzbdstatus.servers.'+i+'.showNotifications');
			newPref.setAttribute('type', 'bool');
			sPrefs.appendChild(newPref);
			newPref = document.createElement('preference');
			newPref.setAttribute('id', 'nzbdenable-'+i);
			newPref.setAttribute('name', 'extensions.nzbdstatus.servers.'+i+'.enable');
			newPref.setAttribute('type', 'bool');
			sPrefs.appendChild(newPref);
			newPref = document.createElement('preference');
			newPref.setAttribute('id', 'nzbdshowstatus-'+i);
			newPref.setAttribute('name', 'extensions.nzbdstatus.servers.'+i+'.showInStatusBar');
			newPref.setAttribute('type', 'bool');
			sPrefs.appendChild(newPref);
		}

	},

	changeServerDeck: function()
	{
		try {
		var switchTo = document.getElementById('nzbdserver-list').currentIndex;
		document.getElementById('nzbdserver-deck').selectedIndex = switchTo;
		} catch(e) {dump('prefonload error: '+e+'\n'); }
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

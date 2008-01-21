function prefonload()
{
	// See if template selector should be enabled
	document.getElementById('sabtheme').disabled = !(document.getElementById('sablegacy').checked);

	// Check to see if we're supposed to open a certain panel
	if (window.arguments.length == 0)
	{
		return;
	}
	var selected = document.getElementById(window.arguments[0]);
	prefwindow.showPane(selected);
}

function legacyClicked()
{
	document.getElementById('sabtheme').disabled = document.getElementById('sablegacy').checked;
}

function ensureEndSlash()
{
	var _preferences = Components.classes['@mozilla.org/preferences;1']
	 .getService(Components.interfaces.nsIPrefService)
	 .getBranch('extensions.sabnzbdstatus.');
	var sabUrl = _preferences.getCharPref('sabUrl');
	if (sabUrl[sabUrl.length-1] != '/')
	{
		_preferences.setCharPref('sabUrl', sabUrl + '/');
	}
}
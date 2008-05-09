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

function preferences()
{
	return Components.classes['@mozilla.org/preferences;1']
	 .getService(Components.interfaces.nsIPrefService)
	 .getBranch('extensions.nzbdstatus.');
}

function addServer()
{
	var serverCount = preferences().getIntPref('servers.count');
	var newServer = document.getElementById('server'+serverCount).cloneNode(true);
	serverCount++;
	newServer.id = 'server' + serverCount;
	var elems = newServer.getElementsByTagName('textbox');
	elems[0].setAttribute('preference', elems[0].getAttribute('preference').replace(serverCount-1, serverCount));
	elems[1].setAttribute('preference', elems[1].getAttribute('preference').replace(serverCount-1, serverCount));
	var elems = newServer.getElementsByTagName('menulist');
	elems[0].setAttribute('preference', elems[0].getAttribute('preference').replace(serverCount-1, serverCount));
	elems[1].setAttribute('preference', elems[1].getAttribute('preference').replace(serverCount-1, serverCount));
	document.getElementById('nzbd-servers').appendChild(newServer);
	window.sizeToContent();
}
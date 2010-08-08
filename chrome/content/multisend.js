function onload()
{
	var servers = window.arguments[0].servers;
	var afterlist = document.getElementById('afterlist');
	for (i = 0; i < servers.length; i++)
	{
		newText = document.createElement('checkbox');
		newText.setAttribute('label', servers[i].label);
		newText.setAttribute('src', 'chrome://nzbdstatus/skin/'+servers[i].icon);
		newText.setAttribute('checked', servers[i].checked);
		newText.setAttribute('id', 'servers'+i);
		afterlist.parentNode.insertBefore(newText, afterlist);
	}
	if (window.arguments[0].type == 'links')
	{
		var sendAllMessage = document.getElementsByClassName('sendall');
		for (i = 0; i < sendAllMessage.length; i++)
		{
			sendAllMessage.setAttribute('hidden', 'false');
		}
	}
	else
	{
		var sendAllMessage = document.getElementsByClassName('download');
		for (i = 0; i < sendAllMessage.length; i++)
		{
			sendAllMessage.setAttribute('hidden', 'false');
		}
	}
}

function onexit()
{
	var chk, servers = window.arguments[0].servers;
	for (i = 0; i < servers.length; i++)
	{
		chk = document.getElementById('servers'+i);
		servers[i].checked = chk.getAttribute('checked');
	}
}

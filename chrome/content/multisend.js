function onload()
{
	var servers = window.arguments[0].servers;
	var afterlist = document.getElementById('afterlist');
	for (i = 0; i < servers.length; i++)
	{
		newText = document.createElement('checkbox');
		newText.setAttribute('label', servers[i].label);
		newText.setAttribute('src', 'chrome://nzbdstatus/skin/'+servers[i].icon);
		afterlist.parentNode.insertBefore(newText, afterlist);
	}
	var sendAllMessage = document.getElementsByClassName('download');
	for (i = 0; i < sendAllMessage.length; i++)
	{
		sendAllMessage.setAttribute('hidden', 'false');
	}
	var sendAllMessage = document.getElementsByClassName('sendall');
	for (i = 0; i < sendAllMessage.length; i++)
	{
		sendAllMessage.setAttribute('hidden', 'false');
	}
}
function onexit()
{
	window.arguments[0].out = {};
}

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
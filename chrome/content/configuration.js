function prefonload()
{
	if (window.arguments.length == 0)
	{
		return;
	}
	var selected = document.getElementById(window.arguments[0]);
	prefwindow.showPane(selected);
}
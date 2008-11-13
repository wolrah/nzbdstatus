pref('extensions.nzbdstatus.disable', false);
pref('extensions.nzbdstatus.refreshRate', 5);
pref('extensions.nzbdstatus.alwaysShowIcon', true);
pref('extensions.nzbdstatus.onlyShowIcon', false);
pref('extensions.nzbdstatus.leftClick', 'refresh');
pref('extensions.nzbdstatus.middleClick', 'newtab');

pref('extensions.nzbdstatus.iconIdle', 'chrome://nzbdstatus/skin/sab.png');
pref('extensions.nzbdstatus.iconDownload', 'chrome://nzbdstatus/skin/download.png');
pref('extensions.nzbdstatus.iconPaused', 'chrome://nzbdstatus/skin/pause.png');

pref('extensions.nzbdstatus.sabUrl', 'http://localhost:8080/sabnzbd/');
pref('extensions.nzbdstatus.queueUrl', 'api?mode=qstatus&output=json');
pref('extensions.nzbdstatus.pauseUrl', 'api?mode=pause');
pref('extensions.nzbdstatus.unpauseUrl', 'api?mode=resume');
pref('extensions.nzbdstatus.historyUrl', 'rss?mode=history');
pref('extensions.nzbdstatus.addUrl', 'api');
pref('extensions.nzbdstatus.addID', 'api');
pref('extensions.nzbdstatus.addFile', 'api');

pref('extensions.nzbdstatus.legacyMode', false);

pref('extensions.nzbdstatus.template', 'None');
pref('extensions.nzbdstatus.sabusername', '');
pref('extensions.nzbdstatus.sabpassword', '');

pref('extensions.nzbdstatus.enableInNewzbin', true);
pref('extensions.nzbdstatus.newzbinToSAB', 3);

pref('extensions.nzbdstatus.enableFilesToServer', true);
pref('extensions.nzbdstatus.filesToSAB', 3);

pref('extensions.nzbdstatus.editorMode', false);

pref('extensions.nzbdstatus.servers.count', 5);
pref('extensions.nzbdstatus.servers.favorite', 0);

pref('extensions.nzbdstatus.servers.retryLimit', 3);
pref('extensions.nzbdstatus.servers.timeoutSecs', 15000);

pref('extensions.nzbdstatus.servers.0.url', 'http://localhost:8080/sabnzbd/');
pref('extensions.nzbdstatus.servers.0.label', 'Home');
pref('extensions.nzbdstatus.servers.0.type', 'sabnzbd+');
pref('extensions.nzbdstatus.servers.0.icon', 'yellow');

pref('extensions.nzbdstatus.servers.1.url', 'http://localhost:8080/sabnzbd/');
pref('extensions.nzbdstatus.servers.1.label', 'Home');
pref('extensions.nzbdstatus.servers.1.type', 'sabnzbd+');
pref('extensions.nzbdstatus.servers.1.icon', 'yellow');

pref('extensions.nzbdstatus.servers.2.url', 'http://dq5.no-ip.info:8080/sabnzbd/');
pref('extensions.nzbdstatus.servers.2.label', 'Work');
pref('extensions.nzbdstatus.servers.2.type', 'sabnzbd+');
pref('extensions.nzbdstatus.servers.2.icon', 'yellow');

pref('extensions.nzbdstatus.servers.3.url', 'http://192.168.1.100:8080/sabnzbd/');
pref('extensions.nzbdstatus.servers.3.label', 'NAS');
pref('extensions.nzbdstatus.servers.3.type', 'sabnzbd+');
pref('extensions.nzbdstatus.servers.3.icon', 'yellow');

pref('extensions.nzbdstatus.servers.4.url', 'http://dq5.no-ip.info:8080/sabnzbd/');
pref('extensions.nzbdstatus.servers.4.label', 'Test');
pref('extensions.nzbdstatus.servers.4.type', 'sabnzbd+');
pref('extensions.nzbdstatus.servers.4.icon', 'yellow');

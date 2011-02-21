pref('extensions.nzbdstatus.disable', false);
pref('extensions.nzbdstatus.refreshRate', 1);
pref('extensions.nzbdstatus.alwaysShowIcon', true);
pref('extensions.nzbdstatus.onlyShowIcon', false);
pref('extensions.nzbdstatus.leftClick', 'refresh');
pref('extensions.nzbdstatus.middleClick', 'newtab');
pref('extensions.nzbdstatus.prompt.sendFile', true);
pref('extensions.nzbdstatus.prompt.sendMulti', true);

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

pref('extensions.nzbdstatus.enableInNewzbin', true);
pref('extensions.nzbdstatus.newzbinToSAB', 3);

pref('extensions.nzbdstatus.enableFilesToServer', true);
pref('extensions.nzbdstatus.filesToSAB', 3);

pref('extensions.nzbdstatus.editorMode', false);
pref('extensions.nzbdstatus.showErrors', false);
pref('extensions.nzbdstatus.errorMode', 0);
pref('extensions.nzbdstatus.showLogger', false);
pref('extensions.nzbdstatus.loggerMode', 0);
pref('extensions.nzbdstatus.addFeedHandler', true);
pref('extensions.nzbdstatus.servers.importOldSettings', true);

pref('extensions.nzbdstatus.servers.count', 5);
pref('extensions.nzbdstatus.servers.order', '0,1,2,3,4');
pref('extensions.nzbdstatus.servers.favorite', 0);

pref('extensions.nzbdstatus.servers.retryLimit', 3);
pref('extensions.nzbdstatus.servers.timeoutSecs', 15);

pref('extensions.nzbdstatus.servers.0.enable', true);
pref('extensions.nzbdstatus.servers.0.showNotifications', true);
pref('extensions.nzbdstatus.servers.0.showInStatusBar', true);
pref('extensions.nzbdstatus.servers.0.label', 'Server 1');
pref('extensions.nzbdstatus.servers.0.url', 'http://localhost:8080/sabnzbd/');
pref('extensions.nzbdstatus.servers.0.apikey', '');
pref('extensions.nzbdstatus.servers.0.username', '');
pref('extensions.nzbdstatus.servers.0.password', '');
pref('extensions.nzbdstatus.servers.0.type', 'sabnzbd');
pref('extensions.nzbdstatus.servers.0.icon', 'flag_blue.png');

pref('extensions.nzbdstatus.servers.1.enable', true);
pref('extensions.nzbdstatus.servers.1.showNotifications', true);
pref('extensions.nzbdstatus.servers.1.showInStatusBar', true);
pref('extensions.nzbdstatus.servers.1.label', 'Server 2');
pref('extensions.nzbdstatus.servers.1.url', 'http://localhost:8080/sabnzbd/');
pref('extensions.nzbdstatus.servers.1.apikey', '');
pref('extensions.nzbdstatus.servers.1.username', '');
pref('extensions.nzbdstatus.servers.1.password', '');
pref('extensions.nzbdstatus.servers.1.type', 'sabnzbd');
pref('extensions.nzbdstatus.servers.1.icon', 'flag_green.png');

pref('extensions.nzbdstatus.servers.2.enable', true);
pref('extensions.nzbdstatus.servers.2.showNotifications', true);
pref('extensions.nzbdstatus.servers.2.showInStatusBar', true);
pref('extensions.nzbdstatus.servers.2.label', 'Server 3');
pref('extensions.nzbdstatus.servers.2.url', 'http://localhost:8080/sabnzbd/');
pref('extensions.nzbdstatus.servers.2.apikey', '');
pref('extensions.nzbdstatus.servers.2.username', '');
pref('extensions.nzbdstatus.servers.2.password', '');
pref('extensions.nzbdstatus.servers.2.type', 'sabnzbd');
pref('extensions.nzbdstatus.servers.2.icon', 'flag_orange.png');

pref('extensions.nzbdstatus.servers.3.enable', true);
pref('extensions.nzbdstatus.servers.3.showNotifications', true);
pref('extensions.nzbdstatus.servers.3.showInStatusBar', true);
pref('extensions.nzbdstatus.servers.3.label', 'Server 4');
pref('extensions.nzbdstatus.servers.3.url', 'http://localhost:8080/sabnzbd/');
pref('extensions.nzbdstatus.servers.3.apikey', '');
pref('extensions.nzbdstatus.servers.3.username', '');
pref('extensions.nzbdstatus.servers.3.password', '');
pref('extensions.nzbdstatus.servers.3.type', 'sabnzbd');
pref('extensions.nzbdstatus.servers.3.icon', 'flag_pink.png');

pref('extensions.nzbdstatus.servers.4.enable', true);
pref('extensions.nzbdstatus.servers.4.showNotifications', true);
pref('extensions.nzbdstatus.servers.4.showInStatusBar', true);
pref('extensions.nzbdstatus.servers.4.label', 'Server 5');
pref('extensions.nzbdstatus.servers.4.url', 'http://localhost:8080/sabnzbd/');
pref('extensions.nzbdstatus.servers.4.apikey', '');
pref('extensions.nzbdstatus.servers.4.username', '');
pref('extensions.nzbdstatus.servers.4.password', '');
pref('extensions.nzbdstatus.servers.4.type', 'sabnzbd');
pref('extensions.nzbdstatus.servers.4.icon', 'flag_purple.png');

pref('extensions.nzbdstatus.category.0.anime', 'anime');
pref('extensions.nzbdstatus.category.0.apps', 'apps');
pref('extensions.nzbdstatus.category.0.console', 'consoles');
pref('extensions.nzbdstatus.category.0.documentaries', 'movies');
pref('extensions.nzbdstatus.category.0.games', 'games');
pref('extensions.nzbdstatus.category.0.movies', 'movies');
pref('extensions.nzbdstatus.category.0.music', 'music');
pref('extensions.nzbdstatus.category.0.pc', 'apps');
pref('extensions.nzbdstatus.category.0.tv', 'tv');
pref('extensions.nzbdstatus.category.0.xxx', 'xxx');
pref('extensions.nzbdstatus.category.0.other', 'misc');
pref('extensions.nzbdstatus.category.avail', '{"categories":["None","anime","apps","books","consoles","emulation","games","misc","movies","music","tv","xxx"]}');

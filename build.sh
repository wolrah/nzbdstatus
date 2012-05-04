#!/bin/bash
TIMESTAMP=`date -u +%Y%m%d%H%M%S`
VERSION=`sed -n -e 's/.*<em:version>\(.*\)<\/em:version>.*/\1/p' install.rdf`

7z a -tzip nzbdstatus-$VERSION-$TIMESTAMP.xpi * -r -mx=9 -xr\!.git -xr\!.svn -x\!\*.bat -x\!\*.sh -x\!\*.xpi -x\!\*~ -x\!\*.svg

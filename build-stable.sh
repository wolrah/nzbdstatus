#!/bin/bash
mv install-stable.rdf install.rdf
7z a -tzip nzbdstatus-stable.xpi * -r -mx=9 -xr\!.svn -x\!\*.bat -x\!\*.sh -x\!\*.xpi
mv install.rdf install-stable.rdf